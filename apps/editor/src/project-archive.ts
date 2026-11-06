import { zipSync, strToU8 } from 'fflate'
import { parseScene, type SceneDocument } from '@visualtwin/schema'
import { getAsset, sha256 } from './storage'
import { limits, validateGlb } from '@visualtwin/project-archive'
export { importProject, limits, validateGlb } from '@visualtwin/project-archive'
type Manifest = { formatVersion: 1, scene: 'scene.json', assets: { assetId: string, path: string, byteLength: number, sha256: string }[] }

export async function exportProject(sceneInput: SceneDocument, progress: (text: string) => void) {
  const scene = parseScene(JSON.parse(JSON.stringify(sceneInput)))
  const manifest: Manifest = { formatVersion: 1, scene: 'scene.json', assets: [] }
  const files: Record<string, Uint8Array> = { 'scene.json': strToU8(JSON.stringify(scene, null, 2)) }
  let total = files['scene.json'].length
  for (const [index, asset] of scene.assets.entries()) {
    progress(`检查资产 ${index + 1}/${scene.assets.length}`)
    const record = await getAsset(asset.id)
    if (!record || record.blob.size !== asset.byteLength || await sha256(record.blob) !== asset.sha256) throw new Error(`资产缺失或校验失败：${asset.name}`)
    await validateGlb(record.blob, asset.name)
    const path = `assets/${asset.id}.glb`
    const data = new Uint8Array(await record.blob.arrayBuffer()); total += data.length
    if (total > limits.unpackedBytes) throw new Error('项目解压总大小超限')
    files[path] = data; manifest.assets.push({ assetId: asset.id, path, byteLength: asset.byteLength, sha256: asset.sha256 })
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  if (Object.keys(files).length > limits.entries) throw new Error('ZIP 条目数超限')
  progress('正在生成项目 ZIP')
  const zip = zipSync(files, { level: 0 })
  if (zip.length > limits.zipBytes) throw new Error('ZIP 大小超限')
  return new Blob([zip as BlobPart], { type: 'application/zip' })
}
