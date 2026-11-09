<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ScreenDocument } from '@visualtwin/schema'
import { formatPreview, previewSource, type PreviewChoice } from './source-preview'
import { diagnostic, jsonType } from './data-diagnostics'
type Source = ScreenDocument['dataSources'][number]
const props = defineProps<{ sources: Source[], bindings: ScreenDocument['bindings'], errors: string[], disabled?: boolean }>()
const emit = defineEmits<{ save: [source: Source], remove: [id: string], refresh: [id: string], error: [message: string], preview: [value: { sourceId: string, fingerprint: string, value: unknown } | null], pointer: [value: { sourceId: string, path: string }] }>()
const id = ref('')
const selected = computed(() => props.sources.find(source => source.id === id.value))
const json = ref(''); const url = ref(''); const timeout = ref(5000); const interval = ref(0)
const previewStatus = ref<'idle' | 'loading' | 'success' | 'error' | 'cancelled'>('idle')
const previewText = ref(''); const previewError = ref(''); const previewType = ref('')
const sourceErrors = computed(() => { if (!selected.value) return []; const sourceId = selected.value.id; const ids = props.bindings.filter(binding => binding.sourceId === sourceId).map(binding => binding.id); return props.errors.filter(error => error.startsWith(`数据源 ${sourceId}：`) || ids.some(id => error.startsWith(`绑定 ${id}：`))).map(diagnostic) })
const choices = ref<PreviewChoice[]>([]); const chosen = ref('')
let previewController: AbortController | undefined; let previewVersion = 0
function closePreview() { previewVersion++; previewController?.abort(); previewController = undefined; previewText.value = ''; previewError.value = ''; previewType.value = ''; choices.value = []; chosen.value = ''; emit('preview', null); previewStatus.value = 'cancelled' }
async function testPreview() {
  const source = selected.value
  if (!source) return
  closePreview(); const version = previewVersion; const controller = new AbortController(); previewController = controller
  previewStatus.value = 'loading'
  try {
    let raw: unknown
    const result = await previewSource(source, controller.signal, undefined, value => { raw = value })
    if (version === previewVersion) { const items: PreviewChoice[] = []; formatPreview(raw, items); choices.value = items; previewText.value = result; previewType.value = jsonType(raw); previewStatus.value = 'success'; emit('preview', { sourceId: source.id, fingerprint: JSON.stringify(source), value: raw }) }
  } catch (error) {
    if (version === previewVersion) { previewError.value = diagnostic(error instanceof Error ? error.message : ''); previewStatus.value = 'error' }
  } finally { if (version === previewVersion) previewController = undefined }
}
watch(() => JSON.stringify([selected.value, json.value, url.value, timeout.value, interval.value]), () => { if (previewStatus.value !== 'idle') closePreview() }, { flush: 'sync' })
watch(id, () => { closePreview(); previewStatus.value = 'idle' }, { flush: 'sync' })
onBeforeUnmount(closePreview)
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
<template><fieldset class="property-form data-sources" :disabled="disabled"><h3>数据源</h3><button @click="add('static')">新增静态</button> <button @click="add('http')">新增 HTTP</button><label>选择数据源<select v-model="id" aria-label="选择数据源"><option value="">请选择</option><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.type }} · {{ source.id }}</option></select></label><template v-if="selected"><p>正式运行：{{ sourceErrors.length ? '存在错误' : bindings.some(binding => binding.sourceId === selected!.id) ? '已绑定（状态以组件为准）' : '未绑定' }}</p><p v-for="error in sourceErrors" :key="error">{{ error }}</p><label v-if="selected.type === 'static'">静态 JSON<textarea v-model="json" aria-label="静态 JSON" rows="6"></textarea></label><template v-else><label>HTTP URL<input v-model="url" aria-label="HTTP URL"></label><label>超时毫秒<input v-model.number="timeout" type="number" aria-label="超时毫秒"></label><label>轮询毫秒（0 表示关闭）<input v-model.number="interval" type="number" aria-label="轮询毫秒"></label><p>跨域需服务端允许 CORS；HTTPS 页面不能请求不安全 HTTP。请勿填写密钥或凭证。</p></template><button :disabled="!bindings.some(binding => binding.sourceId === selected!.id)" @click="emit('refresh', selected.id)">刷新数据</button> <button @click="save">保存数据源配置</button> <button @click="remove">删除数据源</button><p>预览使用已保存的数据源配置。</p><button @click="testPreview">测试并预览</button> <button v-if="previewStatus !== 'idle'" @click="closePreview">关闭预览</button><p aria-live="polite">一次性预览：{{ { loading: '正在测试', success: `获取成功（${previewType}）`, error: '测试失败', cancelled: '已取消', idle: '尚未测试' }[previewStatus] }}</p><p v-if="previewError" role="alert">{{ previewError }}</p><pre v-if="previewStatus === 'success'" aria-label="JSON 结构预览" style="white-space: pre-wrap; overflow-wrap: anywhere">{{ previewText }}</pre><template v-if="previewStatus === 'success'"><label>选择预览字段<select v-model="chosen" aria-label="选择预览字段"><option value="">请选择</option><option v-for="(choice, index) in choices" :key="choice.path" :value="String(index)">{{ choice.path || '根节点（空 Pointer）' }}</option></select></label><p v-if="chosen !== ''">已选择：{{ choices[Number(chosen)].path || '根节点（空 Pointer）' }}</p><button :disabled="chosen === ''" @click="emit('pointer', { sourceId: selected!.id, path: choices[Number(chosen)].path })">应用到绑定</button></template></template></fieldset></template>
