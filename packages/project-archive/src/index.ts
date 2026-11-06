import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { parseScene, parseScreen, type SceneDocument, type ScreenDocument } from '@visualtwin/schema'
import { loadModel, disposeModel } from '@visualtwin/runtime-3d'

type AssetRecord = SceneDocument['assets'][number] & { blob: Blob, createdAt: string }
export async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
const envLimit = (name: string, fallback: number) => { const value = Number(import.meta.env[name]); return Number.isFinite(value) && value > 0 ? value : fallback }
export const limits = {
  modelBytes: envLimit('VITE_MAX_GLB_BYTES', 100 * 1024 * 1024),
  zipBytes: envLimit('VITE_MAX_ZIP_BYTES', 256 * 1024 * 1024),
  unpackedBytes: envLimit('VITE_MAX_UNPACKED_BYTES', 512 * 1024 * 1024),
  entries: envLimit('VITE_MAX_ZIP_ENTRIES', 256), ratio: envLimit('VITE_MAX_ZIP_RATIO', 100)
}
type Manifest = { formatVersion: 1, scene: 'scene.json', assets: { assetId: string, path: string, byteLength: number, sha256: string }[] }

export async function validateGlb(blob: Blob, name: string) {
  if (!name.toLowerCase().endsWith('.glb')) throw new Error('请选择 .glb 文件')
  if (!blob.size || blob.size > limits.modelBytes) throw new Error(`GLB 大小须在 1 字节至 ${Math.round(limits.modelBytes / 1048576)} MB 之间`)
  const object = await loadModel(blob)
  disposeModel(object)
}

