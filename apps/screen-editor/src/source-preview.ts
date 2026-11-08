import type { ScreenDocument } from '@visualtwin/schema'

type Source = ScreenDocument['dataSources'][number]
export const previewLimits = { bytes: 256 * 1024, depth: 4, entries: 30, string: 200, nodes: 500 } as const

// 只渲染有限结构；结果作为文本展示，不改变原值。
export type PreviewChoice = { path: string, label: string }
export function formatPreview(value: unknown, choices?: PreviewChoice[]): string {
  let nodes = 0
  const render = (item: unknown, depth: number, path: string, label: string, selectable = true): string => {
    nodes++
    if (selectable && !(typeof item === 'string' && item.length > previewLimits.string) && !(item !== null && typeof item === 'object' && depth >= previewLimits.depth)) choices?.push({ path, label })
    if (typeof item === 'string') return JSON.stringify(item.length > previewLimits.string ? `${item.slice(0, previewLimits.string)}…` : item)
    if (item === null || typeof item !== 'object') return JSON.stringify(item) ?? 'null'
    if (depth >= previewLimits.depth) return Array.isArray(item) ? '[…]' : '{…}'
    const entries = Object.entries(item); const parts: string[] = []
    for (const [key, child] of entries.slice(0, previewLimits.entries)) {
      if (nodes >= previewLimits.nodes) { parts.push('…（预览节点已达上限）'); break }
      const label = key.length > previewLimits.string ? `${key.slice(0, previewLimits.string)}…` : key
      const childPath = `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`
      parts.push(`${Array.isArray(item) ? '' : `${JSON.stringify(label)}: `}${render(child, depth + 1, childPath, label, selectable && key.length <= previewLimits.string)}`)
    }
    if (entries.length > previewLimits.entries) parts.push(`…（还有 ${entries.length - previewLimits.entries} 项）`)
    return Array.isArray(item) ? `[${parts.join(', ')}]` : `{${parts.join(', ')}}`
  }
  return render(value, 0, '', '根节点')
}

export async function previewSource(source: Source, signal: AbortSignal, fetcher: typeof fetch = globalThis.fetch.bind(globalThis), onValue?: (value: unknown) => void): Promise<string> {
  if (signal.aborted) throw new Error('已取消')
  if (source.type === 'static') { onValue?.(source.value); return formatPreview(source.value) }
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => controller.abort()
  signal.addEventListener('abort', stop, { once: true })
  const cancelled = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error(signal.aborted ? '已取消' : '请求超时')), { once: true })
  })
  timer = setTimeout(stop, source.timeoutMs)
  try {
    const read = async () => {
      let response: Response
      try { response = await fetcher(source.url, { method: 'GET', credentials: 'omit', signal: controller.signal }) }
      catch { throw new Error('网络请求失败，可能是网络或跨域限制') }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const length = Number(response.headers.get('content-length'))
      if (length > previewLimits.bytes) throw new Error('响应超过 256 KiB 限制')
      if (!response.body) throw new Error('响应内容为空')
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
      try {
        while (true) {
          const item = await reader.read()
          if (item.done) break
          size += item.value.byteLength
          if (size > previewLimits.bytes) { void reader.cancel().catch(() => {}); throw new Error('响应超过 256 KiB 限制') }
          chunks.push(item.value)
        }
      } finally { reader.releaseLock() }
      const bytes = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      try { const value: unknown = JSON.parse(new TextDecoder().decode(bytes)); onValue?.(value); return formatPreview(value) } catch { throw new Error('响应不是有效 JSON') }
    }
    return await Promise.race([read(), cancelled])
  } finally { if (timer) clearTimeout(timer); signal.removeEventListener('abort', stop); controller.abort() }
}
