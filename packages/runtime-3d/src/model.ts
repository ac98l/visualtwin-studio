import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// 单文件 GLB；不加载外部资源或需要额外解码器的压缩扩展。
export async function loadModel(blob: Blob): Promise<THREE.Object3D> {
  const buffer = await blob.arrayBuffer()
  if (buffer.byteLength < 20) throw new Error('GLB 文件过短或损坏')
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('GLB 文件头或版本无效')
  const length = view.getUint32(12, true)
  if (20 + length > buffer.byteLength) throw new Error('GLB JSON 数据损坏')
  let json: { extensionsRequired?: string[], extensionsUsed?: string[], buffers?: { uri?: string }[], images?: { uri?: string }[] }
  try { json = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + length)).trim()) } catch { throw new Error('GLB JSON 数据无法解析') }
  if ([...(json.buffers ?? []), ...(json.images ?? [])].some(item => item.uri && !item.uri.startsWith('data:'))) throw new Error('暂不支持引用外部文件的 GLB')
  const supported = new Set(['KHR_materials_unlit', 'KHR_materials_clearcoat', 'KHR_materials_transmission', 'KHR_materials_ior', 'KHR_materials_volume', 'KHR_materials_specular', 'KHR_materials_sheen', 'KHR_materials_iridescence', 'KHR_materials_anisotropy', 'KHR_texture_transform', 'KHR_materials_emissive_strength', 'KHR_mesh_quantization', 'KHR_lights_punctual'])
  const unsupported = (json.extensionsRequired ?? []).find(extension => !supported.has(extension))
  const compressed = (json.extensionsUsed ?? []).find(extension => ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'].includes(extension))
  if (unsupported || compressed) throw new Error(`不支持的模型扩展或缺少解码器：${unsupported || compressed}`)
  try {
    const gltf = await new GLTFLoader().parseAsync(buffer, '')
    return gltf.scene
  } catch (error) { throw new Error(`GLB 解析失败：${error instanceof Error ? error.message : String(error)}`) }
}

// 每次 loadModel 独立解析；同一实例内部资源去重释放，不与其他实例共享。
export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const skeletons = new Set<THREE.Skeleton>()
  root.traverse(object => {
    const renderable = object as THREE.Mesh
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((object as THREE.SkinnedMesh).skeleton)
    if (renderable.geometry) geometries.add(renderable.geometry)
    if (renderable.material) (Array.isArray(renderable.material) ? renderable.material : [renderable.material]).forEach(material => materials.add(material))
  })
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    material.dispose()
  }
  const images = new Set<ImageBitmap>()
  for (const texture of textures) { texture.dispose(); const image = texture.source?.data; if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) images.add(image) }
  images.forEach(image => image.close())
  skeletons.forEach(skeleton => skeleton.dispose())
  geometries.forEach(geometry => geometry.dispose())
}
