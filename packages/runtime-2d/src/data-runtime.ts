import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import type { SceneDocument } from '@visualtwin/schema'
import { DataRuntime, applyBindings } from '@visualtwin/core'
export { DataRuntime, applyBindings, resolvePointer } from '@visualtwin/core'

export function useRuntimeData(document: Ref<SceneDocument>) {
  const revision = ref(0)
  const runtime = shallowRef<DataRuntime>()
  watch(() => JSON.stringify([document.value.dataSources, document.value.bindings]), () => {
    runtime.value?.dispose()
    const next = new DataRuntime(document.value.dataSources, document.value.bindings, () => { revision.value++ })
    runtime.value = next; next.start(); revision.value++
  }, { immediate: true })
  onBeforeUnmount(() => runtime.value?.dispose())
  const scene = computed(() => { void revision.value; return applyBindings(document.value, runtime.value?.values ?? new Map()) })
  const errors = computed(() => { void revision.value; return [...(runtime.value?.errors.values() ?? [])] })
  return { scene, errors }
}
