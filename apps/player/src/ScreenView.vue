<script setup lang="ts">
import { computed } from 'vue'
import type { ScreenDocument } from '@visualtwin/schema'
import { ScreenCanvas, useRuntimeData } from '@visualtwin/runtime-2d'
const props = defineProps<{ document: ScreenDocument, resolveAsset?: (id: string) => Promise<Blob | undefined> }>()
const { scene, errors } = useRuntimeData(computed(() => props.document))
</script>
<template><ScreenCanvas :document="scene" interactive :resolve-asset="resolveAsset" /><div v-if="errors.length" class="data-errors" role="alert">{{ errors.join('；') }}</div></template>
<style scoped>.data-errors{position:absolute;top:20px;right:20px;color:#ffb0a8;pointer-events:none}</style>
