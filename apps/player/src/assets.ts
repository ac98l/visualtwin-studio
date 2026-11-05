import { sha256 as createSha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

export type ManifestAsset = { assetId: string, path: string, byteLength: number, sha256: string }

export async function hashBlob(blob: Blob, subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null) {
  if (subtle) return bytesToHex(new Uint8Array(await subtle.digest('SHA-256', await blob.arrayBuffer())))
  const hash = createSha256.create()
  const size = 1024 * 1024
  for (let offset = 0; offset < blob.size; offset += size) hash.update(new Uint8Array(await blob.slice(offset, offset + size).arrayBuffer()))
  return bytesToHex(hash.digest())
}

export async function fetchAsset(asset: ManifestAsset, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
  if (asset.path !== `assets/${asset.assetId}.glb` || !/^[A-Za-z0-9_-]{1,128}$/.test(asset.assetId)) throw new Error('资产路径无效')
  const response = await fetcher(`./${asset.path}`)
  if (!response.ok) throw new Error(`资产请求失败：HTTP ${response.status}`)
  const blob = await response.blob()
  if (blob.size !== asset.byteLength || await hashBlob(blob) !== asset.sha256) throw new Error('资产内容校验失败')
  return blob
}
