import type { SceneDocument } from '@visualtwin/schema'

export type Asset = SceneDocument['assets'][number]
export type AssetRecord = Asset & { blob: Blob, createdAt: string }
const DB_NAME = 'visualtwin-studio'
let database: Promise<IDBDatabase> | undefined
let pending: Promise<unknown> = Promise.resolve()
function db() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => { request.result.createObjectStore('assets', { keyPath: 'id' }); request.result.createObjectStore('project') }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { database = undefined; reject(request.error) }
    request.onblocked = () => reject(new Error('数据库被其他页面占用，请关闭其他页面后重试'))
  })
}
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const task = pending.then(work, work)
  pending = task.catch(() => undefined)
  return task
}
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('数据库事务失败')) })
}
function request<T>(req: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) }) }
export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  const database = await db(); return request(database.transaction('assets').objectStore('assets').get(id))
}
export async function getProject(): Promise<unknown> {
  const database = await db(); return request(database.transaction('project').objectStore('project').get('active'))
}
export function saveProject(scene: SceneDocument) {
  const snapshot = JSON.parse(JSON.stringify(scene)) as SceneDocument
  return exclusive(async () => { const database = await db(); const tx = database.transaction('project', 'readwrite'); tx.objectStore('project').put(snapshot, 'active'); await done(tx) })
}
// 资产和当前项目在同一事务提交；冲突不覆盖已有文件。
export function commitProject(scene: SceneDocument, records: AssetRecord[]) {
  const snapshot = JSON.parse(JSON.stringify(scene)) as SceneDocument
  return exclusive(async () => {
    const database = await db()
    const tx = database.transaction(['assets', 'project'], 'readwrite')
    const assets = tx.objectStore('assets')
    for (const record of records) {
      const existing = await request<AssetRecord | undefined>(assets.get(record.id))
      if (existing && (existing.sha256 !== record.sha256 || existing.byteLength !== record.byteLength)) { tx.abort(); throw new Error(`资产 ID 冲突：${record.id}`) }
      assets.put(record)
    }
    tx.objectStore('project').put(snapshot, 'active')
    await done(tx)
  })
}
export function deleteAssetAndSave(id: string, scene: SceneDocument) {
  const snapshot = JSON.parse(JSON.stringify(scene)) as SceneDocument
  return exclusive(async () => {
    const database = await db(); const tx = database.transaction(['assets', 'project'], 'readwrite')
    tx.objectStore('assets').delete(id); tx.objectStore('project').put(snapshot, 'active'); await done(tx)
  })
}
export async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
