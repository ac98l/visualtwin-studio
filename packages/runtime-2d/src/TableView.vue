<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ScreenComponent2D } from './registry'
const props = defineProps<{ component: Extract<ScreenComponent2D, { type: 'screen.table' }>, editable?: boolean }>()
const host = ref<HTMLElement>(); const height = ref(0); let observer: ResizeObserver | undefined
const overflow = computed(() => props.component.props.rows.length * props.component.props.rowHeight > Math.max(0, height.value - props.component.props.headerHeight))
const scrollable = computed(() => overflow.value && props.component.props.speed > 0 && props.component.props.rows.length > 0)
const duration = computed(() => props.component.props.rows.length * props.component.props.rowHeight / Math.max(1, props.component.props.speed))
const widths = computed(() => props.component.props.columns.map(column => `${column.width}fr`).join(' '))
onMounted(() => { observer = new ResizeObserver(entries => { height.value = entries[0].contentRect.height }); if (host.value) observer.observe(host.value) })
onBeforeUnmount(() => observer?.disconnect())
</script>
<template><div ref="host" class="table" :style="{ color: component.props.color, fontSize: component.props.fontSize + 'px' }"><div class="header row" :style="{ height: component.props.headerHeight + 'px', background: component.props.headerBackground, gridTemplateColumns: widths }"><span v-for="(column, index) in component.props.columns" :key="index">{{ column.title }}</span></div><div class="viewport"><div class="track" :class="{ scrolling: scrollable }" :style="{ animationDuration: duration + 's', animationPlayState: editable || component.props.paused ? 'paused' : 'running' }"><div v-for="copyIndex in (scrollable ? 2 : 1)" :key="copyIndex"><div v-for="(row, index) in component.props.rows" :key="index" class="row" :style="{ height: component.props.rowHeight + 'px', background: index % 2 ? component.props.alternateBackground : component.props.rowBackground, gridTemplateColumns: widths }"><span v-for="(_column, columnIndex) in component.props.columns" :key="columnIndex">{{ row[columnIndex] ?? '' }}</span></div></div></div></div></div></template>
<style scoped>.table{width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden}.row{display:grid;flex:none;align-items:center;box-sizing:border-box}.row span{padding:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.header{font-weight:700}.viewport{flex:1;min-height:0;overflow:hidden}.track.scrolling{animation:table-scroll linear infinite}@keyframes table-scroll{to{transform:translateY(-50%)}}</style>
