<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ScreenDocument } from '@visualtwin/schema'
import { preflight } from './binding-preflight'
import { diagnostic } from './data-diagnostics'
const props = defineProps<{ componentId: string, componentType: 'chart.bar' | 'chart.line' | 'chart.pie' | 'widget.text' | 'widget.number' | 'screen.table', active: boolean, sources: ScreenDocument['dataSources'], bindings: ScreenDocument['bindings'], errors: string[], validBindingIds?: string[], target?: ScreenDocument['components2d'][number], preview?: { sourceId: string, fingerprint: string, value: unknown } | null, choice?: { sourceId: string, path: string } | null }>()
const emit = defineEmits<{ save: [binding: ScreenDocument['bindings'][number]], remove: [id: string] }>()
const property = ref<'source' | 'title' | 'text' | 'value' | 'rows'>('source'); const sourceId = ref(''); const path = ref('')
const options = computed(() => {
  if (props.componentType === 'widget.text') return [{ value: 'text', label: '文本内容 text' }]
  if (props.componentType === 'widget.number') return [{ value: 'value', label: '指标数值 value' }]
  if (props.componentType === 'screen.table') return [{ value: 'rows', label: '表格行 rows' }]
  const name = { 'chart.bar': '柱状图', 'chart.line': '折线图', 'chart.pie': '饼图' }[props.componentType]
  return [{ value: 'source', label: `${name}数据 source` }, { value: 'title', label: `${name}标题 title` }]
})
const selected = computed(() => props.bindings.find(binding => binding.targetId === props.componentId && binding.property === property.value))
const checkResult = ref('')
const runtimeIssue = computed(() => { const binding = selected.value; if (!binding) return ''; const error = props.errors.find(item => item.startsWith(`绑定 ${binding.id}：`)) ?? props.errors.find(item => item.startsWith(`数据源 ${binding.sourceId}：`)); return error ? diagnostic(error) : '' })
const hasValidValue = computed(() => !!selected.value && !!props.validBindingIds?.includes(selected.value.id))
const expectedType = computed(() => ({ source: '需要分类与有限数值组成的二维数组；饼图数值须为非负数', title: '需要字符串', text: '需要字符串', value: '需要有限数字', rows: '需要符合列数与行数限制的二维数组', color: '需要颜色值' }[property.value]))
let checkVersion = 0
watch(() => props.componentId, () => { property.value = options.value[0].value as typeof property.value }, { immediate: true })
watch([selected, () => props.componentId, property], () => { sourceId.value = selected.value?.sourceId ?? ''; path.value = selected.value?.path ?? '' }, { immediate: true })
watch(() => props.choice, choice => { if (choice && props.sources.some(source => source.id === choice.sourceId)) { sourceId.value = choice.sourceId; path.value = choice.path } })
watch(sourceId, (next, previous) => { if (previous && next !== previous) path.value = '' }, { flush: 'sync' })
watch([sourceId, property, path, () => props.componentId, () => props.preview, () => JSON.stringify(props.sources), () => JSON.stringify(props.target)], () => { checkVersion++; checkResult.value = '' }, { flush: 'sync' })
function binding() { return { id: selected.value?.id ?? crypto.randomUUID(), targetId: props.componentId, sourceId: sourceId.value, property: property.value, path: path.value } }
async function check() {
  const version = ++checkVersion
  const source = props.sources.find(item => item.id === sourceId.value)
  if (!source || !props.target) { checkResult.value = '尚未预检'; return }
  const hasPreview = props.preview?.sourceId === source.id && props.preview.fingerprint === JSON.stringify(source)
  if (source.type === 'http' && !hasPreview) { checkResult.value = '尚未预检：请先手动测试数据源'; return }
  const error = await preflight(binding(), props.target, source.type === 'static' ? source.value : props.preview!.value)
  if (version === checkVersion) checkResult.value = error ? `预检失败：${diagnostic(error)} ${expectedType.value}` : '预检通过；后续数据仍可能变化'
}
async function save() { const next = binding(); await check(); if (next.sourceId === sourceId.value && next.property === property.value && next.path === path.value && next.targetId === props.componentId) emit('save', next) }
</script>
<template><section class="property-form"><h3>数据绑定</h3><label>绑定属性<select v-model="property" aria-label="绑定属性"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><label>数据源<select v-model="sourceId" aria-label="绑定数据源"><option value="">请选择</option><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.type }} · {{ source.id }}</option></select></label><label>JSON Pointer<input v-model="path" aria-label="JSON Pointer" placeholder="例如 /rows"></label><p>{{ selected ? (active ? '已绑定' : '组件已隐藏，绑定已暂停') : '未绑定' }}</p><template v-if="selected && active"><p v-if="runtimeIssue" role="alert">{{ runtimeIssue }} {{ expectedType }}</p><p v-if="runtimeIssue && hasValidValue">正式运行保留最近一次有效动态值。</p><p v-else-if="runtimeIssue">尚无有效动态值；请检查配置。</p><p v-else-if="hasValidValue">正式运行已有有效动态值。</p><p v-else>尚无有效动态值，首次请求可能尚未完成。</p></template><p>解除绑定后恢复已保存的静态配置。</p><p v-if="checkResult" role="status">{{ checkResult }}</p><button :disabled="!sourceId" @click="check">预检绑定</button> <button :disabled="!sourceId" @click="save">保存绑定</button> <button v-if="selected" @click="emit('remove', selected.id)">解除绑定</button></section></template>
