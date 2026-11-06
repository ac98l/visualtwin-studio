import type { SceneDocument, ScreenDocument } from '@visualtwin/schema'

type Source = SceneDocument['dataSources'][number]
type Binding = SceneDocument['bindings'][number]

export function resolvePointer(value: unknown, path: string): unknown {
  if (path === '') return value
  if (!/^(?:\/(?:[^~/]|~[01])*)*$/.test(path)) throw new Error(`JSON Pointer 无效：${path}`)
  return path.slice(1).split('/').reduce<unknown>((current, segment) => {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~')
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key) || (Array.isArray(current) && !/^(0|[1-9]\d*)$/.test(key))) throw new Error(`路径不存在：${path}`)
    return (current as Record<string, unknown>)[key]
  }, value)
}

function validValue(property: Binding['property'], value: unknown) {
  if (property === 'title') return typeof value === 'string'
  if (property === 'color') return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
  return Array.isArray(value) && value.length > 0 && Array.isArray(value[0]) && value[0].length === 2 && value[0][0] === 'category' && value[0][1] === 'value' && value.slice(1).every(row => Array.isArray(row) && row.length === 2 && typeof row[0] === 'string' && typeof row[1] === 'number' && Number.isFinite(row[1]))
}

export class DataRuntime {
  private stopped = false
  private controllers = new Set<AbortController>()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private versions = new Map<string, number>()
  private polls = new Map<string, ReturnType<typeof setTimeout>>()
  private active = new Map<string, AbortController>()
  readonly values = new Map<string, unknown>()
  readonly errors = new Map<string, string>()
  constructor(private sources: Source[], private bindings: Binding[], private notify: () => void, private fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  start() { for (const source of this.sources) if (this.bindings.some(binding => binding.sourceId === source.id)) void this.refresh(source) }
  async refresh(source: Source): Promise<void> {
    if (this.stopped) return
    const scheduled = this.polls.get(source.id)
    if (scheduled) { clearTimeout(scheduled); this.timers.delete(scheduled); this.polls.delete(source.id) }
    this.active.get(source.id)?.abort()
    const version = (this.versions.get(source.id) ?? 0) + 1
    this.versions.set(source.id, version)
    let controller: AbortController | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      let value: unknown
      if (source.type === 'static') value = source.value
      else {
        controller = new AbortController(); this.controllers.add(controller); this.active.set(source.id, controller)
        const active = controller
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { if (timer) this.timers.delete(timer); reject(new Error('请求超时')); active.abort() }, source.timeoutMs); this.timers.add(timer) })
        const response = await Promise.race([this.fetcher(source.url, { method: 'GET', signal: controller.signal, credentials: 'omit' }), timeout])
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        value = await Promise.race([response.json(), timeout])
      }
      if (this.stopped || this.versions.get(source.id) !== version) return
      this.errors.delete(source.id)
      for (const binding of this.bindings.filter(item => item.sourceId === source.id)) {
        try {
          const mapped = resolvePointer(value, binding.path)
          if (!validValue(binding.property, mapped)) throw new Error(`属性 ${binding.property} 的数据类型不匹配`)
          this.values.set(binding.id, JSON.parse(JSON.stringify(mapped))); this.errors.delete(binding.id)
        } catch (error) { this.errors.set(binding.id, `绑定 ${binding.id}：${error instanceof Error ? error.message : String(error)}`) }
      }
      this.notify()
    } catch (error) {
      if (!this.stopped && this.versions.get(source.id) === version) { this.errors.set(source.id, `数据源 ${source.id}：${error instanceof Error ? error.message : String(error)}`); this.notify() }
    } finally {
      if (timer) { clearTimeout(timer); this.timers.delete(timer) }
      if (controller) { this.controllers.delete(controller); if (this.active.get(source.id) === controller) this.active.delete(source.id) }
      if (!this.stopped && this.versions.get(source.id) === version && source.type === 'http' && source.intervalMs > 0) {
        const next = setTimeout(() => { this.timers.delete(next); this.polls.delete(source.id); void this.refresh(source) }, source.intervalMs)
        this.timers.add(next); this.polls.set(source.id, next)
      }
    }
  }
  dispose() { this.stopped = true; this.controllers.forEach(controller => controller.abort()); this.controllers.clear(); this.active.clear(); this.timers.forEach(clearTimeout); this.timers.clear(); this.polls.clear() }
}

export function applyBindings<T extends SceneDocument | ScreenDocument>(document: T, values: Map<string, unknown>): T {
  const result = JSON.parse(JSON.stringify(document)) as T
  for (const binding of document.bindings) {
    const value = values.has(binding.id) ? values.get(binding.id) : binding.property === 'source' ? [['category', 'value']] : undefined
    if (value === undefined) continue
    const target = result.components2d.find(item => item.id === binding.targetId) ?? ('scene3d' in result ? result.scene3d.nodes.find(item => item.id === binding.targetId) : undefined)
    if (target?.type === 'chart.bar' && binding.property === 'title' && typeof value === 'string') target.props.title = value
    else if (target?.type === 'chart.bar' && binding.property === 'source' && validValue('source', value)) target.props.source = value as typeof target.props.source
    else if (target?.type === 'primitive.box' && binding.property === 'color' && typeof value === 'string') target.props.color = value
  }
  return result
}


export { EventRuntime } from './events'