// 检查中央目录及本地头，限制解压前声明大小；解压后核对长度与 CRC。
function inspectZip(bytes: Uint8Array) {
  if (bytes.length < 22 || bytes.length > limits.zipBytes) throw new Error('ZIP 大小超限或文件损坏')
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  while (end >= Math.max(0, bytes.length - 65557) && v.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0 || v.getUint32(end, true) !== 0x06054b50 || end + 22 + v.getUint16(end + 20, true) !== bytes.length) throw new Error('ZIP 目录损坏')
  // fflate 会在 EOCD 前 20 字节识别 ZIP64 定位记录并改用另一目录；项目包不支持 ZIP64。
  if (end >= 20 && v.getUint32(end - 20, true) === 0x07064b50) throw new Error('不支持 ZIP64 定位记录')
  const count = v.getUint16(end + 10, true), size = v.getUint32(end + 12, true), start = v.getUint32(end + 16, true)
  if (v.getUint16(end + 4, true) || v.getUint16(end + 6, true) || count !== v.getUint16(end + 8, true) || !count || count > limits.entries || start + size !== end) throw new Error('ZIP 条目数量或目录无效，不支持分卷和 ZIP64')
  const files = new Map<string, { size: number, crc: number }>(); const decoder = new TextDecoder('utf-8', { fatal: true })
  let offset = start, total = 0
  const ranges: { start: number, end: number }[] = []
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || v.getUint32(offset, true) !== 0x02014b50) throw new Error('ZIP 条目损坏')
    const flags = v.getUint16(offset + 8, true), method = v.getUint16(offset + 10, true), compressed = v.getUint32(offset + 20, true), original = v.getUint32(offset + 24, true)
    // 工程包导出仅使用 STORE；不接受无法事前验证真实展开长度的 DEFLATE。
    if (method !== 0) throw new Error('项目 ZIP 仅支持 STORE（不压缩）格式')
    const nameLen = v.getUint16(offset + 28, true), extra = v.getUint16(offset + 30, true), comment = v.getUint16(offset + 32, true), local = v.getUint32(offset + 42, true)
    if (offset + 46 + nameLen + extra + comment > end || local + 30 > start || v.getUint32(local, true) !== 0x04034b50) throw new Error('ZIP 头部损坏')
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen))
    if (!/^(scene\.json|manifest\.json|assets\/[A-Za-z0-9_-]{1,128}\.glb)$/.test(name) || files.has(name)) throw new Error(`ZIP 路径不安全或重复：${name}`)
    const localNameLen = v.getUint16(local + 26, true), localExtra = v.getUint16(local + 28, true)
    const localName = decoder.decode(bytes.subarray(local + 30, local + 30 + localNameLen))
    const dataStart = local + 30 + localNameLen + localExtra
    if (localName !== name || (flags & 9) || flags !== v.getUint16(local + 6, true) || method !== v.getUint16(local + 8, true) || dataStart + compressed > start || compressed !== v.getUint32(local + 18, true) || original !== v.getUint32(local + 22, true) || v.getUint32(offset + 16, true) !== v.getUint32(local + 14, true) || compressed !== original) throw new Error(`ZIP 条目不受支持或损坏：${name}`)
    const dataEnd = dataStart + compressed
    if (ranges.some(range => local < range.end && dataEnd > range.start)) throw new Error(`ZIP 条目区间重叠：${name}`)
    ranges.push({ start: local, end: dataEnd })
    if (original > limits.unpackedBytes || (compressed === 0 ? original > 0 : original / compressed > limits.ratio)) throw new Error(`ZIP 条目解压大小或压缩比超限：${name}`)
    total += original
    if (total > limits.unpackedBytes) throw new Error('ZIP 解压总大小超限')
    files.set(name, { size: original, crc: v.getUint32(offset + 16, true) })
    offset += 46 + nameLen + extra + comment
  }
  if (offset !== end || !files.has('scene.json') || !files.has('manifest.json')) throw new Error('ZIP 缺少必要文件或目录无效')
  return files
}
function crc32(data: Uint8Array) {
  let crc = -1
  for (const byte of data) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)) }
  return (crc ^ -1) >>> 0
}
export async function unpackProject(blob: Blob, progress: (text: string) => void) {
  if (blob.size > limits.zipBytes) throw new Error('ZIP 大小超限')
  const bytes = new Uint8Array(await blob.arrayBuffer()); const entries = inspectZip(bytes)
  progress('正在解压并检查项目')
  let files: Record<string, Uint8Array>
  try { files = unzipSync(bytes) } catch { throw new Error('ZIP 解压失败或文件损坏') }
  if (Object.keys(files).length !== entries.size || Object.keys(files).some(name => !entries.has(name))) throw new Error('ZIP 解压条目与目录不一致')
  for (const [name, meta] of entries) if (!files[name] || files[name].length !== meta.size || crc32(files[name]) !== meta.crc) throw new Error(`ZIP 内容损坏：${name}`)
  return { files, entries }
}
export async function importProject(blob: Blob, progress: (text: string) => void) {
  const { files, entries } = await unpackProject(blob, progress)
  let manifest: Manifest; let scene: SceneDocument
  try { manifest = JSON.parse(strFromU8(files['manifest.json'])); scene = parseScene(strFromU8(files['scene.json'])) } catch (error) { throw new Error(`项目文档无效：${error instanceof Error ? error.message : String(error)}`) }
  if (!manifest || manifest.formatVersion !== 1 || manifest.scene !== 'scene.json' || !Array.isArray(manifest.assets) || manifest.assets.length !== scene.assets.length) throw new Error('manifest 版本或资产清单无效')
  const ids = new Set<string>(), paths = new Set<string>(), records: AssetRecord[] = []
  for (const [index, item] of manifest.assets.entries()) {
    progress(`校验模型 ${index + 1}/${manifest.assets.length}`)
    const asset = scene.assets.find(entry => entry.id === item.assetId)
    if (!asset || ids.has(item.assetId) || paths.has(item.path) || item.path !== `assets/${item.assetId}.glb` || item.byteLength !== asset.byteLength || item.sha256 !== asset.sha256) throw new Error('manifest 资产引用无效或重复')
    if (!files[item.path]) throw new Error(`项目缺少资产文件：${asset.name}`)
    ids.add(item.assetId); paths.add(item.path)
    const data = files[item.path]; const model = new Blob([data as BlobPart], { type: asset.mimeType })
    if (model.size !== asset.byteLength || await sha256(model) !== asset.sha256) throw new Error(`资产内容校验失败：${asset.name}`)
    await validateGlb(model, asset.name)
    records.push({ ...asset, blob: model, createdAt: new Date().toISOString() })
  }
  if (entries.size !== paths.size + 2) throw new Error('ZIP 含未声明文件')
  return { scene, records }
}

