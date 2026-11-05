<script setup lang="ts">
import type { Component2D } from './registry'
defineProps<{ component: Extract<Component2D, { type: 'widget.text' }> }>()
</script>
<template><div class="text" :style="{ fontSize: `${component.props.fontSize}px`, fontWeight: component.props.fontWeight, color: component.props.color, textAlign: component.props.align, justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[component.props.align] }">{{ component.props.text }}</div></template>
<style scoped>.text{width:100%;height:100%;display:flex;align-items:center;white-space:pre-wrap;overflow:hidden}</style>
