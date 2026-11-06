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

export type ScreenComponent2D = import('@visualtwin/schema').ScreenDocument['components2d'][number]
export type ScreenComponentType = ScreenComponent2D['type']
export const screenRegistry: Record<ScreenComponentType, { name: string, category: string, schemaRef: string, create: (id: string) => ScreenComponent2D }> = {
  ...registry,
  'screen.border': { name: '科技边框', category: '边框与装饰', schemaRef: '#/definitions/screen_border', create: id => ({ ...structuredClone(common), id, type: 'screen.border', name: '科技边框', props: { variant: 'corners', color: '#56c8ff', thickness: 2, title: '数据标题', backgroundOpacity: 0.1 } }) },
  'screen.decoration': { name: '装饰线条', category: '边框与装饰', schemaRef: '#/definitions/screen_decoration', create: id => ({ ...structuredClone(common), id, type: 'screen.decoration', name: '装饰线条', layout: { ...common.layout, width: 400, height: 48 }, props: { variant: 'tech', color: '#56c8ff', thickness: 2, vertical: false } }) },
  'screen.table': { name: '滚动表格', category: '表格', schemaRef: '#/definitions/screen_table', create: id => ({ ...structuredClone(common), id, type: 'screen.table', name: '滚动表格', props: { columns: [{ title: '名称', width: 2 }, { title: '数值', width: 1 }, { title: '状态', width: 1 }], rows: [['设备 A', 72, '正常'], ['设备 B', 86, '正常'], ['设备 C', 54, '维护'], ['设备 D', 91, '正常'], ['设备 E', 63, '正常'], ['设备 F', 77, '正常']], headerHeight: 40, rowHeight: 36, fontSize: 16, color: '#e3f4ff', headerBackground: '#164363', rowBackground: '#10283d', alternateBackground: '#18374f', speed: 24, paused: false } }) }
}
