import { parseScreen, type ScreenDocument, type SceneDocument } from '@visualtwin/schema'
import { sha256, referencedScreenAssets } from '@visualtwin/project-archive'
export { checkScreenManifest } from '@visualtwin/project-archive'
type AssetRecord = SceneDocument['assets'][number] & { blob: Blob, createdAt: string }
const name = 'visualtwin-screen-editor'
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('screen')) request.result.createObjectStore('screen'); if (!request.result.objectStoreNames.contains('assets')) request.result.createObjectStore('assets', { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('大屏数据库被占用'))
  })
}
export async function loadScreen(): Promise<ScreenDocument | undefined> {
  const db = await open()
  try {
    const value = await new Promise<unknown>((resolve, reject) => { const request = db.transaction('screen').objectStore('screen').get('active'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    return value === undefined ? undefined : parseScreen(value)
  } finally { db.close() }
}
export async function saveScreen(document: ScreenDocument): Promise<void> {
  const snapshot = parseScreen(JSON.parse(JSON.stringify(document)))
  await verifyBackground(snapshot)
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => { const transaction = db.transaction('screen', 'readwrite'); transaction.objectStore('screen').put(snapshot, 'active'); transaction.oncomplete = () => resolve(); transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('保存失败')) })
  } finally { db.close() }
}

export async function storeBackgroundAssets(records: AssetRecord[]): Promise<void> {
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite'); const store = tx.objectStore('assets')
      for (const record of records) {
        const req = store.get(record.id)
        req.onsuccess = () => { const previous = req.result as AssetRecord | undefined; if (previous && (previous.sha256 !== record.sha256 || previous.byteLength !== record.byteLength)) { tx.abort(); return } store.put(record) }
      }
      tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('背景资产冲突或存储失败'))
    })
  } finally { db.close() }
}
export async function getBackgroundAsset(id: string): Promise<Blob | undefined> {
  const db = await open()
  try {
    const record = await new Promise<AssetRecord | undefined>((resolve, reject) => { const request = db.transaction('assets').objectStore('assets').get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    return record?.blob
  } finally { db.close() }
}
export async function verifyBackground(document: ScreenDocument): Promise<void> {
  if (document.background.type !== 'scene') return
  for (const asset of referencedScreenAssets(document)) {
    const blob = await getBackgroundAsset(asset.id)
    if (!blob || blob.size !== asset.byteLength || await sha256(blob) !== asset.sha256) throw new Error(`背景资产缺失或校验失败：${asset.name}；请先导入对应 3D 项目 ZIP`)
  }
}

// 在同一事务中暂存文档和资产；active 仍仅在用户点击保存时更新。
export async function stageScreenImport(document: ScreenDocument, records: AssetRecord[]): Promise<void> {
  const snapshot = parseScreen(JSON.parse(JSON.stringify(document)))
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['screen', 'assets'], 'readwrite'); const store = tx.objectStore('assets')
      let failure: unknown
      tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('背景资产冲突或存储失败'))
      try {
        for (const record of records) {
          const request = store.get(record.id)
          request.onsuccess = () => {
            try {
              const previous = request.result as AssetRecord | undefined
              if (previous && (previous.sha256 !== record.sha256 || previous.byteLength !== record.byteLength)) { failure = new Error('背景资产冲突'); tx.abort(); return }
              store.put(record)
            } catch (error) { failure = error; tx.abort() }
          }
        }
        tx.objectStore('screen').put(snapshot, 'import-staged')
      } catch (error) { failure = error; tx.abort() }
    })
  } finally { db.close() }
}
