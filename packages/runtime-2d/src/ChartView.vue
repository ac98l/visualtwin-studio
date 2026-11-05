<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { DatasetComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { Component2D } from './registry'

echarts.use([BarChart, LineChart, PieChart, DatasetComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer])
type Chart = Extract<Component2D, { type: `chart.${string}` }>
const props = defineProps<{ component: Chart, highlightIndex?: number }>()
const emit = defineEmits<{ chartClick: [dataIndex: number] }>()
const element = ref<HTMLDivElement>()
let instance: echarts.ECharts | undefined
let observer: ResizeObserver | undefined
function update() {
  const item = props.component
  const chartType = item.type.slice(6) as 'bar' | 'line' | 'pie'
  const axis = chartType === 'pie' ? {} : { xAxis: { type: 'category', show: item.props.axis }, yAxis: { type: 'value', show: item.props.axis }, grid: { top: 60, bottom: 35, left: 55, right: 20 } }
  const series = chartType === 'pie' ? [{ type: 'pie', radius: '55%', encode: { itemName: 'category', value: 'value' } }] : [{ type: chartType, encode: { x: 'category', y: 'value' }, emphasis: { itemStyle: { color: '#ffb020' } } }]
  instance?.setOption({ color: [item.props.color], title: { text: item.props.title, textStyle: { color: '#edf6ff', fontSize: 16 } }, legend: { show: item.props.legend, textStyle: { color: '#d4e4f4' }, bottom: 0 }, tooltip: {}, dataset: { source: item.props.source }, ...axis, series } as echarts.EChartsCoreOption, true)
  highlight()
}
function highlight() {
  instance?.dispatchAction({ type: 'downplay', seriesIndex: 0 })
  if (props.component.type === 'chart.bar' && props.highlightIndex !== undefined && props.highlightIndex >= 0 && props.highlightIndex < props.component.props.source.length - 1) instance?.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: props.highlightIndex })
}
onMounted(() => {
  if (!element.value) return
  instance = echarts.init(element.value)
  instance.on('click', params => { if (props.component.type === 'chart.bar' && params.componentType === 'series' && Number.isInteger(params.dataIndex)) emit('chartClick', params.dataIndex) })
  update()
  observer = new ResizeObserver(() => instance?.resize())
  observer.observe(element.value)
})
watch(() => props.component, update, { deep: true })
watch(() => props.highlightIndex, highlight)
onBeforeUnmount(() => { observer?.disconnect(); instance?.off('click'); instance?.dispose(); instance = undefined })
</script>
<template><div ref="element" class="chart-view"></div></template>
<style scoped>.chart-view{width:100%;height:100%}</style>
