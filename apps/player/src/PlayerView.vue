<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SceneDocument } from '@visualtwin/schema'
import { SceneViewport } from '@visualtwin/runtime-3d'
import { Overlay2D, useRuntimeData, useEventRuntime } from '@visualtwin/runtime-2d'

const props = defineProps<{ document: SceneDocument, resolveAsset?: (id: string) => Promise<Blob | undefined> }>()
const assetError = ref('')
const { scene: dataScene, errors } = useRuntimeData(computed(() => props.document))
const { scene, highlights, error, dispatch } = useEventRuntime(dataScene)
</script>

<template><main class="player-view"><SceneViewport :document="scene" :resolve-asset="resolveAsset" @click-node="dispatch" @asset-status="(_id, status) => assetError = status.startsWith('加载失败') ? status : ''" /><Overlay2D :document="scene" :highlights="highlights" @chart-click="dispatch" /><div v-if="errors.length || error || assetError" class="player-error" role="alert">{{ [...errors, error, assetError].filter(Boolean).join('；') }}</div></main></template>
<style scoped>.player-view{position:relative;width:100%;height:100%;background:#111b29}.player-error{position:absolute;top:20px;right:24px;color:#ffb0a8;font-size:13px;pointer-events:none}</style>
