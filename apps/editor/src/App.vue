<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SceneViewport } from '@visualtwin/runtime-3d'
import { Overlay2D, registry, fitFrame, toDesign, useRuntimeData, useEventRuntime, type Component2D, type ComponentType } from '@visualtwin/runtime-2d'
import Properties2D from '@visualtwin/editor-ui/Properties2D.vue'
import { parseScene, exampleScene, type SceneDocument } from '@visualtwin/schema'
import { commitProject, deleteAssetAndSave, getAsset, getProject, saveProject, sha256, type AssetRecord } from './storage'
import { exportProject, importProject, limits, validateGlb } from './project-archive'
import { exportStaticWeb } from './static-export'
import { primitiveNames, useEditorStore } from './editor'
import PlayerView from '../../player/src/PlayerView.vue'

type Node = SceneDocument['scene3d']['nodes'][number]
type PrimitiveType = Extract<Node, { type: `primitive.${string}` }>['type']
type VectorField = 'position' | 'rotation' | 'scale'
const editor = useEditorStore()
const { scene: runtimeScene, errors: dataErrors } = useRuntimeData(computed(() => editor.scene))
const { scene: eventScene, highlights, error: eventError, dispatch: dispatchEvent, reset: resetEvents } = useEventRuntime(runtimeScene)
const showEventConfig = ref(false)
const eventConfig = ref('')
function openEventConfig() { eventConfig.value = JSON.stringify(editor.scene.events, null, 2); showEventConfig.value = true }
function exampleEventConfig() {
  const node = editor.scene.scene3d.nodes.find(item => item.type === 'primitive.box' || item.type === 'model.gltf')
  const chart = editor.scene.components2d.find(item => item.type === 'chart.bar')
  if (!node || !chart) { message.value = '请先添加立方体或模型和柱状图'; return }
  eventConfig.value = JSON.stringify([...editor.scene.events, { id: crypto.randomUUID(), sourceId: node.id, event: 'click', actions: [{ targetId: chart.id, type: 'chart.highlight', params: { dataIndex: 0 } }] }, { id: crypto.randomUUID(), sourceId: chart.id, event: 'click', actions: [{ targetId: node.id, type: 'node.setVisible', params: { visible: false } }] }], null, 2)
}
function saveEventConfig() {
  try { const next = JSON.parse(JSON.stringify(editor.scene)) as SceneDocument; next.events = JSON.parse(eventConfig.value); editor.commit(next); showEventConfig.value = false; message.value = '事件规则已保存' }
  catch (error) { message.value = `事件规则无效：${error instanceof Error ? error.message : String(error)}` }
}
const showDataConfig = ref(false)
const dataConfig = ref('')
function openDataConfig() {
  dataConfig.value = JSON.stringify({ dataSources: editor.scene.dataSources, bindings: editor.scene.bindings }, null, 2)
  showDataConfig.value = true
}
function exampleDataConfig() {
  const target = editor.scene.components2d.find(item => item.type === 'chart.bar')
  if (!target) { message.value = '请先添加柱状图'; return }
  const sourceId = crypto.randomUUID()
  dataConfig.value = JSON.stringify({ dataSources: [...editor.scene.dataSources, { id: sourceId, type: 'static', value: { rows: [['category', 'value'], ['一月', 42], ['二月', 65]] } }], bindings: [...editor.scene.bindings, { id: crypto.randomUUID(), sourceId, path: '/rows', targetId: target.id, property: 'source' }] }, null, 2)
}
function saveDataConfig() {
  try {
    const config = JSON.parse(dataConfig.value) as { dataSources: SceneDocument['dataSources'], bindings: SceneDocument['bindings'] }
    const next = JSON.parse(JSON.stringify(editor.scene)) as SceneDocument
    next.dataSources = config.dataSources; next.bindings = config.bindings
    editor.commit(next); showDataConfig.value = false; message.value = '数据源配置已保存'
  } catch (error) { message.value = `数据源配置无效：${error instanceof Error ? error.message : String(error)}` }
}
const sceneReady = ref(false)
const passthrough2d = ref(false)
const mode = ref<'translate' | 'rotate' | 'scale'>('translate')
const message = ref('')
const fileInput = ref<HTMLInputElement>()
const glbInput = ref<HTMLInputElement>()
const zipInput = ref<HTMLInputElement>()
const canvasWrap = ref<HTMLDivElement>()
const busy = ref(true)
const assetStatus = ref<Record<string, string>>({})
const ready = ref(false)
const previewScene = ref<SceneDocument>()
const previewGeneration = ref(0)
let previewNeedsReset = false
let previewAssets = new Map<string, Blob>()
let previewRevision = 0
let previewTimer: ReturnType<typeof setTimeout> | undefined
const previewOpen = ref(false)
async function openPreview() {
  previewOpen.value = true
  await updatePreview()
}
async function updatePreview() {
  const revision = ++previewRevision
  try {
    const snapshot = parseScene(JSON.parse(JSON.stringify(editor.scene)))
    const blobs = new Map<string, Blob>()
    for (const asset of snapshot.assets) {
      const previous = previewScene.value?.assets.find(item => item.id === asset.id && item.sha256 === asset.sha256 && item.byteLength === asset.byteLength)
      const cached = previewAssets.get(asset.id)
      if (previous && cached) { blobs.set(asset.id, cached); continue }
      const record = await getAsset(asset.id)
      if (!record || record.blob.size !== asset.byteLength || await sha256(record.blob) !== asset.sha256) throw new Error(`资产缺失或校验失败：${asset.name}`)
      blobs.set(asset.id, record.blob)
    }
    if (!previewOpen.value || revision !== previewRevision) return
    previewAssets = blobs
    previewScene.value = snapshot
    if (previewNeedsReset) { previewGeneration.value++; previewNeedsReset = false }
  } catch (error) { if (previewOpen.value && revision === previewRevision) { message.value = `预览失败：${errorText(error)}`; if (!previewScene.value) previewOpen.value = false } }
}
function closePreview() { previewOpen.value = false; previewRevision++; clearTimeout(previewTimer); previewScene.value = undefined; previewNeedsReset = false; previewAssets.clear() }
onBeforeUnmount(closePreview)
watch(() => editor.scene, () => {
  if (!previewOpen.value) return
  previewRevision++
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => { void updatePreview() }, 100)
}, { deep: true, flush: 'sync' })
const tree = computed(() => {
  const nodes = editor.scene.scene3d.nodes
  const result: { node: Node, depth: number }[] = []
  const walk = (parentId: string | null, depth: number) => nodes.filter(node => node.parentId === parentId).forEach(node => { result.push({ node, depth }); walk(node.id, depth + 1) })
  walk(null, 0)
  return result
})
const primitives = Object.entries(primitiveNames) as [PrimitiveType, string][]
const componentTypes = Object.keys(registry) as ComponentType[]
const vectorFields: { key: VectorField, label: string }[] = [{ key: 'position', label: '位置' }, { key: 'rotation', label: '旋转（度）' }, { key: 'scale', label: '缩放' }]
function startDrag(event: DragEvent, type: PrimitiveType) {
  event.dataTransfer?.setData('application/x-visualtwin-primitive', type)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
const copyScene = () => JSON.parse(JSON.stringify(editor.scene)) as SceneDocument
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
onMounted(async () => {
  try {
    const saved = await getProject()
    if (saved !== undefined) editor.scene = parseScene(saved)
    ready.value = true
    watch(() => editor.scene, scene => { void saveProject(scene).catch(error => { message.value = `自动保存失败：${errorText(error)}` }) }, { deep: true, flush: 'sync' })
  } catch (error) { message.value = `读取本地项目失败：${errorText(error)}，请检查浏览器存储权限后刷新`; return }
  finally { busy.value = false }
})
async function resolveAsset(id: string) {
  const record = await getAsset(id); const asset = editor.scene.assets.find(item => item.id === id)
  if (!record || !asset) return undefined
  if (record.blob.size !== asset.byteLength || await sha256(record.blob) !== asset.sha256) throw new Error('资产内容校验失败')
  return record.blob
}
function handleDrop(type: string, position: [number, number, number]) {
  if (type.startsWith('asset:')) editor.addModel(type.slice(6), position)
  else if (type in primitiveNames) editor.add(type as PrimitiveType, position)
}
function dragAsset(event: DragEvent, id: string) {
  event.dataTransfer?.setData('application/x-visualtwin-asset', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
async function uploadGlb(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]
  if (!file) return
  busy.value = true
  try {
    message.value = '正在校验模型…'
    await validateGlb(file, file.name)
    const asset: SceneDocument['assets'][number] = { id: crypto.randomUUID(), type: 'glb', name: file.name, mimeType: 'model/gltf-binary', byteLength: file.size, sha256: await sha256(file) }
    const record: AssetRecord = { ...asset, blob: file, createdAt: new Date().toISOString() }
    const next = copyScene(); next.assets.push(asset); parseScene(next)
    await commitProject(next, [record])
    // 资产库属于项目，补入历史快照以便撤销场景编辑时保留资产。
    editor.past.forEach(scene => scene.assets.push({ ...asset })); editor.future.forEach(scene => scene.assets.push({ ...asset }))
    editor.scene = next; assetStatus.value[asset.id] = '已保存'; message.value = '模型已上传，可拖入场景'
  } catch (error) { message.value = `上传失败：${errorText(error)}` }
  finally { input.value = ''; busy.value = false }
}
async function removeAsset(id: string) {
  const scenes = [editor.scene, ...editor.past, ...editor.future]
  if (scenes.some(scene => scene.scene3d.nodes.some(node => node.type === 'model.gltf' && node.props.assetId === id))) { message.value = '资产仍被场景或撤销历史引用，不能删除'; return }
  busy.value = true
  try {
    const next = copyScene(); next.assets = next.assets.filter(asset => asset.id !== id)
    await deleteAssetAndSave(id, next)
    editor.past.forEach(scene => { scene.assets = scene.assets.filter(asset => asset.id !== id) })
    editor.future.forEach(scene => { scene.assets = scene.assets.filter(asset => asset.id !== id) })
    editor.scene = next; delete assetStatus.value[id]; message.value = '资产已删除'
  } catch (error) { message.value = `删除失败：${errorText(error)}` }
  finally { busy.value = false }
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
async function exportZip() {
  busy.value = true
  try { const blob = await exportProject(editor.scene, text => { message.value = text }); download(blob, 'visualtwin-project.zip'); message.value = '项目 ZIP 已导出' }
  catch (error) { message.value = `导出失败：${errorText(error)}` }
  finally { busy.value = false }
}
async function exportWeb() {
  busy.value = true
  try { const blob = await exportStaticWeb(editor.scene, text => { message.value = text }); download(blob, 'visualtwin-static-web.zip'); message.value = '静态 Web ZIP 已导出；请检查 HTTP 数据源的部署可访问性' }
  catch (error) { message.value = `静态导出失败：${errorText(error)}` }
  finally { busy.value = false }
}
async function importZip(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]
  if (!file) return
  busy.value = true
  try {
    const project = await importProject(file, text => { message.value = text })
    message.value = '正在保存项目与资产…'
    await commitProject(project.scene, project.records)
    previewNeedsReset = previewOpen.value
    editor.scene = project.scene; editor.past = []; editor.future = []; editor.selectedId = null
    resetEvents()
    message.value = '项目 ZIP 已导入'
  } catch (error) { message.value = `导入失败：${errorText(error)}` }
  finally { input.value = ''; busy.value = false }
}
function newProject() { previewNeedsReset = previewOpen.value; editor.commit(JSON.parse(JSON.stringify(exampleScene)) as SceneDocument); editor.selectedId = null; resetEvents(); message.value = '已新建场景' }
function startDrag2d(event: DragEvent, type: ComponentType) {
  event.dataTransfer?.setData('application/x-visualtwin-2d', type)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
function dragOver2d(event: DragEvent) {
  if (event.dataTransfer?.types.includes('application/x-visualtwin-2d')) event.preventDefault()
}
function drop2d(event: DragEvent) {
  const type = event.dataTransfer?.getData('application/x-visualtwin-2d') as ComponentType
  if (!type || !Object.hasOwn(registry, type) || !canvasWrap.value) return
  event.preventDefault(); event.stopPropagation()
  if (passthrough2d.value) { message.value = '请先切换到二维编辑，再拖入组件'; return }
  const rect = canvasWrap.value.getBoundingClientRect()
  const point = toDesign(event.clientX - rect.left - canvasWrap.value.clientLeft, event.clientY - rect.top - canvasWrap.value.clientTop, fitFrame(canvasWrap.value.clientWidth, canvasWrap.value.clientHeight, editor.scene.canvas.width, editor.scene.canvas.height), editor.scene.canvas.width, editor.scene.canvas.height)
  if (point) editor.add2d(type, point)
  else message.value = '请将组件拖到设计画布内'
}
function update2d(item: Component2D) {
  try { editor.update2d(item.id, target => Object.assign(target, item)); message.value = '' }
  catch (error) { message.value = `属性无效：${errorText(error)}` }
}
function updateLayout(id: string, layout: Component2D['layout']) {
  editor.update2d(id, item => { item.layout = layout })
}
function setName(event: Event) {
  const name = (event.target as HTMLInputElement).value.trim()
  if (!editor.selected || !name) { message.value = '名称不能为空'; if (editor.selected) (event.target as HTMLInputElement).value = editor.selected.name; return }
  editor.update(editor.selected.id, node => { node.name = name }); message.value = ''
}
function setVisible(event: Event) {
  if (!editor.selected) return
  const visible = (event.target as HTMLInputElement).checked
  editor.update(editor.selected.id, node => { node.visible = visible })
}
function setVector(field: VectorField, index: number, event: Event) {
  const input = event.target as HTMLInputElement
  const number = input.valueAsNumber
  if (!editor.selected || !Number.isFinite(number) || (field === 'scale' && number === 0)) {
    message.value = '请输入有效数值，缩放不能为零'
    if (editor.selected) input.value = String(displayValue(editor.selected, field, index))
    return
  }
  const value = field === 'rotation' ? number * Math.PI / 180 : number
  editor.update(editor.selected.id, node => { node.transform[field][index] = value }); message.value = ''
}
function displayValue(node: Node, field: VectorField, index: number) {
  const value = node.transform[field][index]
  return Number((field === 'rotation' ? value * 180 / Math.PI : value).toFixed(3))
}
function commitTransform(id: string, transform: Node['transform']) {
  if (transform.scale.some(value => Math.abs(value) < 1e-8)) { message.value = '缩放不能为零'; return }
  editor.update(id, node => { node.transform = transform }); message.value = ''
}
function exportScene() {
  download(new Blob([JSON.stringify(editor.scene, null, 2)], { type: 'application/json' }), 'scene.json')
}
async function importScene(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('文件超过 5 MB')
    const text = await file.text(); const scene = parseScene(text)
    for (const asset of scene.assets) { const record = await getAsset(asset.id); if (!record || record.blob.size !== asset.byteLength || await sha256(record.blob) !== asset.sha256) throw new Error(`本地资产缺失或不匹配：${asset.name}，请导入完整 ZIP`) }
    previewNeedsReset = previewOpen.value; editor.importScene(text); resetEvents(); message.value = '场景已导入'
  } catch (error) { message.value = `导入失败：${error instanceof Error ? error.message : '未知错误'}` }
  finally { input.value = '' }
}
</script>

<template>
  <div class="studio">
    <div v-if="busy || !ready" class="operation-overlay" role="status">{{ message || '正在读取本地项目…' }}</div>
    <header class="topbar">
      <div class="brand"><span class="brand-mark">V</span><div><strong>VisualTwin</strong><small>STUDIO</small></div></div>
      <div class="divider"></div>
      <div class="project"><span>项目 /</span><strong>{{ editor.scene.name }}</strong></div>
      <div class="top-actions">
        <button class="tool-button" :disabled="!editor.past.length" @click="editor.undo()">撤销</button>
        <button class="tool-button" :disabled="!editor.future.length" @click="editor.redo()">重做</button>
        <button class="tool-button" @click="newProject">新建</button>
        <button class="tool-button" @click="zipInput?.click()">导入项目</button>
        <button class="tool-button" @click="exportZip">导出项目</button>
        <button class="tool-button" @click="exportWeb">导出静态 Web</button>
        <input ref="zipInput" type="file" accept=".zip,application/zip" hidden @change="importZip">
        <button class="tool-button" @click="fileInput?.click()">导入 JSON</button>
        <button class="tool-button" @click="exportScene">导出 JSON</button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importScene">
        <button class="preview" @click="openPreview">▷ &nbsp;预览当前场景</button>
      </div>
    </header>
    <div v-if="previewScene" class="preview-dialog"><button class="tool-button preview-close" @click="closePreview">关闭预览</button><PlayerView :key="previewGeneration" :document="previewScene" :resolve-asset="async id => previewAssets.get(id)" /></div>
    <div class="workspace">
      <aside class="sidebar left">
        <div class="panel-title"><span>场景资源</span></div>
        <div class="tabs"><span class="active">组件库</span></div>
        <div class="section-head"><span>数据源与绑定</span><button class="text-button" @click="openDataConfig">配置 JSON</button></div>
        <div v-if="showDataConfig" class="property-form"><p>配置 dataSources 与 bindings；不要填写密钥或令牌。</p><p v-for="item in editor.scene.components2d" :key="item.id">{{ item.name }}：{{ item.id }}</p><p v-for="node in editor.scene.scene3d.nodes" :key="node.id">{{ node.name }}：{{ node.id }}</p><button @click="exampleDataConfig">填入静态柱状图示例</button><textarea v-model="dataConfig" aria-label="数据源与绑定 JSON" rows="12"></textarea><button @click="saveDataConfig">保存配置</button><button @click="showDataConfig = false">取消</button></div>
        <div v-if="dataErrors.length" role="alert" class="asset-limit">{{ dataErrors.join('；') }}</div>
        <div class="section-head"><span>事件规则</span><button class="text-button" @click="openEventConfig">配置事件</button></div>
        <div v-if="showEventConfig" class="property-form"><p>点击示例生成双向联动；高亮索引从 0 开始。点击图表数据项可隐藏模型，刷新可恢复。</p><p v-for="item in editor.scene.components2d" :key="item.id">{{ item.name }}：{{ item.id }}</p><p v-for="node in editor.scene.scene3d.nodes" :key="node.id">{{ node.name }}：{{ node.id }}</p><button @click="exampleEventConfig">填入双向事件示例</button><textarea v-model="eventConfig" aria-label="事件规则 JSON" rows="12"></textarea><button @click="saveEventConfig">保存事件</button><button @click="showEventConfig = false">取消</button></div>
        <div v-if="eventError" role="alert" class="asset-limit">{{ eventError }}</div>
        <div class="section-head"><span>基础组件</span><span>拖动或点击添加</span></div>
        <button v-for="[type, name] in primitives" :key="type" class="component-card" draggable="true" @dragstart="startDrag($event, type)" @click="editor.add(type)"><span class="cube-icon">◇</span><span><strong>{{ name }}</strong><small>基础几何体</small></span></button>
        <div class="section-head"><span>二维组件</span><span>拖动或点击添加</span></div>
        <button v-for="type in componentTypes" :key="type" class="component-card" draggable="true" @dragstart="startDrag2d($event, type)" @click="editor.add2d(type)"><span class="cube-icon">▦</span><span><strong>{{ registry[type].name }}</strong><small>{{ registry[type].category }}</small></span></button>
        <div class="asset-panel"><div class="panel-title"><span>模型资产</span><button class="text-button" @click="glbInput?.click()">上传 GLB</button></div><input ref="glbInput" type="file" accept=".glb,model/gltf-binary" hidden @change="uploadGlb"><div class="asset-limit">单个文件上限 {{ Math.round(limits.modelBytes / 1048576) }} MB</div><div v-for="asset in editor.scene.assets" :key="asset.id" class="asset-row"><button class="asset-item" draggable="true" @dragstart="dragAsset($event, asset.id)" @click="editor.addModel(asset.id)"><strong>{{ asset.name }}</strong><small>{{ (asset.byteLength / 1024).toFixed(1) }} KB · {{ assetStatus[asset.id] || '已保存' }}</small></button><button class="text-button" :aria-label="`删除资产 ${asset.name}`" @click="removeAsset(asset.id)">删除</button></div><div v-if="!editor.scene.assets.length" class="asset-limit">暂无模型，上传后可拖入场景</div></div>
        <div class="tree-panel"><div class="panel-title"><span>场景树</span><button class="text-button" @click="editor.selectedId = null">取消选择</button></div><div class="tree-root">⌄ <span>▧</span> 场景</div><button v-for="{ node, depth } in tree" :key="node.id" class="tree-item" :class="{ selected: editor.selectedId === node.id }" :style="{ paddingLeft: `${28 + depth * 16}px` }" @click="editor.selectedId = node.id"><span>◇</span> {{ node.name }}<small>{{ node.visible === false ? '隐藏' : '◉' }}</small></button><button v-for="item in editor.scene.components2d" :key="item.id" class="tree-item" :class="{ selected: editor.selectedId === item.id }" @click="editor.selectedId = item.id"><span>▦</span> {{ item.name }}<small>{{ item.visible ? '◉' : '隐藏' }}</small></button></div>
      </aside>
      <main class="center">
        <div class="canvas-toolbar"><div><strong>场景编辑</strong><span class="toolbar-sub">三维视图</span></div><div class="mode-buttons"><button v-for="item in ([['translate','移动'],['rotate','旋转'],['scale','缩放']] as const)" :key="item[0]" :class="{ active: mode === item[0] }" @click="mode = item[0]">{{ item[1] }}</button></div><button class="tool-button" :class="{ 'priority-active': passthrough2d }" :aria-pressed="passthrough2d" @click="passthrough2d = !passthrough2d">{{ passthrough2d ? '3D 操作优先（2D 穿透）' : '2D 编辑（点击切换穿透）' }}</button><div class="view-label"><span class="live-dot"></span> 透视视图</div></div>
        <div ref="canvasWrap" class="canvas-wrap" @dragover="dragOver2d" @drop="drop2d"><SceneViewport :document="eventScene" editable :selected-id="editor.selectedId" :mode="mode" :resolve-asset="resolveAsset" @asset-status="(id, status) => assetStatus[id] = status" @status="sceneReady = $event" @select="editor.selectedId = $event" @click-node="dispatchEvent" @drop="handleDrop" @transform="commitTransform" /><Overlay2D :document="eventScene" :highlights="highlights" editable :passthrough="passthrough2d" :selected-id="editor.selectedId" @select="editor.selectedId = $event" @chart-click="dispatchEvent" @layout="updateLayout" /><div class="canvas-overlay"><span class="overlay-icon">✥</span><div><strong>三维场景</strong><small>点击选中 · 左键旋转视角 · 滚轮缩放</small></div></div><div class="canvas-badge">3D VIEWPORT</div></div>
      </main>
      <aside class="sidebar right"><div class="panel-title"><span>属性面板</span></div>
        <Properties2D v-if="editor.selected2d" :key="editor.selected2d.id" :item="editor.selected2d" @change="update2d" @error="message = $event" @duplicate="editor.duplicate2d(editor.selected2d!.id)" @remove="editor.remove2d(editor.selected2d!.id)" />
        <div v-else-if="editor.selected" :key="editor.selected.id" class="property-form">
          <label>名称<input aria-label="对象名称" :value="editor.selected.name" @change="setName"></label>
          <label>类型<input :value="editor.selected.type === 'model.gltf' ? 'GLB 模型' : primitiveNames[editor.selected.type]" readonly></label>
          <label class="check-label"><input aria-label="显示对象" type="checkbox" :checked="editor.selected.visible !== false" @change="setVisible"> 显示对象</label>
          <div v-for="field in vectorFields" :key="field.key" class="vector-group"><span>{{ field.label }}</span><div class="vector-inputs"><label v-for="(axis, index) in ['X', 'Y', 'Z']" :key="axis">{{ axis }}<input type="number" step="0.1" :aria-label="`${field.label} ${axis}`" :value="displayValue(editor.selected, field.key, index)" @change="setVector(field.key, index, $event)"></label></div></div>
          <div class="object-actions"><button @click="editor.duplicate(editor.selected.id)">复制</button><button class="danger" @click="editor.remove(editor.selected.id)">删除</button></div>
        </div>
        <div v-else class="empty-properties"><div class="empty-icon">⌖</div><strong>未选择对象</strong><p>选择场景中的对象后<br>在此查看与编辑属性</p></div>
        <div class="property-note"><span>场景信息</span><div><span>对象数量</span><strong>{{ editor.scene.scene3d.nodes.length }}</strong></div></div>
      </aside>
    </div>
    <footer class="statusbar"><div><span class="live-dot"></span> {{ sceneReady ? '场景已就绪' : '场景不可用' }} <span class="status-sep">|</span> {{ message || 'WebGL2' }}</div><div>VisualTwin Studio <span class="status-sep">|</span> P6 事件联动</div></footer>
  </div>
</template>
