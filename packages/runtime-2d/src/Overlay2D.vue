<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SceneDocument } from '@visualtwin/schema'
import { views } from './views'
import { fitFrame } from './coordinates'
import type { Component2D } from './registry'

type Layout = Component2D['layout']
const props = withDefaults(defineProps<{ document: SceneDocument, editable?: boolean, selectedId?: string | null, passthrough?: boolean, highlights?: Record<string, number> }>(), { editable: false, selectedId: null, passthrough: false, highlights: () => ({}) })
const emit = defineEmits<{ select: [id: string], layout: [id: string, value: Layout], chartClick: [id: string, dataIndex: number] }>()
const host = ref<HTMLDivElement>()
const size = ref({ width: 0, height: 0 })
const frame = computed(() => fitFrame(size.value.width, size.value.height, props.document.canvas.width, props.document.canvas.height))
const preview = ref<{ id: string, layout: Layout } | null>(null)
let drag: { id: string, pointer: number, x: number, y: number, start: Layout, resize: boolean, target: HTMLElement } | null = null
let suppressChartClick = false
let observer: ResizeObserver | undefined
function begin(event: PointerEvent, item: Component2D, resize = false) {
  if (!props.editable || props.passthrough || event.button !== 0 || !frame.value.scale) return
  suppressChartClick = resize
  event.stopPropagation()
  emit('select', item.id)
  const target = event.currentTarget as HTMLElement
  drag = { id: item.id, pointer: event.pointerId, x: event.clientX, y: event.clientY, start: { ...item.layout }, resize, target }
  if (resize) target.setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (!drag || drag.pointer !== event.pointerId) return
  event.stopPropagation()
  const dx = (event.clientX - drag.x) / frame.value.scale, dy = (event.clientY - drag.y) / frame.value.scale
  if (!drag.resize && !preview.value && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 4) return
  suppressChartClick = true
  if (!drag.resize && !preview.value) drag.target.setPointerCapture(event.pointerId)
  const layout = { ...drag.start }
  if (drag.resize) { layout.width = Math.max(40, drag.start.width + dx); layout.height = Math.max(40, drag.start.height + dy) }
  else { layout.x = drag.start.x + dx; layout.y = drag.start.y + dy }
  preview.value = { id: drag.id, layout }
}
function end(event: PointerEvent, cancel = false) {
  if (!drag || drag.pointer !== event.pointerId) return
  event.stopPropagation()
  if (!cancel && preview.value?.id === drag.id) emit('layout', drag.id, { ...preview.value.layout })
  drag = null; preview.value = null
}
function itemLayout(item: Component2D) { return preview.value?.id === item.id ? preview.value.layout : item.layout }
onMounted(() => {
  if (!host.value) return
  observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; size.value = { width: rect.width, height: rect.height } })
  observer.observe(host.value)
})
function cancelDrag() {
  if (drag?.target.hasPointerCapture?.(drag.pointer)) drag.target.releasePointerCapture(drag.pointer)
  drag = null; preview.value = null
}
watch(() => props.passthrough, enabled => { if (enabled) cancelDrag() })
onBeforeUnmount(() => { observer?.disconnect(); cancelDrag() })
</script>
<template>
  <div ref="host" class="overlay-host" :class="{ passthrough }">
    <div class="design" :style="{ width: `${document.canvas.width}px`, height: `${document.canvas.height}px`, left: `${frame.left}px`, top: `${frame.top}px`, transform: `scale(${frame.scale})` }">
      <template v-for="item in document.components2d" :key="item.id">
      <div v-if="item.visible" class="item" :class="{ selected: editable && selectedId === item.id, editing: editable }" :data-component-id="item.id" :style="{ left: `${itemLayout(item).x}px`, top: `${itemLayout(item).y}px`, width: `${itemLayout(item).width}px`, height: `${itemLayout(item).height}px`, zIndex: item.layout.zIndex, background: item.style.background, opacity: item.style.opacity }" @pointerdown="begin($event, item)" @pointermove="move" @pointerup="end($event)" @pointercancel="end($event, true)">
        <component :is="views[item.type]" :component="item" :highlight-index="highlights[item.id]" @chart-click="(index: number) => { if (!passthrough && !suppressChartClick) emit('chartClick', item.id, index) }" />
        <div v-if="editable && !passthrough && selectedId === item.id" class="resize" aria-label="调整组件尺寸" @pointerdown.stop="begin($event, item, true)" @pointermove.stop="move" @pointerup.stop="end($event)" @pointercancel.stop="end($event, true)"></div>
      </div>
      </template>
    </div>
  </div>
</template>
<style scoped>
.overlay-host{position:absolute;inset:0;overflow:hidden;pointer-events:none}.design{position:absolute;transform-origin:top left;pointer-events:none;overflow:hidden}.item{position:absolute;pointer-events:auto;overflow:visible;box-sizing:border-box}.item.editing{cursor:move;touch-action:none}.passthrough .item{pointer-events:none;filter:opacity(.3)}.item.selected{outline:3px solid #72b3ff}.resize{position:absolute;width:22px;height:22px;right:-11px;bottom:-11px;background:#fff;border:3px solid #458cff;border-radius:3px;cursor:nwse-resize;touch-action:none}
</style>
