import { eventRegistry, type SceneDocument } from '@visualtwin/schema'

type Rule = SceneDocument['events'][number]
type Action = Rule['actions'][number]
export class EventRuntime {
  readonly visibility: Record<string, boolean> = Object.create(null) as Record<string, boolean>
  readonly highlights: Record<string, number> = Object.create(null) as Record<string, number>
  error = ''
  private running = false
  private disposed = false
  constructor(private document: () => SceneDocument, private notify: () => void) {}
  dispatch(sourceId: string, event: string, payload: { dataIndex?: number } = {}) {
    if (this.disposed) return
    if (this.running) { this.error = '事件递归已阻止'; return }
    const doc = this.document()
    const source = doc.components2d.find(item => item.id === sourceId) ?? doc.scene3d.nodes.find(node => node.id === sourceId)
    if (!source || !eventRegistry[source.type]?.events.includes(event)) { this.error = `事件来源无效：${sourceId}`; this.notify(); return }
    if (source.type === 'chart.bar' && (!Number.isInteger(payload.dataIndex) || payload.dataIndex! < 0 || payload.dataIndex! >= source.props.source.length - 1)) { this.error = `图表事件数据索引无效：${sourceId}`; this.notify(); return }
    this.running = true; this.error = ''
    try {
      let count = 0
      for (const rule of doc.events) {
        if (rule.sourceId !== sourceId || rule.event !== event) continue
        for (const action of rule.actions) {
          if (++count > 100) { this.error = '事件动作数量超过限制'; return }
          this.execute(doc, action)
        }
      }
    } finally { try { this.notify() } finally { this.running = false } }
  }
  private execute(doc: SceneDocument, action: Action) {
    const target = doc.components2d.find(item => item.id === action.targetId) ?? doc.scene3d.nodes.find(node => node.id === action.targetId)
    if (!target || !eventRegistry[target.type]?.actions.includes(action.type)) { this.error = `事件目标无效：${action.targetId}`; return }
    if (action.type === 'chart.highlight') {
      if (target.type !== 'chart.bar' || !Number.isInteger(action.params.dataIndex) || action.params.dataIndex < 0 || action.params.dataIndex >= target.props.source.length - 1) { this.error = `图表 ${action.targetId} 的高亮索引越界`; return }
      this.highlights[action.targetId] = action.params.dataIndex
    } else if (action.type === 'node.setVisible' && typeof action.params.visible === 'boolean') this.visibility[action.targetId] = action.params.visible
    else this.error = `事件动作参数无效：${action.targetId}`
  }
  dispose() { this.disposed = true; for (const key of Object.keys(this.visibility)) delete this.visibility[key]; for (const key of Object.keys(this.highlights)) delete this.highlights[key] }
}
