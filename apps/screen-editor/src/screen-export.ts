import projectLicense from '../../../LICENSE?raw'
import playerNotice from '../../../licenses/PLAYER-NOTICE.txt?raw'
import thirdPartyNotices from '../../../licenses/PLAYER-THIRD-PARTY-NOTICES.txt?raw'
import type { ScreenDocument } from '@visualtwin/schema'
import { exportScreenProject, limits, packFiles, unpackProject } from '@visualtwin/project-archive'
import { getBackgroundAsset } from '@visualtwin/screen-storage'

// Player 生产文件由根目录 build / dev:screen 预先构建，内容不经过开发服务器转换。
const playerFiles = import.meta.glob('../../player/dist/**/*', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
export function exportScreen(document: ScreenDocument, progress: (message: string) => void) {
  return exportScreenProject(document, getBackgroundAsset, progress)
}
export async function exportScreenWeb(document: ScreenDocument, progress: (message: string) => void) {
  const project = await exportScreen(document, progress)
  const { files } = await unpackProject(project, progress)
  const entries = Object.entries(playerFiles)
  if (!entries.some(([path]) => path.endsWith('/index.html'))) throw new Error('缺少 Player 构建产物，请先构建 Player')
  for (const [path, content] of entries) {
    const name = path.slice('../../player/dist/'.length)
    if (!name || name.startsWith('/') || name.split('/').includes('..') || files[name] || !/\.(html|js|css)$/.test(name)) throw new Error(`Player 构建路径或格式无效：${name}`)
    const output = name === 'index.html' ? content.replace('</head>', '<meta name="visualtwin-static-screen" content="1"></head>') : content
    files[name] = new TextEncoder().encode(output)
  }
  files['LICENSE'] = new TextEncoder().encode(projectLicense)
  files['NOTICE'] = new TextEncoder().encode(playerNotice)
  files['THIRD_PARTY_NOTICES.txt'] = new TextEncoder().encode(thirdPartyNotices)
  if (Object.keys(files).length > limits.entries) throw new Error('静态项目条目数超限')
  return packFiles(files)
}
