<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ScreenDocument } from '@visualtwin/schema'
type Source = ScreenDocument['dataSources'][number]
const props = defineProps<{ sources: Source[], bindings: ScreenDocument['bindings'], errors: string[], disabled?: boolean }>()
const emit = defineEmits<{ save: [source: Source], remove: [id: string], refresh: [id: string], error: [message: string] }>()
const id = ref('')
const selected = computed(() => props.sources.find(source => source.id === id.value))
const json = ref(''); const url = ref(''); const timeout = ref(5000); const interval = ref(0)
watch(selected, source => {
  if (!source) return
  if (source.type === 'static') json.value = JSON.stringify(source.value, null, 2)
  else { url.value = source.url; timeout.value = source.timeoutMs; interval.value = source.intervalMs }
}, { immediate: true })
function add(type: 'static' | 'http') {
  const source: Source = type === 'static' ? { id: crypto.randomUUID(), type, value: { rows: [['category', 'value'], ['一月', 42], ['二月', 65]] } } : { id: crypto.randomUUID(), type, method: 'GET', url: 'https://example.com/data.json', timeoutMs: 5000, intervalMs: 0 }
  emit('save', source); id.value = source.id
}
function save() {
  const source = selected.value
  if (!source) return
  try { emit('save', source.type === 'static' ? { ...source, value: JSON.parse(json.value) } : { ...source, url: url.value, timeoutMs: timeout.value, intervalMs: interval.value }) }
  catch { emit('error', '静态 JSON 格式无效') }
}
function remove() {
  if (!selected.value) return
  if (props.bindings.some(binding => binding.sourceId === selected.value!.id)) { emit('error', '数据源仍被绑定，请先解除相关绑定'); return }
  emit('remove', selected.value.id); id.value = ''
}
</script>
<template><fieldset class="property-form data-sources" :disabled="disabled"><h3>数据源</h3><button @click="add('static')">新增静态</button> <button @click="add('http')">新增 HTTP</button><label>选择数据源<select v-model="id" aria-label="选择数据源"><option value="">请选择</option><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.type }} · {{ source.id }}</option></select></label><template v-if="selected"><p>状态：{{ errors.some(error => error.includes(selected!.id)) ? '错误' : bindings.some(binding => binding.sourceId === selected!.id) ? '运行中' : '未绑定' }}</p><p v-for="error in errors" :key="error">{{ error }}</p><label v-if="selected.type === 'static'">静态 JSON<textarea v-model="json" aria-label="静态 JSON" rows="6"></textarea></label><template v-else><label>HTTP URL<input v-model="url" aria-label="HTTP URL"></label><label>超时毫秒<input v-model.number="timeout" type="number" aria-label="超时毫秒"></label><label>轮询毫秒（0 表示关闭）<input v-model.number="interval" type="number" aria-label="轮询毫秒"></label><p>跨域需服务端允许 CORS；HTTPS 页面不能请求不安全 HTTP。请勿填写密钥或凭证。</p></template><button :disabled="!bindings.some(binding => binding.sourceId === selected!.id)" @click="emit('refresh', selected.id)">刷新数据</button> <button @click="save">保存数据源配置</button> <button @click="remove">删除数据源</button></template></fieldset></template>
