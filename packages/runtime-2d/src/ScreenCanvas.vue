<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ScreenDocument } from '@visualtwin/schema'
import { fitFrame, toDesign } from './coordinates'
import Overlay2D from './Overlay2D.vue'
import { SceneViewport } from '@visualtwin/runtime-3d'
import { useScreenEvents } from './screen-events'
import type { ScreenComponent2D as Component2D } from './registry'
const props = withDefaults(defineProps<{ document: ScreenDocument, editable?: boolean, selectedId?: string | null, passthrough?: boolean, interactive?: boolean, eventEpoch?: number, advanced?: boolean, selectedIds?: string[], resolveAsset?: (id: string) => Promise<Blob | undefined> }>(), { editable: false, selectedId: null })
const emit = defineEmits<{ select: [id: string | null], layout: [id: string, value: Component2D['layout']], drop: [type: string, position: { x: number, y: number }], assetError: [message: string], pick: [id: string, additive: boolean], selectMany: [ids: string[]], moveMany: [ids: string[], dx: number, dy: number], rotate: [id: string, angle: number] }>()
const events = useScreenEvents(computed(() => props.document))
watch(() => [props.interactive, props.eventEpoch], () => events.reset())
const host = ref<HTMLElement>()
const size = ref({ width: 0, height: 0 })
const frame = computed(() => fitFrame(size.value.width, size.value.height, props.document.canvas.width, props.document.canvas.height))
const assetError = ref('')
const assetStatus = ref('')
function onAssetStatus(_id: string, status: string) {
  assetStatus.value = status
  if (status.startsWith('加载失败')) { assetError.value = status; emit('assetError', status) }
  else if (status === '已加载') assetError.value = ''
}
let observer: ResizeObserver | undefined
function drop(event: DragEvent) {
  if (!props.editable || !host.value) return
  const type = event.dataTransfer?.getData('application/x-visualtwin-2d')
  if (!type) return
  event.preventDefault()
  const rect = host.value.getBoundingClientRect()
  const position = toDesign(event.clientX - rect.left, event.clientY - rect.top, frame.value, props.document.canvas.width, props.document.canvas.height)
  if (position) emit('drop', type, position)
}
onMounted(() => { observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; size.value = { width: rect.width, height: rect.height } }); if (host.value) observer.observe(host.value) })
onBeforeUnmount(() => observer?.disconnect())
</script>
<template><div ref="host" class="screen-host" @dragover.prevent @drop="drop"><div class="screen-canvas" :data-asset-status="assetStatus" :style="{ width: document.canvas.width + 'px', height: document.canvas.height + 'px', background: document.canvas.background, left: frame.left + 'px', top: frame.top + 'px', transform: `scale(${frame.scale})` }" @pointerdown.self="editable && emit('select', null)"><SceneViewport v-if="document.background.type === 'scene'" :document="events.scene.value.background.type === 'scene' ? events.scene.value.background.scene : document.background.scene" :resolve-asset="resolveAsset" @asset-status="onAssetStatus" @click-node="id => interactive && events.dispatch('background', id)" /></div><Overlay2D :document="events.scene.value" :highlights="events.highlights.value" :advanced="advanced" :selected-ids="selectedIds" :rotations="document.rotations" :groups="document.groups" :editable="editable" :passthrough="passthrough" :selected-id="selectedId" @select="emit('select', $event)" @pick="(id, additive) => emit('pick', id, additive)" @select-many="ids => emit('selectMany', ids)" @move-many="(ids, dx, dy) => emit('moveMany', ids, dx, dy)" @rotate="(id, angle) => emit('rotate', id, angle)" @chart-click="(id, index) => interactive && events.dispatch('foreground', id, index)" @layout="(id, value) => emit('layout', id, value)" /><div v-if="interactive && events.error.value" class="asset-error" role="alert">{{ events.error.value }}</div><div v-if="assetError && document.background.type === 'scene'" class="asset-error" role="alert">{{ assetError }}</div></div></template>
<style scoped>.screen-host{position:relative;width:100%;height:100%;overflow:hidden;background:#0a111b}.asset-error{position:absolute;right:10px;top:10px;color:#ff9b9b;background:#1a2635;padding:8px;z-index:10}.screen-canvas{position:absolute;transform-origin:top left;box-shadow:0 0 0 1px #40536a}</style>
