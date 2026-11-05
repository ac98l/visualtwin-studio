<script setup lang="ts">
import type { Component2D } from './registry'
defineProps<{ component: Extract<Component2D, { type: 'widget.number' }> }>()
</script>
<template><div class="number"><div>{{ component.props.title }}</div><strong :style="{ color: component.props.color }">{{ component.props.value.toFixed(component.props.decimals) }}</strong><span>{{ component.props.unit }}</span></div></template>
<style scoped>.number{height:100%;padding:24px;color:#b9c9db;font-size:20px;box-sizing:border-box}.number strong{display:inline-block;font-size:48px;margin:18px 12px 0 0}.number span{font-size:18px}</style>
