<script setup lang="ts">
import type { Component2D } from '@visualtwin/runtime-2d'
const props = defineProps<{ item: Component2D }>()
const emit = defineEmits<{ change: [item: Component2D], error: [message: string], duplicate: [], remove: [] }>()
function change(fn: (item: Component2D) => void) {
  const item = JSON.parse(JSON.stringify(props.item)) as Component2D
  fn(item); emit('change', item)
}
function text(event: Event) { return (event.target as HTMLInputElement).value }
function number(event: Event) { return (event.target as HTMLInputElement).valueAsNumber }
function checked(event: Event) { return (event.target as HTMLInputElement).checked }
function chartData(event: Event) {
  try {
    const source = JSON.parse((event.target as HTMLTextAreaElement).value)
    change(item => { if (item.type.startsWith('chart.') && 'source' in item.props) item.props.source = source })
  } catch { emit('error', '静态数据须为合法 JSON 数组') }
}
</script>
<template>
  <div class="property-form">
    <label>名称<input aria-label="2D 名称" :value="item.name" @change="change(i => i.name = text($event))"></label>
    <label>类型<input :value="item.type" readonly></label>
    <label class="check-label"><input aria-label="2D 显示" type="checkbox" :checked="item.visible" @change="change(i => i.visible = checked($event))"> 显示组件</label>
    <div class="vector-group"><span>布局（设计像素）</span><div class="layout-grid"><label v-for="field in (['x','y','width','height','zIndex'] as const)" :key="field">{{ { x:'X', y:'Y', width:'宽度', height:'高度', zIndex:'层级' }[field] }}<input type="number" :aria-label="`2D ${field}`" :value="item.layout[field]" @change="change(i => i.layout[field] = number($event))"></label></div></div>
    <label>背景颜色<input aria-label="背景颜色" type="color" :value="item.style.background" @change="change(i => i.style.background = text($event))"></label>
    <label>透明度（0～1）<input aria-label="透明度" type="number" min="0" max="1" step="0.1" :value="item.style.opacity" @change="change(i => i.style.opacity = number($event))"></label>
    <template v-if="item.type === 'chart.bar' || item.type === 'chart.line' || item.type === 'chart.pie'">
      <label>图表标题<input aria-label="图表标题" :value="item.props.title" @change="change(i => { if ('title' in i.props) i.props.title = text($event) })"></label>
      <label>图表颜色<input aria-label="图表颜色" type="color" :value="item.props.color" @change="change(i => i.props.color = text($event))"></label>
      <label class="check-label"><input type="checkbox" :checked="item.props.legend" @change="change(i => { if ('legend' in i.props) i.props.legend = checked($event) })"> 显示图例</label>
      <label v-if="item.type !== 'chart.pie'" class="check-label"><input type="checkbox" :checked="item.props.axis" @change="change(i => { if ('axis' in i.props) i.props.axis = checked($event) })"> 显示坐标轴</label>
      <label>静态数据（JSON）<textarea aria-label="静态数据" rows="6" :value="JSON.stringify(item.props.source, null, 2)" @change="chartData"></textarea></label>
    </template>
    <template v-else-if="item.type === 'widget.text'">
      <label>文本<textarea aria-label="文本内容" :value="item.props.text" @change="change(i => { if (i.type === 'widget.text') i.props.text = text($event) })"></textarea></label>
      <label>字号<input type="number" min="8" max="300" :value="item.props.fontSize" @change="change(i => { if (i.type === 'widget.text') i.props.fontSize = number($event) })"></label>
      <label>字重<select :value="item.props.fontWeight" @change="change(i => { if (i.type === 'widget.text') i.props.fontWeight = Number(text($event)) as 400 | 700 })"><option :value="400">常规</option><option :value="700">加粗</option></select></label>
      <label>颜色<input type="color" :value="item.props.color" @change="change(i => i.props.color = text($event))"></label>
      <label>对齐<select :value="item.props.align" @change="change(i => { if (i.type === 'widget.text') i.props.align = text($event) as 'left' | 'center' | 'right' })"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
    </template>
    <template v-else>
      <label>标题<input :value="item.props.title" @change="change(i => { if (i.type === 'widget.number') i.props.title = text($event) })"></label>
      <label>数值<input type="number" :value="item.props.value" @change="change(i => { if (i.type === 'widget.number') i.props.value = number($event) })"></label>
      <label>单位<input :value="item.props.unit" @change="change(i => { if (i.type === 'widget.number') i.props.unit = text($event) })"></label>
      <label>颜色<input type="color" :value="item.props.color" @change="change(i => i.props.color = text($event))"></label>
      <label>小数位数<input type="number" min="0" max="6" :value="item.props.decimals" @change="change(i => { if (i.type === 'widget.number') i.props.decimals = number($event) })"></label>
    </template>
    <div class="object-actions"><button @click="emit('duplicate')">复制</button><button class="danger" @click="emit('remove')">删除</button></div>
  </div>
</template>