// 大屏包使用相同的 ZIP 安全检查，但通过 documentType 与原三维包区分。
export type ScreenManifest = { formatVersion: 1, documentType: 'screen', scene: 'scene.json', assets: { assetId: string, path: string, byteLength: number, sha256: string }[] }
export function referencedScreenAssets(document: ScreenDocument) {
  if (document.background.type !== 'scene') return []
  const scene = document.background.scene
  const ids = new Set(scene.scene3d.nodes.filter(node => node.type === 'model.gltf').map(node => node.props.assetId))
  return scene.assets.filter(asset => ids.has(asset.id))
}
export function checkScreenManifest(value: unknown, document: ScreenDocument): ScreenManifest {
  const manifest = value as ScreenManifest | null
  const assets = referencedScreenAssets(document)
  if (!manifest || manifest.formatVersion !== 1 || manifest.documentType !== 'screen' || manifest.scene !== 'scene.json' || !Array.isArray(manifest.assets) || manifest.assets.length !== assets.length) throw new Error('大屏 manifest 版本或资产清单无效')
  const ids = new Set<string>()
  for (const item of manifest.assets) {
    const asset = assets.find(entry => entry.id === item?.assetId)
    if (!asset || ids.has(item.assetId) || !/^[A-Za-z0-9_-]{1,128}$/.test(item.assetId) || item.path !== `assets/${item.assetId}.glb` || item.byteLength !== asset.byteLength || item.sha256 !== asset.sha256) throw new Error('大屏 manifest 资产引用无效或重复')
    ids.add(item.assetId)
  }
  return manifest
}

export async function exportScreenProject(input: ScreenDocument, getAsset: (id: string) => Promise<Blob | undefined>, progress: (text: string) => void) {
  const document = parseScreen(JSON.parse(JSON.stringify(input)))
  const assets = referencedScreenAssets(document)
  const manifest: ScreenManifest = { formatVersion: 1, documentType: 'screen', scene: 'scene.json', assets: [] }
  const files: Record<string, Uint8Array> = { 'scene.json': strToU8(JSON.stringify(document, null, 2)) }
  let total = files['scene.json'].length
  for (const [index, asset] of assets.entries()) {
    progress(`检查资产 ${index + 1}/${assets.length}`)
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(asset.id)) throw new Error(`资产 ID 不能用于可移植路径：${asset.id}`)
    const blob = await getAsset(asset.id)
    if (!blob || blob.size !== asset.byteLength || await sha256(blob) !== asset.sha256) throw new Error(`背景资产缺失或校验失败：${asset.name}`)
    await validateGlb(blob, asset.name)
    const path = `assets/${asset.id}.glb`; const data = new Uint8Array(await blob.arrayBuffer())
    total += data.length
    if (total > limits.unpackedBytes) throw new Error('项目解压总大小超限')
    files[path] = data; manifest.assets.push({ assetId: asset.id, path, byteLength: asset.byteLength, sha256: asset.sha256 })
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  return packFiles(files)
}
export function packFiles(files: Record<string, Uint8Array>) {
  if (Object.keys(files).length > limits.entries || Object.values(files).reduce((sum, file) => sum + file.length, 0) > limits.unpackedBytes) throw new Error('ZIP 条目数或解压总大小超限')
  const zip = zipSync(files, { level: 0 })
  if (zip.length > limits.zipBytes) throw new Error('ZIP 大小超限')
  return new Blob([zip as BlobPart], { type: 'application/zip' })
}
export async function importScreenProject(blob: Blob, progress: (text: string) => void) {
  const { files, entries } = await unpackProject(blob, progress)
  let document: ScreenDocument; let manifest: ScreenManifest
  try { document = parseScreen(strFromU8(files['scene.json'])); manifest = checkScreenManifest(JSON.parse(strFromU8(files['manifest.json'])), document) }
  catch (error) { throw new Error(`大屏项目无效：${error instanceof Error ? error.message : String(error)}`) }
  const assets = referencedScreenAssets(document); const records: AssetRecord[] = []
  for (const [index, item] of manifest.assets.entries()) {
    progress(`校验模型 ${index + 1}/${manifest.assets.length}`)
    const asset = assets.find(entry => entry.id === item.assetId)!
    const data = files[item.path]
    if (!data) throw new Error(`项目缺少资产文件：${asset.name}`)
    const model = new Blob([data as BlobPart], { type: asset.mimeType })
    if (model.size !== asset.byteLength || await sha256(model) !== asset.sha256) throw new Error(`资产内容校验失败：${asset.name}`)
    await validateGlb(model, asset.name)
    records.push({ ...asset, blob: model, createdAt: new Date().toISOString() })
  }
  if (entries.size !== manifest.assets.length + 2) throw new Error('ZIP 含未声明文件')
  return { document, records }
}
