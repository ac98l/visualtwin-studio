import Ajv from 'ajv'
import schema from './scene.schema.json'
import sample from '../examples/scene.json'
import sample2d from '../examples/scene2d.json'
import sampleP6 from '../examples/scene-p6.json'
import type { SceneDocument } from './generated'
import { eventRegistry } from './event-registry'

export type { SceneDocument } from './generated'
export { eventRegistry } from './event-registry'

const validate = new Ajv({ allErrors: true, strict: false, strictNumbers: true }).compile<SceneDocument>(schema)

function validStaticJson(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  const valid = (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype) && Object.entries(value).every(([key, entry]) => !/^(token|secret|password|api[_-]?key|authorization)$/i.test(key) && validStaticJson(entry, seen))
  seen.delete(value)
  return valid
}

export function parseScene(input: unknown): SceneDocument {
  let value: unknown = input
  if (typeof input === 'string') {
    try { value = JSON.parse(input) } catch { throw new Error('场景 JSON 格式无效') }
  }
  // 兼容 P3 开发期间使用过的 model.glb 命名，统一迁移为 model.gltf。
  if (value && typeof value === 'object' && 'scene3d' in value) {
    const root = value as Record<string, unknown>
    const scene = root.scene3d
    if (scene && typeof scene === 'object' && 'nodes' in scene && Array.isArray(scene.nodes) && scene.nodes.some(node => node && typeof node === 'object' && node.type === 'model.glb')) {
      value = { ...root, scene3d: { ...scene, nodes: scene.nodes.map(node => node && typeof node === 'object' && node.type === 'model.glb' ? { ...node, type: 'model.gltf' } : node) } }
    }
  }
  if (!validate(value)) {
    throw new Error(`场景校验失败：${validate.errors?.map(error => `${error.instancePath || '/'} ${error.message}`).join('；')}`)
  }
  const { camera, nodes } = value.scene3d
  if (camera.far <= camera.near) throw new Error('/scene3d/camera/far 必须大于 near')
  const ids = new Set([value.id])
  for (const asset of value.assets) {
    if (ids.has(asset.id)) throw new Error(`重复 ID：${asset.id}`)
    ids.add(asset.id)
  }
  const assets = new Set(value.assets.map(asset => asset.id))
  for (const node of nodes) {
    if (node.type === 'model.gltf' && !assets.has(node.props.assetId)) throw new Error(`模型 ${node.id} 引用的资产不存在：${node.props.assetId}`)
    if (ids.has(node.id)) throw new Error(`重复 ID：${node.id}`)
    ids.add(node.id)
    if (node.transform.scale.some(part => part === 0)) throw new Error(`/scene3d/nodes/${node.id}/transform/scale 不可为零`)
  }
  for (const component of value.components2d) {
    if (ids.has(component.id)) throw new Error(`重复 ID：${component.id}`)
    ids.add(component.id)
    if (component.type === 'chart.pie' && component.props.source.slice(1).some(row => typeof row[1] === 'number' && row[1] < 0)) throw new Error(`饼图 ${component.id} 的数据不能为负数`)
  }
  for (const source of value.dataSources) {
    if (ids.has(source.id)) throw new Error(`重复 ID：${source.id}`)
    ids.add(source.id)
    if (source.type === 'http') {
      if (source.intervalMs !== 0 && source.intervalMs < 1000) throw new Error(`数据源 ${source.id} 的刷新间隔至少为 1000 毫秒`)
      let url: URL
      try { url = new URL(source.url, 'https://visualtwin.invalid/') } catch { throw new Error(`数据源 ${source.id} 的 URL 无效`) }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || [...url.searchParams.keys()].some(key => /token|secret|password|api[_-]?key|authorization|credential|access[_-]?key/i.test(key))) throw new Error(`数据源 ${source.id} 的 URL 不允许包含凭证、片段或非 HTTP 协议`)
    } else {
      if (!validStaticJson(source.value)) throw new Error(`数据源 ${source.id} 的静态数据必须是无凭证的有效 JSON`)
    }
  }
  const sources = new Set(value.dataSources.map(source => source.id))
  const targets = new Set<string>()
  for (const binding of value.bindings) {
    if (ids.has(binding.id)) throw new Error(`重复 ID：${binding.id}`)
    ids.add(binding.id)
    if (!sources.has(binding.sourceId)) throw new Error(`绑定 ${binding.id} 的数据源不存在：${binding.sourceId}`)
    const target = value.components2d.find(item => item.id === binding.targetId) ?? nodes.find(item => item.id === binding.targetId)
    if (!target) throw new Error(`绑定 ${binding.id} 的目标不存在：${binding.targetId}`)
    if (!((['chart.bar', 'chart.line', 'chart.pie'].includes(target.type) && ['source', 'title'].includes(binding.property)) || (target.type === 'primitive.box' && binding.property === 'color') || (target.type === 'widget.text' && binding.property === 'text') || (target.type === 'widget.number' && binding.property === 'value'))) throw new Error(`绑定 ${binding.id} 的目标属性不允许绑定`)
    const key = `${binding.targetId}\u0000${binding.property}`
    if (targets.has(key)) throw new Error(`目标属性重复绑定：${binding.targetId}/${binding.property}`)
    targets.add(key)
  }
  for (const rule of value.events) {
    if (ids.has(rule.id)) throw new Error(`重复 ID：${rule.id}`)
    ids.add(rule.id)
    const source = value.components2d.find(item => item.id === rule.sourceId) ?? nodes.find(item => item.id === rule.sourceId)
    if (!source) throw new Error(`事件 ${rule.id} 的来源不存在：${rule.sourceId}`)
    if (!eventRegistry[source.type]?.events.includes(rule.event)) throw new Error(`事件 ${rule.id} 的来源不支持 ${rule.event}`)
    for (const action of rule.actions) {
      const target = value.components2d.find(item => item.id === action.targetId) ?? nodes.find(item => item.id === action.targetId)
      if (!target) throw new Error(`事件 ${rule.id} 的目标不存在：${action.targetId}`)
      if (!eventRegistry[target.type]?.actions.includes(action.type)) throw new Error(`事件 ${rule.id} 的目标不支持 ${action.type}`)
    }
  }
  const byId = new Map(nodes.map(node => [node.id, node]))
  for (const node of nodes) {
    const visited = new Set([node.id])
    let parentId = node.parentId
    while (parentId !== null) {
      if (visited.has(parentId)) throw new Error(`节点父子关系存在循环：${node.id}`)
      visited.add(parentId)
      const parent = byId.get(parentId)
      if (!parent) throw new Error(`节点 ${node.id} 的父节点不存在：${parentId}`)
      parentId = parent.parentId
    }
  }
  return value
}

export const exampleScene = parseScene(sample)

export const exampleScene2d = parseScene(sample2d)
export const exampleSceneP6 = parseScene(sampleP6)

export type { ScreenDocument } from './screen-generated'
export { createScreen, parseScreen, parseDocument } from './screen'
