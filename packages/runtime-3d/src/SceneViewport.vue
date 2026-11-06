<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { eventRegistry, type SceneDocument } from '@visualtwin/schema'
import { createPrimitive } from './primitives'
import { loadModel, disposeModel } from './model'

type Node = SceneDocument['scene3d']['nodes'][number]
type Transform = Node['transform']
type Mode = 'translate' | 'rotate' | 'scale'
const props = withDefaults(defineProps<{ document: SceneDocument, editable?: boolean, selectedId?: string | null, mode?: Mode, resolveAsset?: (id: string) => Promise<Blob | undefined> }>(), { editable: false, selectedId: null, mode: 'translate' })
const emit = defineEmits<{ status: [ready: boolean], select: [id: string | null], clickNode: [id: string], transform: [id: string, value: Transform], drop: [type: string, position: [number, number, number]], assetStatus: [id: string, status: string] }>()
const container = ref<HTMLDivElement>()
const error = ref('')
let dispose: (() => void) | undefined
let sync: (() => void) | undefined
let syncSelection: (() => void) | undefined
let changeMode: (() => void) | undefined

onMounted(() => {
  const element = container.value
  if (!element) return
  let renderer: THREE.WebGLRenderer
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2')
    if (!context) throw new Error('WebGL2 unavailable')
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true })
  } catch {
    error.value = '无法启动三维画布，请检查浏览器是否支持 WebGL2，或启用硬件加速。'
    emit('status', false)
    return
  }
  element.appendChild(renderer.domElement)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const scene = new THREE.Scene()
  const config = props.document.scene3d.camera
  const camera = new THREE.PerspectiveCamera(config.fov, 1, config.near, config.far)
  camera.position.set(...config.position)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(...config.target)
  controls.enableDamping = true
  controls.update()
  let cameraConfig = JSON.stringify(config)
  scene.add(new THREE.AmbientLight(0xffffff, 1.3))
  const light = new THREE.DirectionalLight(0xffffff, 2)
  light.position.set(5, 8, 5)
  scene.add(light)
  scene.add(new THREE.GridHelper(20, 20, 0x45617b, 0x263d51), new THREE.AxesHelper(2))
  const objects = new Map<string, THREE.Group>()
  const contents = new Map<string, THREE.Object3D>()
  const loading = new Map<string, symbol>()
  let disposed = false
  const types = new Map<string, string>()
  const nodeKey = (node: Node) => node.type === 'model.gltf' ? `${node.type}:${node.props.assetId}` : node.type
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const gizmo = props.editable ? new TransformControls(camera, renderer.domElement) : null
  if (gizmo) scene.add(gizmo.getHelper())
  let dragging = false
  let start: { x: number, y: number } | null = null
  const removeContent = (id: string) => {
    loading.delete(id)
    const content = contents.get(id)
    if (content) { content.removeFromParent(); disposeModel(content); contents.delete(id) }
  }
  const loadContent = (node: Node, root: THREE.Group) => {
    if (node.type !== 'model.gltf') { const content = createPrimitive(node); contents.set(node.id, content); root.add(content); return }
    const token = Symbol(); loading.set(node.id, token)
    const placeholder = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xe6a23c, wireframe: true }))
    contents.set(node.id, placeholder); root.add(placeholder)
    emit('assetStatus', node.props.assetId, '加载中')
    const assetId = node.props.assetId
    void (async () => {
      let content: THREE.Object3D | undefined
      try {
        const blob = await props.resolveAsset?.(assetId)
        if (!blob) throw new Error('模型文件缺失')
        content = await loadModel(blob)
        if (disposed || loading.get(node.id) !== token) { disposeModel(content); return }
        removeContent(node.id); contents.set(node.id, content); root.add(content)
        emit('assetStatus', assetId, '已加载')
      } catch (error) {
        if (content) disposeModel(content)
        if (!disposed && loading.get(node.id) === token) emit('assetStatus', assetId, `加载失败：${error instanceof Error ? error.message : String(error)}`)
      }
    })()
  }
  const setPointer = (event: MouseEvent | DragEvent) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
  }
  syncSelection = () => {
    if (!gizmo || dragging) return
    const object = props.selectedId ? objects.get(props.selectedId) : undefined
    let current: THREE.Object3D | null | undefined = object
    let visible = Boolean(object)
    while (current) { if (!current.visible) visible = false; current = current.parent }
    if (object && visible) gizmo.attach(object)
    else gizmo.detach()
  }
  changeMode = () => gizmo?.setMode(props.mode)
  sync = () => {
    if (dragging) return
    scene.background = new THREE.Color(props.document.canvas.background)
    const nextCamera = props.document.scene3d.camera
    const nextCameraConfig = JSON.stringify(nextCamera)
    if (nextCameraConfig !== cameraConfig) {
      cameraConfig = nextCameraConfig
      camera.position.set(...nextCamera.position)
      camera.fov = nextCamera.fov; camera.near = nextCamera.near; camera.far = nextCamera.far
      camera.updateProjectionMatrix()
      controls.target.set(...nextCamera.target); controls.update()
    }
    const nodes = props.document.scene3d.nodes
    const ids = new Set(nodes.map(node => node.id))
    for (const [id, object] of objects) {
      if (!ids.has(id) || types.get(id) !== (nodes.find(node => node.id === id) ? nodeKey(nodes.find(node => node.id === id)!) : undefined)) {
        if (gizmo?.object === object) gizmo.detach()
        object.removeFromParent(); removeContent(id); objects.delete(id); types.delete(id)
      }
    }
    for (const node of nodes) {
      let object = objects.get(node.id)
      if (!object) { object = new THREE.Group(); object.userData.sceneId = node.id; objects.set(node.id, object); types.set(node.id, nodeKey(node)); loadContent(node, object) }
      object.name = node.name
      object.visible = node.visible !== false
      object.position.set(...node.transform.position)
      object.rotation.set(...node.transform.rotation)
      object.scale.set(...node.transform.scale)
      if (node.type !== 'model.gltf') { const mesh = contents.get(node.id) as THREE.Mesh | undefined; if (mesh) (mesh.material as THREE.MeshStandardMaterial).color.set(node.props.color) }
    }
    for (const node of nodes) (node.parentId ? objects.get(node.parentId)! : scene).add(objects.get(node.id)!)
    syncSelection?.()
  }
  const onPointerDown = (event: PointerEvent) => { if (event.button === 0) start = { x: event.clientX, y: event.clientY } }
  const onPointerUp = (event: PointerEvent) => {
    if (!start || event.button !== 0) return
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    start = null
    if (dragging || gizmo?.axis || moved > 4) return
    setPointer(event)
    const hit = raycaster.intersectObjects([...objects.values()], true).find(intersection => {
      let current: THREE.Object3D | null = intersection.object
      while (current) { if (!current.visible) return false; current = current.parent }
      return true
    })
    let picked: THREE.Object3D | null = hit?.object ?? null
    while (picked && objects.get(picked.userData.sceneId as string) !== picked) picked = picked.parent
    const id = picked ? picked.userData.sceneId as string : null
    if (props.editable) emit('select', id)
    const node = id ? props.document.scene3d.nodes.find(item => item.id === id) : undefined
    if (node && (node.type !== 'model.gltf' || !loading.has(node.id)) && eventRegistry[node.type]?.events.includes('click')) emit('clickNode', node.id)
  }
  const onDragOver = (event: DragEvent) => { if (event.dataTransfer?.types.some(type => ['application/x-visualtwin-primitive', 'application/x-visualtwin-asset'].includes(type))) event.preventDefault() }
  const onDrop = (event: DragEvent) => {
    const asset = event.dataTransfer?.getData('application/x-visualtwin-asset')
    const type = asset ? `asset:${asset}` : event.dataTransfer?.getData('application/x-visualtwin-primitive')
    if (!type || (!asset && !['primitive.box', 'primitive.sphere', 'primitive.plane', 'primitive.cylinder'].includes(type))) return
    event.preventDefault()
    setPointer(event)
    const point = new THREE.Vector3()
    if (raycaster.ray.intersectPlane(plane, point)) emit('drop', type, [point.x, point.y, point.z])
  }
  gizmo?.addEventListener('dragging-changed', event => { dragging = Boolean(event.value); controls.enabled = !dragging })
  gizmo?.addEventListener('mouseDown', () => { start = null })
  gizmo?.addEventListener('mouseUp', () => {
    const object = gizmo.object
    if (!object) return
    emit('transform', object.userData.sceneId as string, {
      position: [object.position.x, object.position.y, object.position.z],
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: [object.scale.x, object.scale.y, object.scale.z]
    })
    queueMicrotask(() => sync?.())
  })
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  if (props.editable) {
    element.addEventListener('dragover', onDragOver)
    element.addEventListener('drop', onDrop)
  }
  sync(); changeMode()
  const resize = () => {
    const width = element.clientWidth, height = element.clientHeight
    if (!width || !height) return
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(element); resize()
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })
  emit('status', true)
  dispose = () => {
    disposed = true; loading.clear()
    renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose()
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    element.removeEventListener('dragover', onDragOver); element.removeEventListener('drop', onDrop)
    if (gizmo) { scene.remove(gizmo.getHelper()); gizmo.dispose() }
    for (const id of contents.keys()) removeContent(id)
    scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(material => material.dispose())
      }
    })
    objects.clear(); renderer.dispose(); renderer.domElement.remove()
    sync = undefined; syncSelection = undefined; changeMode = undefined
  }
})
watch(() => props.document, () => sync?.(), { deep: true })
watch(() => props.selectedId, () => syncSelection?.())
watch(() => props.mode, () => changeMode?.())
onBeforeUnmount(() => dispose?.())
</script>

<template>
  <div ref="container" class="scene-viewport">
    <div v-if="error" class="scene-error" role="alert">{{ error }}</div>
  </div>
</template>

<style scoped>
.scene-viewport { position: relative; width: 100%; height: 100%; overflow: hidden; }
.scene-viewport :deep(canvas) { display: block; width: 100%; height: 100%; }
.scene-error { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; color: #b7c8da; text-align: center; background: #111b29; }
</style>
