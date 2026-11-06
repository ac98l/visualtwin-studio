<script setup lang="ts">
import type { ScreenComponent2D } from './registry'
defineProps<{ component: Extract<ScreenComponent2D, { type: 'screen.decoration' }> }>()
</script>
<template><svg class="decoration" :viewBox="component.props.vertical ? '0 0 20 100' : '0 0 100 20'" preserveAspectRatio="none" aria-hidden="true"><g :transform="component.props.vertical ? 'translate(20 0) rotate(90)' : undefined" :stroke="component.props.color" :stroke-width="component.props.thickness" fill="none" vector-effect="non-scaling-stroke"><line x1="2" y1="10" x2="98" y2="10"/><polyline v-if="component.props.variant === 'tech'" points="5,15 20,15 27,5 74,5 81,15 95,15"/><polyline v-if="component.props.variant === 'title'" points="5,17 15,3 70,3 82,17 95,17"/><template v-if="component.props.variant === 'dots'"><circle cx="12" cy="10" r="3" :fill="component.props.color"/><circle cx="50" cy="10" r="3" :fill="component.props.color"/><circle cx="88" cy="10" r="3" :fill="component.props.color"/></template></g></svg></template>
<style scoped>.decoration{width:100%;height:100%;display:block;pointer-events:none}</style>
