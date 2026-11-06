<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ScreenDocument } from '@visualtwin/schema'
const props = defineProps<{ document: ScreenDocument }>()
type Rule = ScreenDocument['events'][number]
const emit = defineEmits<{ save: [rule: Rule], remove: [id: string] }>()
const ruleId = ref(''); const scope = ref<'background' | 'foreground'>('background'); const sourceId = ref(''); const targetId = ref(''); const dataIndex = ref(0); const visible = ref(false); const enabled = ref(true)
const nodes = computed(() => props.document.background.type === 'scene' ? props.document.background.scene.scene3d.nodes.filter(node => node.type === 'primitive.box' || node.type === 'model.gltf') : [])
const charts = computed(() => props.document.components2d.filter(item => item.type === 'chart.bar'))
const current = computed(() => props.document.events.find(rule => rule.id === ruleId.value))
watch(current, rule => {
  if (!rule) return
  scope.value = rule.source.scope; sourceId.value = rule.source.id; enabled.value = rule.enabled !== false
  const action = rule.actions[0]; targetId.value = action.target.id
  if (action.type === 'chart.highlight') dataIndex.value = action.params.dataIndex
  else visible.value = action.params.visible
})
function save() {
  const action: Rule['actions'][number] = scope.value === 'background' ? { target: { scope: 'foreground', id: targetId.value }, type: 'chart.highlight', params: { dataIndex: dataIndex.value } } : { target: { scope: 'background', id: targetId.value }, type: 'node.setVisible', params: { visible: visible.value } }
  emit('save', { id: current.value?.id ?? crypto.randomUUID(), enabled: enabled.value, source: { scope: scope.value, id: sourceId.value }, event: 'click', actions: [action, ...(current.value?.actions.slice(1) ?? [])] })
}
function create() { ruleId.value = ''; scope.value = 'background'; sourceId.value = ''; targetId.value = ''; dataIndex.value = 0; visible.value = false; enabled.value = true }
</script>
<template><section class="property-form event-panel"><h3>跨层事件</h3><label>现有规则<select v-model="ruleId" aria-label="事件规则"><option value="">新建规则</option><option v-for="rule in document.events" :key="rule.id" :value="rule.id">{{ rule.source.scope }} / {{ rule.source.id }} · {{ rule.id }}</option></select></label><button @click="create">新建事件</button><label>来源作用域<select v-model="scope" aria-label="事件来源作用域" @change="sourceId = ''; targetId = ''"><option value="background">3D 背景</option><option value="foreground">2D 前景</option></select></label><label>点击来源<select v-model="sourceId" aria-label="事件来源"><option value="">请选择</option><option v-for="item in scope === 'background' ? nodes : charts" :key="item.id" :value="item.id">{{ item.name }} · {{ item.id }}</option></select></label><p>触发：点击；动作：{{ scope === 'background' ? '高亮柱状图' : '设置节点显隐' }}</p><label>动作目标<select v-model="targetId" aria-label="事件目标"><option value="">请选择</option><option v-for="item in scope === 'background' ? charts : nodes" :key="item.id" :value="item.id">{{ item.name }} · {{ item.id }}</option></select></label><label v-if="scope === 'background'">数据索引<input v-model.number="dataIndex" aria-label="高亮数据索引" type="number" min="0"></label><label v-else>节点可见<select v-model="visible" aria-label="节点可见"><option :value="true">显示</option><option :value="false">隐藏</option></select></label><label><input v-model="enabled" aria-label="事件启用" type="checkbox"> 启用规则</label><p v-if="current && current.actions.length > 1">此界面修改第一个动作，其余动作保留。</p><button :disabled="!sourceId || !targetId" @click="save">保存事件</button> <button v-if="current" @click="emit('remove', current.id); create()">删除事件</button></section></template>
