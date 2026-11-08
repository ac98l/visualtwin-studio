import { DataRuntime } from '@visualtwin/runtime-2d'
import type { ScreenDocument } from '@visualtwin/schema'

type Source = ScreenDocument['dataSources'][number]
type Binding = ScreenDocument['bindings'][number]
type Component = ScreenDocument['components2d'][number]

// 临时静态运行器只复用 P8 的 Pointer 与类型校验，不访问网络或正式运行态。
export async function preflight(binding: Binding, target: Component, value: unknown): Promise<string | null> {
  const source = { id: binding.sourceId, type: 'static', value } as Extract<Source, { type: 'static' }>
  const runtime = new DataRuntime([source], [binding], () => {}, undefined, { [target.id]: target.type }, target.type === 'screen.table' ? { [target.id]: target.props.columns.length } : {})
  try { await runtime.refresh(source); return runtime.errors.get(binding.id) ?? runtime.errors.get(source.id) ?? null }
  finally { runtime.dispose() }
}
