import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import type { SceneDocument } from '@visualtwin/schema'
import { EventRuntime } from '@visualtwin/core'

export function useEventRuntime(document: Ref<SceneDocument>) {
  const revision = ref(0)
  const runtime = shallowRef<EventRuntime>()
  function reset() {
    runtime.value?.dispose()
    runtime.value = new EventRuntime(() => document.value, () => { revision.value++ })
    revision.value++
  }
  watch(() => JSON.stringify([document.value.id, document.value.events, document.value.scene3d.nodes.map(node => [node.id, node.type]), document.value.components2d.map(item => [item.id, item.type])]), reset, { immediate: true })
  onBeforeUnmount(() => runtime.value?.dispose())
  const scene = computed(() => {
    void revision.value
    const result = JSON.parse(JSON.stringify(document.value)) as SceneDocument
    for (const node of result.scene3d.nodes) if (runtime.value && Object.hasOwn(runtime.value.visibility, node.id)) node.visible = runtime.value.visibility[node.id]
    return result
  })
  const highlights = computed(() => { void revision.value; return { ...runtime.value?.highlights } })
  const error = computed(() => { void revision.value; return runtime.value?.error ?? '' })
  function dispatch(id: string, dataIndex?: number) { runtime.value?.dispatch(id, 'click', dataIndex === undefined ? {} : { dataIndex }) }
  return { scene, highlights, error, dispatch, reset }
}
