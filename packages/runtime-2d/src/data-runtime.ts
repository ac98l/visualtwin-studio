import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import type { SceneDocument, ScreenDocument } from '@visualtwin/schema'
import { DataRuntime, applyBindings } from '@visualtwin/core'
export { DataRuntime, applyBindings, resolvePointer } from '@visualtwin/core'

export function useRuntimeData<T extends SceneDocument | ScreenDocument>(document: Ref<T>) {
  const revision = ref(0)
  const epoch = ref(0)
  const runtime = shallowRef<DataRuntime>()
  let previousConfig: { id: string, epoch: number, sources: T['dataSources'], bindings: T['bindings'] } | undefined
  watch(() => JSON.stringify([epoch.value, document.value.id, document.value.dataSources, document.value.bindings]), () => {
    const previous = runtime.value
    runtime.value?.dispose()
    const next = new DataRuntime(document.value.dataSources, document.value.bindings, () => { revision.value++ })
    for (const binding of document.value.bindings) {
      const oldBinding = previousConfig?.bindings.find(item => item.id === binding.id)
      const oldSource = previousConfig?.sources.find(item => item.id === binding.sourceId)
      const newSource = document.value.dataSources.find(item => item.id === binding.sourceId)
      if (previousConfig?.epoch === epoch.value && previousConfig.id === document.value.id && previous?.values.has(binding.id) && JSON.stringify(oldBinding) === JSON.stringify(binding) && JSON.stringify(oldSource) === JSON.stringify(newSource)) next.values.set(binding.id, previous.values.get(binding.id))
    }
    previousConfig = JSON.parse(JSON.stringify({ id: document.value.id, epoch: epoch.value, sources: document.value.dataSources, bindings: document.value.bindings })) as typeof previousConfig
    runtime.value = next; next.start(); revision.value++
  }, { immediate: true })
  onBeforeUnmount(() => runtime.value?.dispose())
  const scene = computed(() => { void revision.value; return applyBindings(document.value, runtime.value?.values ?? new Map()) })
  const errors = computed(() => { void revision.value; return [...(runtime.value?.errors.values() ?? [])] })
  function refresh(id: string) {
    const source = document.value.dataSources.find(item => item.id === id)
    if (source && document.value.bindings.some(binding => binding.sourceId === id)) void runtime.value?.refresh(source)
  }
  function reset() { epoch.value++ }
  return { scene, errors, refresh, reset }
}
