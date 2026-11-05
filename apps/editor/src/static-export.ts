import { strToU8, unzipSync, zipSync } from 'fflate'
import type { SceneDocument } from '@visualtwin/schema'
import { exportProject, limits } from './project-archive'

// 使用原始构建内容，避免开发服务器将 CSS/JS 转换成带热更新的模块。
const playerFiles = import.meta.glob('../../player/dist/**/*', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

export function isLocalEndpoint(address: string) {
  const host = new URL(address, 'https://visualtwin.invalid/').hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '[::1]' || host === '0.0.0.0') return true
  const parts = host.split('.').map(Number)
  return parts.length === 4 && parts.every(Number.isInteger) && (parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 169 && parts[1] === 254))
}

export async function exportStaticWeb(scene: SceneDocument, progress: (text: string) => void) {
  for (const source of scene.dataSources) if (source.type === 'http') {
    if (isLocalEndpoint(source.url)) throw new Error('数据源使用本机或私网地址，部署前请替换为可访问的接口')
  }
  const project = await exportProject(scene, progress)
  return packStaticWeb(new Uint8Array(await project.arrayBuffer()), playerFiles)
}

export function packStaticWeb(project: Uint8Array, templates: Record<string, string>) {
  const files = unzipSync(project)
  const entries = Object.entries(templates)
  if (!entries.some(([path]) => path.endsWith('/index.html'))) throw new Error('缺少 Player 构建产物，请先构建 Player')
  for (const [path, content] of entries) {
    const name = path.slice('../../player/dist/'.length)
    if (!name || name.startsWith('/') || name.split('/').includes('..') || files[name] || !/\.(html|js|css)$/.test(name)) throw new Error(`Player 构建路径或格式无效：${name}`)
    files[name] = strToU8(content)
  }
  if (Object.keys(files).length > limits.entries || Object.values(files).reduce((sum, file) => sum + file.length, 0) > limits.unpackedBytes) throw new Error('静态项目条目数或解压总大小超限')
  const result = zipSync(files, { level: 0 })
  if (result.length > limits.zipBytes) throw new Error('静态项目 ZIP 大小超限')
  return new Blob([result as BlobPart], { type: 'application/zip' })
}
