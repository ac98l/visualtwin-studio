import Ajv from 'ajv'
import schema from './screen.schema.json'
import sceneSchema from './scene.schema.json'
import sceneExample from '../examples/scene.json'
import type { ScreenDocument } from './screen-generated'
import type { SceneDocument } from './generated'
import { eventRegistry, parseScene } from './index'

const validate = new Ajv({ allErrors: true, strict: false, strictNumbers: true }).addSchema(sceneSchema, 'packages/schema/src/scene.schema.json').compile<ScreenDocument>(schema)
export function parseScreen(input: unknown): ScreenDocument {
  let value = input
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { throw new Error('大屏 JSON 格式无效') }
  }
  if (!validate(value)) throw new Error(`大屏校验失败：${validate.errors?.map(error => `${error.instancePath || '/'} ${error.message}`).join('；')}`)
  if (!value.name.trim() || !value.id.trim()) throw new Error('大屏名称和 ID 不能为空')
  const ids = new Set([value.id])
  for (const item of value.components2d) {
    if (ids.has(item.id)) throw new Error(`重复 ID：${item.id}`)
    ids.add(item.id)
    if (item.layout.width < 40 || item.layout.height < 40) throw new Error(`组件 ${item.id} 宽高不能小于 40`)
    if (item.type === 'chart.pie' && item.props.source.slice(1).some(row => typeof row[1] === 'number' && row[1] < 0)) throw new Error(`饼图 ${item.id} 的数据不能为负数`)
    if (item.type === 'screen.table' && (item.props.columns.length > 20 || item.props.rows.length > 500 || item.props.rows.some(row => row.length > item.props.columns.length))) throw new Error(`表格 ${item.id} 的列数或行数超限，或数据列数超过定义`)
  }
  // 复用 SceneDocument 的数据源、绑定白名单及语义校验，背景不参与大屏数据绑定。
  parseScene({ ...sceneExample, id: value.id, name: value.name, canvas: { width: value.canvas.width, height: value.canvas.height, background: value.canvas.background }, scene3d: { ...sceneExample.scene3d, nodes: [] }, assets: [], components2d: value.components2d.filter((item): item is SceneDocument['components2d'][number] => !item.type.startsWith('screen.')), dataSources: value.dataSources, bindings: value.bindings, events: [] })
  for (const source of value.dataSources) { if (ids.has(source.id)) throw new Error(`重复 ID：${source.id}`); ids.add(source.id) }
  for (const binding of value.bindings) { if (ids.has(binding.id)) throw new Error(`重复 ID：${binding.id}`); ids.add(binding.id) }
  const lookup = (ref: { scope: 'background' | 'foreground', id: string }) => ref.scope === 'foreground' ? value.components2d.find(item => item.id === ref.id) : value.background.type === 'scene' ? value.background.scene.scene3d.nodes.find(item => item.id === ref.id) : undefined
  for (const rule of value.events) {
    if (ids.has(rule.id)) throw new Error(`重复 ID：${rule.id}`)
    ids.add(rule.id)
    const source = lookup(rule.source)
    if (!source || !eventRegistry[source.type]?.events.includes(rule.event)) throw new Error(`事件 ${rule.id} 的来源不存在或不支持点击：${rule.source.scope}/${rule.source.id}`)
    for (const action of rule.actions) {
      const target = lookup(action.target)
      if (!target || !eventRegistry[target.type]?.actions.includes(action.type)) throw new Error(`事件 ${rule.id} 的目标不存在或不支持动作：${action.target.scope}/${action.target.id}`)
      if ((rule.source.scope === 'background' && (action.target.scope !== 'foreground' || action.type !== 'chart.highlight')) || (rule.source.scope === 'foreground' && (action.target.scope !== 'background' || action.type !== 'node.setVisible'))) throw new Error(`事件 ${rule.id} 仅支持跨层联动`)
    }
  }
  const components = new Set(value.components2d.map(item => item.id))
  for (const id of Object.keys(value.rotations ?? {})) if (!components.has(id)) throw new Error(`旋转组件不存在：${id}`)
  const grouped = new Set<string>()
  for (const group of value.groups ?? []) {
    if (!group.id.trim() || !group.name.trim() || ids.has(group.id)) throw new Error(`组合名称无效或 ID 重复：${group.id}`)
    ids.add(group.id)
    for (const id of group.memberIds) {
      if (!components.has(id)) throw new Error(`组合成员不存在：${id}`)
      if (grouped.has(id)) throw new Error(`组件不能属于多个组合：${id}`)
      grouped.add(id)
    }
  }
  if (value.background.type === 'scene') return { ...value, background: { type: 'scene', scene: parseScene(value.background.scene) } }
  return value
}
export function parseDocument(input: unknown) {
  let value = input
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { throw new Error('文档 JSON 格式无效') }
  }
  if (value && typeof value === 'object' && 'documentType' in value) {
    if (value.documentType !== 'screen') throw new Error('不支持的文档类型')
    return { kind: 'screen' as const, document: parseScreen(value) }
  }
  return { kind: 'scene' as const, document: parseScene(value) }
}
export function createScreen(): ScreenDocument {
  return { documentType: 'screen', schemaVersion: 1, id: crypto.randomUUID(), name: '未命名大屏', canvas: { width: 1920, height: 1080, background: '#101b2b', fit: 'contain' }, background: { type: 'none' }, components2d: [], dataSources: [], bindings: [], events: [] }
}
