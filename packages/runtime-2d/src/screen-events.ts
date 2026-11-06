import { computed, type Ref } from 'vue'
import { exampleScene, type SceneDocument, type ScreenDocument } from '@visualtwin/schema'
import { useEventRuntime } from './event-runtime'

type Scope = 'background' | 'foreground'
const scoped = (scope: Scope, id: string) => `${scope}:${id}`

/** 仅为 P6 运行器构造作用域隔离的只读视图，不改动持久化 ID。 */
export function useScreenEvents(document: Ref<ScreenDocument>) {
  const facade = computed<SceneDocument>(() => {
    const doc = document.value
    const background = doc.background.type === 'scene' ? doc.background.scene : exampleScene
    const nodes = doc.background.type === 'scene' ? background.scene3d.nodes : []
    return {
      ...background,
      id: JSON.stringify([doc.id, doc.background]),
      scene3d: { ...background.scene3d, nodes: nodes.map(node => ({ ...node, id: scoped('background', node.id) })) },
      components2d: doc.components2d.filter((item): item is SceneDocument['components2d'][number] => !item.type.startsWith('screen.')).map(item => ({ ...item, id: scoped('foreground', item.id) })),
      dataSources: [], bindings: [],
      events: doc.events.filter(rule => rule.enabled !== false).map(rule => ({ id: rule.id, sourceId: scoped(rule.source.scope, rule.source.id), event: rule.event, actions: rule.actions.map(action => ({ targetId: scoped(action.target.scope, action.target.id), type: action.type, params: action.params })) })) as SceneDocument['events']
    }
  })
  const runtime = useEventRuntime(facade)
  const scene = computed<ScreenDocument>(() => {
    const doc = document.value
    if (doc.background.type !== 'scene') return doc
    const nodes = runtime.scene.value.scene3d.nodes
    return { ...doc, background: { type: 'scene', scene: { ...doc.background.scene, scene3d: { ...doc.background.scene.scene3d, nodes: doc.background.scene.scene3d.nodes.map((node, index) => ({ ...node, visible: nodes[index]?.visible ?? node.visible })) } } } }
  })
  const highlights = computed(() => Object.fromEntries(document.value.components2d.flatMap(item => {
    const index = runtime.highlights.value[scoped('foreground', item.id)]
    return index === undefined ? [] : [[item.id, index]]
  })))
  function dispatch(scope: Scope, id: string, dataIndex?: number) { runtime.dispatch(scoped(scope, id), dataIndex) }
  return { scene, highlights, error: runtime.error, dispatch, reset: runtime.reset }
}
