<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { exampleEventScene, parseScene, type SceneDocument } from '@visualtwin/schema'
import PlayerView from './PlayerView.vue'
import { fetchAsset, type ManifestAsset } from './assets'
const scene = ref<SceneDocument>()
const error = ref('')
const manifest = ref<{ assets: ManifestAsset[] }>()
onMounted(async () => {
  if (import.meta.env.DEV && !new URLSearchParams(location.search).has('scene')) { scene.value = exampleEventScene; return }
  try {
    const [docResponse, manifestResponse] = await Promise.all([fetch('./scene.json'), fetch('./manifest.json')])
    if (!docResponse.ok || !manifestResponse.ok) throw new Error('缺少 scene.json 或 manifest.json')
    const doc = parseScene(await docResponse.json())
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
<template><PlayerView v-if="scene" :document="scene" :resolve-asset="resolveAsset" /><div v-else role="alert">{{ error || '正在加载场景…' }}</div></template>
<style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;font-family:Inter,"PingFang SC",sans-serif}</style>
