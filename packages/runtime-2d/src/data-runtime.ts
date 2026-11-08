import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import type { SceneDocument, ScreenDocument } from '@visualtwin/schema'
import { DataRuntime, applyBindings } from '@visualtwin/core'
export { DataRuntime, applyBindings, resolvePointer } from '@visualtwin/core'

export function useRuntimeData<T extends SceneDocument | ScreenDocument>(document: Ref<T>) {
  const revision = ref(0)
  const epoch = ref(0)
  const runtime = shallowRef<DataRuntime>()
  const activeBindings = computed(() => {
    const doc = document.value
    if (!('documentType' in doc)) return doc.bindings
    const hidden = new Set((doc.groups ?? []).filter(group => !group.visible).flatMap(group => group.memberIds))
    return doc.bindings.filter(binding => doc.components2d.some(item => item.id === binding.targetId && item.visible !== false && !hidden.has(item.id)))
  })
  const targetTypes = computed(() => Object.fromEntries(document.value.components2d.filter(item => activeBindings.value.some(binding => binding.targetId === item.id)).map(item => [item.id, item.type])))
  const targetColumns = computed(() => Object.fromEntries(document.value.components2d.filter(item => item.type === 'screen.table' && activeBindings.value.some(binding => binding.targetId === item.id)).map(item => [item.id, item.type === 'screen.table' ? item.props.columns.length : 0])))
  let previousConfig: { id: string, epoch: number, sources: T['dataSources'], bindings: T['bindings'] } | undefined
  watch(() => JSON.stringify([epoch.value, document.value.id, document.value.dataSources, activeBindings.value, targetTypes.value, targetColumns.value]), () => {
    const previous = runtime.value
    runtime.value?.dispose()
    const next = new DataRuntime(document.value.dataSources, activeBindings.value, () => { revision.value++ }, undefined, targetTypes.value, targetColumns.value)
    for (const binding of activeBindings.value) {
      const oldBinding = previousConfig?.bindings.find(item => item.id === binding.id)
      const oldSource = previousConfig?.sources.find(item => item.id === binding.sourceId)
      const newSource = document.value.dataSources.find(item => item.id === binding.sourceId)
      if (previousConfig?.epoch === epoch.value && previousConfig.id === document.value.id && previous?.values.has(binding.id) && JSON.stringify(oldBinding) === JSON.stringify(binding) && JSON.stringify(oldSource) === JSON.stringify(newSource)) next.values.set(binding.id, previous.values.get(binding.id))
    }
    previousConfig = JSON.parse(JSON.stringify({ id: document.value.id, epoch: epoch.value, sources: document.value.dataSources, bindings: activeBindings.value })) as typeof previousConfig
    runtime.value = next; next.start(); revision.value++
  }, { immediate: true })
  onBeforeUnmount(() => runtime.value?.dispose())
  const scene = computed(() => { void revision.value; return applyBindings(document.value, runtime.value?.values ?? new Map()) })
  const errors = computed(() => { void revision.value; return [...(runtime.value?.errors.values() ?? [])] })
  const validBindingIds = computed(() => { void revision.value; return [...(runtime.value?.values.keys() ?? [])] })
  function refresh(id: string) {
    const source = document.value.dataSources.find(item => item.id === id)
    if (source && activeBindings.value.some(binding => binding.sourceId === id)) void runtime.value?.refresh(source)
  }
  function reset() { epoch.value++ }
  return { scene, errors, validBindingIds, refresh, reset }
}
