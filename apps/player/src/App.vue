<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { exampleSceneP6, parseDocument, type SceneDocument, type ScreenDocument } from '@visualtwin/schema'
import PlayerView from './PlayerView.vue'
import ScreenView from './ScreenView.vue'
import { getBackgroundAsset, verifyBackground, checkScreenManifest } from '@visualtwin/screen-storage'
import { fetchAsset, type ManifestAsset } from './assets'
const scene = ref<SceneDocument>()
const screen = ref<ScreenDocument>()
const error = ref('')
const manifest = ref<{ assets: ManifestAsset[] }>()
const staticScreen = document.querySelector('meta[name="visualtwin-static-screen"]') !== null
onMounted(async () => {
  if (import.meta.env.DEV && !new URLSearchParams(location.search).has('scene')) { scene.value = exampleSceneP6; return }
  try {
    const docResponse = await fetch('./scene.json')
    if (!docResponse.ok) throw new Error('缺少 scene.json')
    const parsed = parseDocument(await docResponse.json())
    if (parsed.kind === 'screen') {
      if (staticScreen) {
        const response = await fetch('./manifest.json')
        if (!response.ok) throw new Error('缺少大屏 manifest.json')
        manifest.value = checkScreenManifest(await response.json(), parsed.document)
      } else await verifyBackground(parsed.document)
      screen.value = parsed.document; return
    }
    const doc = parsed.document
    const manifestResponse = await fetch('./manifest.json')
    if (!manifestResponse.ok) throw new Error('缺少 manifest.json')
    const data = await manifestResponse.json()
    if (data.formatVersion !== 1 || data.scene !== 'scene.json' || !Array.isArray(data.assets) || data.assets.length !== doc.assets.length) throw new Error('资产清单无效')
    for (const asset of doc.assets) {
      const matches = data.assets.filter((item: { assetId: string }) => item.assetId === asset.id)
      if (matches.length !== 1 || matches[0].path !== `assets/${asset.id}.glb` || matches[0].byteLength !== asset.byteLength || matches[0].sha256 !== asset.sha256) throw new Error(`资产清单不匹配：${asset.name}`)
    }
    manifest.value = data; scene.value = doc
  } catch (reason) { error.value = `场景加载失败：${reason instanceof Error ? reason.message : String(reason)}` }
})
async function resolveAsset(id: string) {
  const asset = manifest.value?.assets.find(item => item.assetId === id)
  if (!asset) throw new Error('资产不在清单中')
  return fetchAsset(asset)
}
</script>
<template><ScreenView v-if="screen" :document="screen" :resolve-asset="staticScreen ? resolveAsset : getBackgroundAsset" /><PlayerView v-else-if="scene" :document="scene" :resolve-asset="resolveAsset" /><div v-else role="alert">{{ error || '正在加载场景…' }}</div></template>
<style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;font-family:Inter,"PingFang SC",sans-serif}</style>
