<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ScreenDocument } from '@visualtwin/schema'
const props = defineProps<{ componentId: string, componentType: 'chart.bar' | 'chart.line' | 'chart.pie' | 'widget.text' | 'widget.number' | 'screen.table', active: boolean, sources: ScreenDocument['dataSources'], bindings: ScreenDocument['bindings'], errors: string[] }>()
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
watch(() => props.componentId, () => { property.value = options.value[0].value as typeof property.value }, { immediate: true })
watch([selected, () => props.componentId, property], () => { sourceId.value = selected.value?.sourceId ?? ''; path.value = selected.value?.path ?? '' }, { immediate: true })
function save() { emit('save', { id: selected.value?.id ?? crypto.randomUUID(), targetId: props.componentId, sourceId: sourceId.value, property: property.value, path: path.value }) }
</script>
<template><section class="property-form"><h3>数据绑定</h3><label>绑定属性<select v-model="property" aria-label="绑定属性"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><label>数据源<select v-model="sourceId" aria-label="绑定数据源"><option value="">请选择</option><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.type }} · {{ source.id }}</option></select></label><label>JSON Pointer<input v-model="path" aria-label="JSON Pointer" placeholder="例如 /rows"></label><p>{{ selected ? `绑定 ${selected.id}：${!active ? '组件隐藏，已暂停' : errors.some(error => error.includes(selected!.id) || error.includes(selected!.sourceId)) ? '错误' : '运行中'}` : '未绑定' }}</p><p v-for="error in errors" :key="error">{{ error }}</p><button :disabled="!sourceId" @click="save">保存绑定</button> <button v-if="selected" @click="emit('remove', selected.id)">解除绑定</button></section></template>
