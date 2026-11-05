import type { SceneDocument } from '@visualtwin/schema'

export type Component2D = SceneDocument['components2d'][number]
export type ComponentType = Component2D['type']
const source: [['category', 'value'], ...[string, number][]] = [['category', 'value'], ['一月', 42], ['二月', 65], ['三月', 50]]
const common = { visible: true, layout: { x: 100, y: 100, width: 440, height: 280, zIndex: 1 }, style: { background: '#17283b', opacity: 0.95 } }
const chart = () => ({ title: '数据统计', color: '#4e9bff', legend: true, axis: true, source: source.map(row => [...row]) as typeof source })
export const registry: Record<ComponentType, { name: string, category: string, schemaRef: string, create: (id: string) => Component2D }> = {
  'chart.bar': { schemaRef: '#/definitions/component_bar', name: '柱状图', category: '图表', create: id => ({ ...structuredClone(common), id, type: 'chart.bar', name: '柱状图', props: chart() }) },
  'chart.line': { schemaRef: '#/definitions/component_line', name: '折线图', category: '图表', create: id => ({ ...structuredClone(common), id, type: 'chart.line', name: '折线图', props: chart() }) },
  'chart.pie': { schemaRef: '#/definitions/component_pie', name: '饼图', category: '图表', create: id => ({ ...structuredClone(common), id, type: 'chart.pie', name: '饼图', props: chart() }) },
  'widget.number': { schemaRef: '#/definitions/component_number', name: '数字指标卡', category: '基础', create: id => ({ ...structuredClone(common), id, type: 'widget.number', name: '数字指标卡', layout: { ...common.layout, width: 320, height: 160 }, props: { title: '累计产量', value: 1280, unit: '件', color: '#63b3ff', decimals: 0 } }) },
  'widget.text': { schemaRef: '#/definitions/component_text', name: '文本', category: '基础', create: id => ({ ...structuredClone(common), id, type: 'widget.text', name: '文本', layout: { ...common.layout, width: 400, height: 100 }, props: { text: '可视化标题', fontSize: 32, fontWeight: 700, color: '#ffffff', align: 'center' } }) }
}
