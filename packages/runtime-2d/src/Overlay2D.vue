<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SceneDocument, ScreenDocument } from '@visualtwin/schema'
import { views } from './views'
import { fitFrame } from './coordinates'
import { bounds, normalizeAngle, snapMove, union } from './screen-geometry'
import type { ScreenComponent2D as Component2D } from './registry'

type Layout = Component2D['layout']
const props = withDefaults(defineProps<{ document: Pick<ScreenDocument, 'canvas' | 'components2d'> | Pick<SceneDocument, 'canvas' | 'components2d'>, editable?: boolean, selectedId?: string | null, passthrough?: boolean, highlights?: Record<string, number>, advanced?: boolean, selectedIds?: string[], rotations?: Record<string, number>, groups?: ScreenDocument['groups'], snapEnabled?: boolean, lockedIds?: string[] }>(), { editable: false, selectedId: null, passthrough: false, advanced: false, highlights: () => ({}), selectedIds: () => [], rotations: () => ({}), groups: () => [], snapEnabled: true, lockedIds: () => [] })
const emit = defineEmits<{ select: [id: string], pick: [id: string, additive: boolean], selectMany: [ids: string[]], layout: [id: string, value: Layout], moveMany: [ids: string[], dx: number, dy: number], rotate: [id: string, angle: number], chartClick: [id: string, dataIndex: number] }>()
const host = ref<HTMLDivElement>()
const size = ref({ width: 0, height: 0 })
const frame = computed(() => fitFrame(size.value.width, size.value.height, props.document.canvas.width, props.document.canvas.height))
const preview = ref<{ id: string, layout: Layout } | null>(null)
const movePreview = ref<{ ids: string[], dx: number, dy: number } | null>(null)
const snapLines = ref<ReturnType<typeof snapMove>['lines']>([])
const rotationPreview = ref<{ id: string, angle: number } | null>(null)
const boxPreview = ref<{ x: number, y: number, width: number, height: number } | null>(null)
const groupFor = (id: string) => props.groups?.find(group => group.memberIds.includes(id))
const shown = (item: Component2D) => item.visible && groupFor(item.id)?.visible !== false
const selected = (id: string) => props.advanced ? props.selectedIds.includes(id) : props.selectedId === id
const selectedBounds = computed(() => union(props.document.components2d.filter(item => props.selectedIds.includes(item.id) && shown(item)).map(item => ({ ...item, layout: itemLayout(item) })), props.rotations))
let drag: { id: string, pointer: number, x: number, y: number, start: Layout, resize: boolean, target: HTMLElement, ids: string[] } | null = null
let rotateDrag: { id: string, pointer: number, centerX: number, centerY: number, start: number, pointerStart: number, target: HTMLElement } | null = null
let marquee: { pointer: number, x: number, y: number, target: HTMLElement } | null = null
let suppressChartClick = false
let observer: ResizeObserver | undefined
function begin(event: PointerEvent, item: Component2D, resize = false) {
  if (!props.editable || props.passthrough || event.button !== 0 || !frame.value.scale) return
  suppressChartClick = resize; event.stopPropagation()
  const group = props.advanced ? groupFor(item.id) : undefined
  const ids = props.advanced && props.selectedIds.includes(item.id) ? props.selectedIds : group?.memberIds ?? [item.id]
  if (props.advanced) emit('pick', item.id, event.ctrlKey || event.metaKey)
  else emit('select', item.id)
  if (props.advanced && (event.ctrlKey || event.metaKey)) return
  if (props.advanced && (ids.some(id => props.lockedIds.includes(id)) || group?.memberIds.some(id => props.lockedIds.includes(id)))) return
  const target = event.currentTarget as HTMLElement
  drag = { id: item.id, pointer: event.pointerId, x: event.clientX, y: event.clientY, start: { ...item.layout }, resize, target, ids }
  if (resize) target.setPointerCapture(event.pointerId)
}
function beginRotate(event: PointerEvent, item: Component2D) {
  if (!props.editable || props.passthrough || event.button !== 0 || (props.advanced && props.lockedIds.includes(item.id))) return
  event.stopPropagation(); event.preventDefault(); suppressChartClick = true
  const target = event.currentTarget as HTMLElement, rect = target.parentElement!.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2
  rotateDrag = { id: item.id, pointer: event.pointerId, centerX, centerY, start: props.rotations[item.id] ?? 0, pointerStart: Math.atan2(event.clientY - centerY, event.clientX - centerX), target }
  target.setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (rotateDrag && rotateDrag.pointer === event.pointerId) {
    event.stopPropagation(); const angle = Math.atan2(event.clientY - rotateDrag.centerY, event.clientX - rotateDrag.centerX)
    rotationPreview.value = { id: rotateDrag.id, angle: normalizeAngle(rotateDrag.start + (angle - rotateDrag.pointerStart) * 180 / Math.PI) }; return
  }
  if (!drag || drag.pointer !== event.pointerId) return
  event.stopPropagation()
  const dx = (event.clientX - drag.x) / frame.value.scale, dy = (event.clientY - drag.y) / frame.value.scale
  if (!drag.resize && !preview.value && !movePreview.value && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 4) return
  suppressChartClick = true
  if (!drag.resize && !preview.value && !movePreview.value) drag.target.setPointerCapture(event.pointerId)
  let offset = { x: dx, y: dy }
  if (props.advanced && !drag.resize && props.snapEnabled) {
    const moving = props.document.components2d.filter(value => drag!.ids.includes(value.id))
    const box = union(moving, props.rotations)
    if (box) {
      const refs = props.document.components2d.map(value => ({ id: value.id, visible: shown(value), box: bounds(value, props.rotations[value.id] ?? 0) }))
      const snapped = snapMove(box, refs, drag.ids, props.document.canvas, frame.value.scale, offset)
      offset = snapped.offset; snapLines.value = snapped.lines
    }
  }
  if (props.advanced && !drag.resize && drag.ids.length > 1) { movePreview.value = { ids: drag.ids, dx: offset.x, dy: offset.y }; return }
  const layout = { ...drag.start }
  if (drag.resize) { const radians = (props.rotations[drag.id] ?? 0) * Math.PI / 180; layout.width = Math.max(40, drag.start.width + dx * Math.cos(radians) + dy * Math.sin(radians)); layout.height = Math.max(40, drag.start.height - dx * Math.sin(radians) + dy * Math.cos(radians)) }
  else { layout.x = drag.start.x + offset.x; layout.y = drag.start.y + offset.y }
  preview.value = { id: drag.id, layout }
}
function end(event: PointerEvent, cancel = false) {
  if (rotateDrag && rotateDrag.pointer === event.pointerId) {
    event.stopPropagation(); if (!cancel && rotationPreview.value?.id === rotateDrag.id) emit('rotate', rotateDrag.id, rotationPreview.value.angle)
    rotateDrag = null; rotationPreview.value = null; return
  }
  if (!drag || drag.pointer !== event.pointerId) return
  event.stopPropagation()
  if (!cancel && movePreview.value) emit('moveMany', movePreview.value.ids, movePreview.value.dx, movePreview.value.dy)
  else if (!cancel && preview.value?.id === drag.id) emit('layout', drag.id, { ...preview.value.layout })
  if (drag.target.hasPointerCapture?.(drag.pointer)) drag.target.releasePointerCapture(drag.pointer)
  drag = null; preview.value = null; movePreview.value = null; snapLines.value = []
}
function itemLayout(item: Component2D) {
  const layout = preview.value?.id === item.id ? preview.value.layout : item.layout
  return movePreview.value?.ids.includes(item.id) ? { ...layout, x: layout.x + movePreview.value.dx, y: layout.y + movePreview.value.dy } : layout
}
function itemAngle(item: Component2D) { return rotationPreview.value?.id === item.id ? rotationPreview.value.angle : props.rotations[item.id] ?? 0 }
function designPoint(event: PointerEvent) { const rect = host.value!.getBoundingClientRect(); return { x: (event.clientX - rect.left - frame.value.left) / frame.value.scale, y: (event.clientY - rect.top - frame.value.top) / frame.value.scale } }
function startBox(event: PointerEvent) {
  if (!props.advanced || !props.editable || props.passthrough || event.button !== 0 || event.target !== event.currentTarget || !frame.value.scale) return
  event.stopPropagation(); const point = designPoint(event); const target = event.currentTarget as HTMLElement
  marquee = { pointer: event.pointerId, ...point, target }; target.setPointerCapture(event.pointerId); boxPreview.value = { ...point, width: 0, height: 0 }
}
function moveBox(event: PointerEvent) {
  if (!marquee || event.pointerId !== marquee.pointer) return
  const point = designPoint(event); boxPreview.value = { x: Math.min(point.x, marquee.x), y: Math.min(point.y, marquee.y), width: Math.abs(point.x - marquee.x), height: Math.abs(point.y - marquee.y) }
}
function endBox(event: PointerEvent, cancel = false) {
  if (!marquee || event.pointerId !== marquee.pointer) return
  const box = boxPreview.value
  if (!cancel && box) emit('selectMany', box.width * frame.value.scale < 4 && box.height * frame.value.scale < 4 ? [] : props.document.components2d.filter(item => { const r = bounds(item, props.rotations[item.id] ?? 0); return shown(item) && r.x < box.x + box.width && r.x + r.width > box.x && r.y < box.y + box.height && r.y + r.height > box.y }).map(item => item.id))
  marquee = null; boxPreview.value = null
}
function cancelDrag() {
  for (const target of [drag?.target, rotateDrag?.target, marquee?.target]) if (target?.hasPointerCapture?.(drag?.pointer ?? rotateDrag?.pointer ?? marquee?.pointer ?? -1)) target.releasePointerCapture(drag?.pointer ?? rotateDrag?.pointer ?? marquee?.pointer ?? -1)
  drag = null; rotateDrag = null; marquee = null; preview.value = null; movePreview.value = null; rotationPreview.value = null; boxPreview.value = null; snapLines.value = []
}
function onKey(event: KeyboardEvent) { if (event.key === 'Escape') cancelDrag() }
onMounted(() => { if (host.value) { observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; size.value = { width: rect.width, height: rect.height } }); observer.observe(host.value) } if (props.advanced) window.addEventListener('keydown', onKey) })
watch(() => props.passthrough, enabled => { if (enabled) cancelDrag() })
watch(() => props.editable, enabled => { if (!enabled) { cancelDrag(); suppressChartClick = false } })
watch(() => props.snapEnabled, () => { if (drag && !drag.resize) cancelDrag() }, { flush: 'sync' })
watch(() => props.lockedIds, ids => { if ((drag && drag.ids.some(id => ids.includes(id))) || (rotateDrag && ids.includes(rotateDrag.id))) cancelDrag() }, { deep: true, flush: 'sync' })
onBeforeUnmount(() => { observer?.disconnect(); cancelDrag(); window.removeEventListener('keydown', onKey) })
</script>
<template>
  <div ref="host" class="overlay-host" :class="{ passthrough }">
    <div class="design" :class="{ 'screen-edit': advanced && editable && !passthrough }" :style="{ width: `${document.canvas.width}px`, height: `${document.canvas.height}px`, left: `${frame.left}px`, top: `${frame.top}px`, transform: `scale(${frame.scale})` }" @pointerdown="startBox" @pointermove="moveBox" @pointerup="endBox" @pointercancel="event => endBox(event, true)">
      <template v-for="item in document.components2d" :key="item.id">
      <div v-if="shown(item)" class="item" :class="{ selected: editable && selected(item.id), editing: editable }" :data-component-id="item.id" :style="{ left: `${itemLayout(item).x}px`, top: `${itemLayout(item).y}px`, width: `${itemLayout(item).width}px`, height: `${itemLayout(item).height}px`, zIndex: item.layout.zIndex, background: item.type === 'screen.border' ? 'transparent' : item.style.background, opacity: item.style.opacity, transform: advanced || rotations[item.id] !== undefined ? `rotate(${itemAngle(item)}deg)` : undefined }" @pointerdown="begin($event, item)" @pointermove="move" @pointerup="end" @pointercancel="event => end(event, true)">
        <component :is="views[item.type]" :component="item" :editable="editable" :highlight-index="highlights[item.id]" @chart-click="(index: number) => { if (!passthrough && !suppressChartClick) emit('chartClick', item.id, index) }" />
        <template v-if="editable && !passthrough && selected(item.id) && (!advanced || (!lockedIds.includes(item.id) && selectedIds.length === 1 && !groupFor(item.id)))"><div class="resize" aria-label="调整组件尺寸" @pointerdown.stop="begin($event, item, true)" @pointermove.stop="move" @pointerup.stop="end" @pointercancel.stop="event => end(event, true)"></div><div v-if="advanced" class="rotate" aria-label="旋转组件" @pointerdown.stop="beginRotate($event, item)" @pointermove.stop="move" @pointerup.stop="end" @pointercancel.stop="event => end(event, true)"></div></template>
      </div>
      </template>
      <div v-if="advanced && editable && selectedIds.length > 1 && selectedBounds" class="selection-box" :style="{ left: selectedBounds.x + 'px', top: selectedBounds.y + 'px', width: selectedBounds.width + 'px', height: selectedBounds.height + 'px' }"></div>
      <div v-for="line in snapLines" :key="line.axis" class="snap-guide" :class="line.axis" :data-axis="line.axis" :style="line.axis === 'x' ? { left: line.position + 'px' } : { top: line.position + 'px' }"></div>
      <div v-if="boxPreview" class="marquee" :style="{ left: boxPreview.x + 'px', top: boxPreview.y + 'px', width: boxPreview.width + 'px', height: boxPreview.height + 'px' }"></div>
    </div>
  </div>
</template>
<style scoped>
.overlay-host{position:absolute;inset:0;overflow:hidden;pointer-events:none}.design{position:absolute;transform-origin:top left;pointer-events:none;overflow:hidden}.design.screen-edit{pointer-events:auto}.item{position:absolute;pointer-events:auto;overflow:visible;box-sizing:border-box;transform-origin:center}.item.editing{cursor:move;touch-action:none}.passthrough .item{pointer-events:none;filter:opacity(.3)}.item.selected{outline:3px solid #72b3ff}.resize,.rotate{position:absolute;width:22px;height:22px;background:#fff;border:3px solid #458cff;border-radius:3px;touch-action:none}.resize{right:-11px;bottom:-11px;cursor:nwse-resize}.rotate{top:-40px;left:calc(50% - 11px);border-radius:50%;cursor:grab}.selection-box,.marquee{position:absolute;pointer-events:none;z-index:2147483647;border:3px dashed #72b3ff}.marquee{background:#4b9eff33}.snap-guide{position:absolute;pointer-events:none;z-index:2147483647;background:#72b3ff}.snap-guide.x{top:0;bottom:0;width:1px}.snap-guide.y{left:0;right:0;height:1px}
</style>
