<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { createScreen, parseScreen, type ScreenDocument } from '@visualtwin/schema'
import { ScreenCanvas, screenRegistry as registry, useRuntimeData, type ScreenComponent2D as Component2D, type ScreenComponentType as ComponentType } from '@visualtwin/runtime-2d'
import Properties2D from '@visualtwin/editor-ui/Properties2D.vue'
import ScreenProperties from './ScreenProperties.vue'
import DataSources from './DataSources.vue'
import BindingPanel from './BindingPanel.vue'
import EventPanel from './EventPanel.vue'
import { align, normalizeAngle } from '@visualtwin/runtime-2d'
import { copy, ScreenHistory } from './history'
import { loadScreen, saveScreen, storeBackgroundAssets, getBackgroundAsset, verifyBackground, stageScreenImport } from '@visualtwin/screen-storage'
import { importProject, importScreenProject } from '@visualtwin/project-archive'
import { exportScreen, exportScreenWeb } from './screen-export'
const document = ref<ScreenDocument>(createScreen())
const { scene: runtimeScreen, errors: dataErrors, refresh: refreshData, reset: resetData } = useRuntimeData(document)
const message = ref('正在读取本地大屏…')
const ready = ref(false)
const busy = ref(false)
const input = ref<HTMLInputElement>()
const backgroundInput = ref<HTMLInputElement>()
const projectInput = ref<HTMLInputElement>()
const priority3d = ref(false)
const previewMode = ref(false)
const eventEpoch = ref(0)
const backgroundWarning = computed(() => document.value.background.type === 'scene' && (document.value.background.scene.components2d.length > 0 || document.value.background.scene.bindings.length > 0 || document.value.background.scene.events.length > 0 || document.value.background.scene.dataSources.length > 0))
const selectedIds = ref<string[]>([])
const selectedId = computed<string | null>({ get: () => selectedIds.value.length === 1 ? selectedIds.value[0] : null, set: id => { selectedIds.value = id ? [id] : [] } })
const selectedItems = computed(() => document.value.components2d.filter(item => selectedIds.value.includes(item.id)))
const selectedGroup = computed(() => (document.value.groups ?? []).find(group => group.memberIds.length === selectedIds.value.length && group.memberIds.every(id => selectedIds.value.includes(id))))
const propertyRevision = ref(0)
const selected = computed(() => document.value.components2d.find(item => item.id === selectedId.value) ?? null)
const categories = computed(() => [...new Set(Object.values(registry).map(entry => entry.category))].map(name => ({ name: name === '基础' ? '指标与文本' : name, entries: Object.entries(registry).filter(([, entry]) => entry.category === name) as [ComponentType, typeof registry[ComponentType]][] })))
const layers = computed(() => document.value.components2d.map((item, index) => ({ item, index })).sort((a, b) => b.item.layout.zIndex - a.item.layout.zIndex || b.index - a.index).map(value => value.item))
const history = new ScreenHistory()
function commit(next: ScreenDocument) { document.value = history.commit(document.value, next); message.value = '已修改，请保存' }
function ensureSelection() { selectedIds.value = selectedIds.value.filter(id => document.value.components2d.some(item => item.id === id)) }
function expand(ids: string[]) { const result = new Set(ids); for (const group of document.value.groups ?? []) if (group.memberIds.some(id => result.has(id))) group.memberIds.forEach(id => result.add(id)); return [...result] }
function pick(id: string, additive = false) { const members = expand([id]); if (!additive) { if (!selectedIds.value.includes(id)) selectedIds.value = members; return } const next = new Set(selectedIds.value); if (members.every(value => next.has(value))) members.forEach(value => next.delete(value)); else members.forEach(value => next.add(value)); selectedIds.value = [...next] }
function selectMany(ids: string[]) { selectedIds.value = expand(ids) }
function moveMany(ids: string[], dx: number, dy: number) { const next = copy(document.value); for (const item of next.components2d) if (ids.includes(item.id)) { item.layout.x += dx; item.layout.y += dy } commit(next) }
function rotate(id: string, angle: number) { if (!Number.isFinite(angle)) { message.value = '旋转角度必须为有限数值'; return } const next = copy(document.value); next.rotations = { ...next.rotations, [id]: normalizeAngle(angle) }; commit(next) }
function changeAngle(event: Event) { const input = event.target as HTMLInputElement; if (selectedId.value) rotate(selectedId.value, input.valueAsNumber) }
function alignSelected(mode: Parameters<typeof align>[1]) { if (selectedItems.value.some(item => (document.value.groups ?? []).some(group => group.memberIds.includes(item.id)))) { message.value = '请先拆分组合后对齐'; return } const next = copy(document.value); const changed = align(next.components2d.filter(item => selectedIds.value.includes(item.id)), mode, next.rotations); const map = new Map(changed.map(item => [item.id, item])); next.components2d = next.components2d.map(item => map.get(item.id) ?? item); commit(next) }
function groupSelected() { if (selectedIds.value.length < 2) return; if ((document.value.groups ?? []).some(group => group.memberIds.some(id => selectedIds.value.includes(id)))) { message.value = '不支持组合嵌套，请先拆分'; return } const next = copy(document.value); next.groups = [...(next.groups ?? []), { id: crypto.randomUUID(), name: '组合', memberIds: [...selectedIds.value] as [string, string, ...string[]], visible: true }]; commit(next) }
function ungroup() { if (!selectedGroup.value) return; const next = copy(document.value); next.groups = (next.groups ?? []).filter(group => group.id !== selectedGroup.value!.id); commit(next) }
function toggleGroup() { if (!selectedGroup.value) return; const next = copy(document.value); const group = next.groups!.find(value => value.id === selectedGroup.value!.id)!; group.visible = !group.visible; commit(next) }
function undo() { const next = history.undo(document.value); if (next !== document.value) { document.value = next; resetData(); eventEpoch.value++ } ensureSelection() }
function redo() { const next = history.redo(document.value); if (next !== document.value) { document.value = next; resetData(); eventEpoch.value++ } ensureSelection() }
function add(type: string, position?: { x: number, y: number }) {
  if (!Object.hasOwn(registry, type)) return
  const item = registry[type as ComponentType].create(crypto.randomUUID())
  if (position) { item.layout.x = position.x; item.layout.y = position.y }
  item.layout.zIndex = Math.max(0, ...document.value.components2d.map(value => value.layout.zIndex)) + 1
  const next = copy(document.value); next.components2d.push(item); commit(next); selectedId.value = item.id
}
function startDrag(event: DragEvent, type: ComponentType) { event.dataTransfer?.setData('application/x-visualtwin-2d', type); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy' }
function update(item: Component2D) {
  try { const next = copy(document.value); const index = next.components2d.findIndex(value => value.id === item.id); if (index < 0) return; next.components2d[index] = item; commit(next) } catch (error) { propertyRevision.value++; showError(error) }
}
function updateLayout(id: string, layout: Component2D['layout']) { const item = document.value.components2d.find(value => value.id === id); if (item) update({ ...copy(item), layout }) }
function remove() {
  const ids = selectedIds.value; if (!ids.length) return
  if (document.value.events.some(rule => (rule.source.scope === 'foreground' && ids.includes(rule.source.id)) || rule.actions.some(action => action.target.scope === 'foreground' && ids.includes(action.target.id)))) { message.value = '组件被事件引用，请先修改或删除相关规则'; return }
  const next = copy(document.value); next.components2d = next.components2d.filter(value => !ids.includes(value.id)); next.bindings = next.bindings.filter(value => !ids.includes(value.targetId)); next.groups = (next.groups ?? []).filter(group => !group.memberIds.some(id => ids.includes(id)))
  if (next.rotations) for (const id of ids) delete next.rotations[id]
  commit(next); selectedIds.value = []
}
function saveEvent(rule: ScreenDocument['events'][number]) {
  try { const next = copy(document.value); const index = next.events.findIndex(item => item.id === rule.id); if (index < 0) next.events.push(rule); else next.events[index] = rule; commit(next) } catch (error) { showError(error) }
}
function removeEvent(id: string) { const next = copy(document.value); next.events = next.events.filter(rule => rule.id !== id); commit(next) }
function saveSource(source: ScreenDocument['dataSources'][number]) {
  try { const next = copy(document.value); const index = next.dataSources.findIndex(item => item.id === source.id); if (index < 0) next.dataSources.push(source); else next.dataSources[index] = source; commit(next) } catch (error) { showError(error) }
}
function removeSource(id: string) { const next = copy(document.value); next.dataSources = next.dataSources.filter(item => item.id !== id); commit(next) }
function saveBinding(binding: ScreenDocument['bindings'][number]) {
  try { const next = copy(document.value); const index = next.bindings.findIndex(item => item.id === binding.id); if (index < 0) next.bindings.push(binding); else next.bindings[index] = binding; commit(next) } catch (error) { showError(error) }
}
function removeBinding(id: string) { const next = copy(document.value); next.bindings = next.bindings.filter(item => item.id !== id); commit(next) }
function duplicate() {
  if (!selectedIds.value.length) return
  const next = copy(document.value); const mapping = new Map<string, string>(); let top = Math.max(0, ...next.components2d.map(value => value.layout.zIndex))
  for (const item of next.components2d.filter(value => selectedIds.value.includes(value.id))) {
    const clone = copy(item); clone.id = crypto.randomUUID(); mapping.set(item.id, clone.id); clone.name += ' 副本'; clone.layout.x += 30; clone.layout.y += 30; clone.layout.zIndex = ++top; next.components2d.push(clone)
    if (next.rotations?.[item.id] !== undefined) next.rotations[clone.id] = next.rotations[item.id]
  }
  for (const binding of [...next.bindings]) { const targetId = mapping.get(binding.targetId); if (targetId) next.bindings.push({ ...binding, id: crypto.randomUUID(), targetId }) }
  for (const group of [...(next.groups ?? [])]) if (group.memberIds.every(id => mapping.has(id))) next.groups!.push({ ...group, id: crypto.randomUUID(), name: group.name + ' 副本', memberIds: group.memberIds.map(id => mapping.get(id)!) as [string, string, ...string[]] })
  commit(next); selectedIds.value = [...mapping.values()]
}
function reorder(direction: 'top' | 'bottom' | 'up' | 'down') {
  if (!selectedIds.value.length) return
  const next = copy(document.value); const sorted = [...next.components2d].sort((a, b) => a.layout.zIndex - b.layout.zIndex)
  const moving = sorted.filter(item => selectedIds.value.includes(item.id)); const rest = sorted.filter(item => !selectedIds.value.includes(item.id)); const first = sorted.findIndex(item => selectedIds.value.includes(item.id)); let index = sorted.slice(0, first).filter(item => !selectedIds.value.includes(item.id)).length
  if (direction === 'top') index = rest.length; else if (direction === 'bottom') index = 0; else if (direction === 'up') index = Math.min(rest.length, index + 1); else index = Math.max(0, index - 1)
  rest.splice(index, 0, ...moving); rest.forEach((item, i) => { item.layout.zIndex = i + 1 }); commit(next)
}
function keydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (!ready.value || busy.value || previewMode.value || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return
  const key = event.key.toLowerCase()
  if ((event.metaKey || event.ctrlKey) && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
  else if (key === 'escape') { selectedIds.value = [] }
  else if (!event.metaKey && !event.ctrlKey && (key === 'delete' || key === 'backspace') && selectedIds.value.length) { event.preventDefault(); remove() }
}
window.addEventListener('keydown', keydown)
onBeforeUnmount(() => window.removeEventListener('keydown', keydown))
function showError(error: unknown) { message.value = error instanceof Error ? error.message : String(error) }
onMounted(async () => {
  try { const saved = await loadScreen(); if (saved) { document.value = saved; try { await verifyBackground(saved) } catch (error) { showError(error); ready.value = true; return } } message.value = saved ? '已恢复本地大屏' : '大屏已就绪'; ready.value = true }
  catch (error) { showError(error) }
})
function changeName(event: Event) {
  try { const next = { ...document.value, name: (event.target as HTMLInputElement).value }; commit(next); message.value = '名称已修改，请保存' }
  catch (error) { (event.target as HTMLInputElement).value = document.value.name; showError(error) }
}
function changeSize(key: 'width' | 'height', event: Event) {
  const element = event.target as HTMLInputElement
  try { commit({ ...document.value, canvas: { ...document.value.canvas, [key]: element.valueAsNumber } }); message.value = '尺寸已修改，请保存' }
  catch (error) { element.value = String(document.value.canvas[key]); showError(error) }
}
async function save() {
  busy.value = true
  try { await saveScreen(document.value); message.value = '已保存到本地' } catch (error) { showError(error) } finally { busy.value = false }
}
function newScreen() { commit(createScreen()); resetData(); eventEpoch.value++; selectedId.value = null; message.value = '已新建大屏，请保存' }
async function importFile(event: Event) {
  const element = event.target as HTMLInputElement; const file = element.files?.[0]
  if (!file) return
  busy.value = true
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('JSON 文件不能超过 5 MiB')
    const next = parseScreen(await file.text()); await verifyBackground(next); commit(next); resetData(); eventEpoch.value++; selectedId.value = null; message.value = '导入成功，请保存'
  } catch (error) { showError(error) } finally { element.value = ''; busy.value = false }
}
async function importBackground(event: Event) {
  const element = event.target as HTMLInputElement; const file = element.files?.[0]
  if (!file) return
  busy.value = true
  try {
    const { scene, records } = await importProject(file, text => { message.value = text })
    const next = parseScreen({ ...copy(document.value), background: { type: 'scene', scene } })
    await storeBackgroundAssets(records)
    commit(next); priority3d.value = false; message.value = '三维背景已导入，请保存大屏'
  } catch (error) { showError(error) } finally { element.value = ''; busy.value = false }
}
async function importScreenZip(event: Event) {
  const element = event.target as HTMLInputElement; const file = element.files?.[0]
  if (!file) return
  busy.value = true
  try {
    const result = await importScreenProject(file, text => { message.value = text })
    await stageScreenImport(result.document, result.records)
    commit(result.document); resetData(); eventEpoch.value++; selectedId.value = null; priority3d.value = false
    message.value = '大屏工程已导入，请保存'
  } catch (error) { showError(error) } finally { element.value = ''; busy.value = false }
}
async function exportZip(kind: 'project' | 'web') {
  busy.value = true
  try {
    const blob = await (kind === 'project' ? exportScreen(document.value, text => { message.value = text }) : exportScreenWeb(document.value, text => { message.value = text }))
    const url = URL.createObjectURL(blob); const link = window.document.createElement('a'); link.href = url; link.download = kind === 'project' ? 'visualtwin-screen-project.zip' : 'visualtwin-screen-web.zip'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0)
    message.value = kind === 'project' ? '已导出大屏工程 ZIP' : '已导出静态网页 ZIP'
  } catch (error) { showError(error) } finally { busy.value = false }
}
function clearBackground() { try { commit({ ...document.value, background: { type: 'none' } }); priority3d.value = false; message.value = '已移除背景，请保存大屏' } catch (error) { showError(error) } }
function exportFile() {
  try {
    if (document.value.background.type === 'scene' && document.value.background.scene.assets.length) message.value = 'JSON 不包含 GLB 文件；跨设备恢复请重新导入原项目 ZIP'
    const blob = new Blob([JSON.stringify(parseScreen(document.value), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = window.document.createElement('a'); link.href = url; link.download = 'visualtwin-screen.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0)
    message.value = document.value.background.type === 'scene' && document.value.background.scene.assets.length ? 'JSON 不包含 GLB，跨设备恢复需先导入原项目 ZIP' : '已导出 JSON'
  } catch (error) { showError(error) }
}
</script>
<template>
  <div class="studio">
    <header><div class="brand">VisualTwin <small>大屏设计器</small></div><strong>{{ document.name }}</strong><nav><button :disabled="!ready || busy" @click="undo">撤销</button><button :disabled="!ready || busy" @click="redo">重做</button><button :disabled="!ready || busy" @click="newScreen">新建</button><button :disabled="!ready || busy" @click="save">保存</button><button :disabled="!ready || busy" @click="previewMode = !previewMode">{{ previewMode ? '退出预览' : '联动预览' }}</button><button :disabled="!ready || busy" @click="input?.click()">导入 JSON</button><input ref="input" hidden type="file" accept="application/json,.json" @change="importFile"><button :disabled="!ready || busy" @click="exportFile">导出 JSON</button><button :disabled="!ready || busy" @click="projectInput?.click()">导入大屏工程</button><input ref="projectInput" hidden type="file" accept=".zip,application/zip" @change="importScreenZip"><button :disabled="!ready || busy" @click="exportZip('project')">导出大屏工程</button><button :disabled="!ready || busy" @click="exportZip('web')">导出静态网页</button></nav></header>
    <div class="workspace">
      <aside class="left"><h3>背景设置</h3><button :disabled="!ready || busy" @click="backgroundInput?.click()">导入 3D 项目 ZIP</button><input ref="backgroundInput" type="file" accept=".zip,application/zip" hidden @change="importBackground"><button v-if="document.background.type === 'scene'" :disabled="!ready || busy" @click="clearBackground">移除背景</button><button v-if="document.background.type === 'scene'" @click="priority3d = !priority3d">{{ priority3d ? '3D 操作优先' : '2D 编辑优先' }}</button><p v-if="backgroundWarning">背景原二维组件、数据和事件未启用；配置已保留。</p><DataSources :disabled="!ready || busy" :sources="document.dataSources" :bindings="document.bindings" :errors="dataErrors" @save="saveSource" @remove="removeSource" @refresh="refreshData" @error="message = $event" /><EventPanel :document="document" @save="saveEvent" @remove="removeEvent" /><h3>组件库</h3><template v-for="category in categories" :key="category.name"><h4>{{ category.name }}</h4><button v-for="[type, entry] in category.entries" :key="type" class="library-item" :disabled="!ready || busy" draggable="true" @dragstart="startDrag($event, type)" @click="add(type)">{{ entry.name }} <small>{{ entry.category }}</small></button></template><h3>图层</h3><button v-for="item in layers" :key="item.id" class="layer-item" :class="{ active: selectedIds.includes(item.id) }" @click="pick(item.id, $event.ctrlKey || $event.metaKey)">{{ item.name }} <small>{{ item.visible ? '显示' : '隐藏' }}</small></button><button v-for="group in document.groups ?? []" :key="group.id" class="layer-item" @click="selectedIds = [...group.memberIds]">{{ group.name }} <small>{{ group.visible ? '显示' : '隐藏' }}</small></button><p v-if="!layers.length">暂无组件</p></aside>
      <main><div class="caption">大屏画布 <span>{{ document.canvas.width }} × {{ document.canvas.height }}</span></div><div class="viewport"><ScreenCanvas :document="runtimeScreen" advanced :selected-ids="selectedIds" :editable="ready && !busy && !previewMode" :interactive="previewMode" :event-epoch="eventEpoch" :selected-id="selectedId" :passthrough="priority3d && !previewMode" :resolve-asset="getBackgroundAsset" @asset-error="message = $event" @select="selectedId = $event" @pick="pick" @select-many="selectMany" @move-many="moveMany" @rotate="rotate" @layout="updateLayout" @drop="add" /></div></main>
      <aside class="right"><h3>{{ selected ? '组件属性' : selectedIds.length ? '批量操作' : '大屏属性' }}</h3><template v-if="selectedIds.length > 1"><p>已选择 {{ selectedIds.length }} 项</p><div class="layer-actions"><button @click="duplicate">批量复制</button><button @click="remove">批量删除</button><button v-if="!selectedGroup" @click="groupSelected">组合</button><button v-else @click="ungroup">拆分组合</button><button v-if="selectedGroup" @click="toggleGroup">{{ selectedGroup.visible ? '隐藏组合' : '显示组合' }}</button></div><div class="layer-actions"><button @click="alignSelected('left')">左对齐</button><button @click="alignSelected('center')">水平居中</button><button @click="alignSelected('right')">右对齐</button><button @click="alignSelected('top')">顶部对齐</button><button @click="alignSelected('middle')">垂直居中</button><button @click="alignSelected('bottom')">底部对齐</button><button :disabled="selectedIds.length < 3" @click="alignSelected('horizontal')">水平分布</button><button :disabled="selectedIds.length < 3" @click="alignSelected('vertical')">垂直分布</button></div><div class="layer-actions"><button @click="reorder('top')">置顶</button><button @click="reorder('up')">上移</button><button @click="reorder('down')">下移</button><button @click="reorder('bottom')">置底</button></div></template><template v-else-if="selected"><ScreenProperties v-if="selected.type === 'screen.border' || selected.type === 'screen.decoration' || selected.type === 'screen.table'" :key="`${selected.id}:${propertyRevision}`" :item="selected" @change="update" @error="message = $event" @duplicate="duplicate" @remove="remove" /><Properties2D v-else :key="`${selected.id}:${propertyRevision}`" :item="selected" @change="update" @error="message = $event" @duplicate="duplicate" @remove="remove" /><label>旋转角度（度）<input aria-label="旋转角度" type="number" :value="document.rotations?.[selected.id] ?? 0" @change="changeAngle"></label><BindingPanel v-if="selected.type === 'chart.bar'" :component-id="selected.id" :sources="document.dataSources" :bindings="document.bindings" :errors="dataErrors" @save="saveBinding" @remove="removeBinding" /><p v-for="error in dataErrors" :key="error">{{ error }}</p><div class="layer-actions"><button @click="reorder('top')">置顶</button><button @click="reorder('up')">上移</button><button @click="reorder('down')">下移</button><button @click="reorder('bottom')">置底</button></div></template><template v-else><label>名称<input aria-label="大屏名称" :disabled="!ready || busy" :value="document.name" @change="changeName"></label><label>设计宽度<input aria-label="设计宽度" type="number" min="1" max="16384" :disabled="!ready || busy" :value="document.canvas.width" @change="changeSize('width', $event)"></label><label>设计高度<input aria-label="设计高度" type="number" min="1" max="16384" :disabled="!ready || busy" :value="document.canvas.height" @change="changeSize('height', $event)"></label><p>画布等比居中适配</p></template></aside>
    </div><footer role="status">{{ message }}</footer>
  </div>
</template>
