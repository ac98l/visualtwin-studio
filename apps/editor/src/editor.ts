import { defineStore } from 'pinia'
import { exampleScene, parseScene, type SceneDocument } from '@visualtwin/schema'
import { registry, type Component2D, type ComponentType } from '@visualtwin/runtime-2d/registry'

type Node = SceneDocument['scene3d']['nodes'][number]
type PrimitiveType = Extract<Node, { type: `primitive.${string}` }>['type']
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function removeEventReferences(scene: SceneDocument, ids: Set<string>) {
  scene.events = scene.events.flatMap(rule => {
    if (ids.has(rule.sourceId)) return []
    const actions = rule.actions.filter(action => !ids.has(action.targetId))
    return actions.length ? [{ ...rule, actions: [actions[0], ...actions.slice(1)] }] : []
  })
}

export const primitiveNames: Record<PrimitiveType, string> = {
  'primitive.box': '立方体', 'primitive.sphere': '球体',
  'primitive.plane': '平面', 'primitive.cylinder': '圆柱体'
}

export const useEditorStore = defineStore('editor', {
  state: () => ({
    scene: copy(exampleScene), selectedId: null as string | null,
    past: [] as SceneDocument[], future: [] as SceneDocument[]
  }),
  getters: {
    selected: state => state.scene.scene3d.nodes.find(node => node.id === state.selectedId) ?? null,
    selected2d: state => state.scene.components2d.find(item => item.id === state.selectedId) ?? null
  },
  actions: {
    commit(next: SceneDocument) {
      const checked = parseScene(copy(next))
      if (JSON.stringify(checked) === JSON.stringify(this.scene)) return
      this.past.push(copy(this.scene))
      if (this.past.length > 100) this.past.shift()
      this.scene = checked
      this.future = []
    },
    undo() {
      const previous = this.past.pop()
      if (!previous) return
      this.future.push(copy(this.scene))
      this.scene = previous
      this.ensureSelection()
    },
    redo() {
      const next = this.future.pop()
      if (!next) return
      this.past.push(copy(this.scene))
      this.scene = next
      this.ensureSelection()
    },
    ensureSelection() {
      if (!this.scene.scene3d.nodes.some(node => node.id === this.selectedId) && !this.scene.components2d.some(item => item.id === this.selectedId)) this.selectedId = null
    },
    add2d(type: ComponentType, position?: { x: number, y: number }) {
      const id = crypto.randomUUID(); const item = registry[type].create(id)
      if (position) { item.layout.x = position.x; item.layout.y = position.y }
      item.layout.zIndex = Math.max(0, ...this.scene.components2d.map(component => component.layout.zIndex)) + 1
      const next = copy(this.scene); next.components2d.push(item); this.commit(next); this.selectedId = id
    },
    update2d(id: string, update: (item: Component2D) => void) {
      const next = copy(this.scene); const item = next.components2d.find(component => component.id === id)
      if (!item) return
      update(item); this.commit(next)
    },
    remove2d(id: string) {
      const next = copy(this.scene); next.components2d = next.components2d.filter(item => item.id !== id)
      next.bindings = next.bindings.filter(binding => binding.targetId !== id)
      removeEventReferences(next, new Set([id]))
      this.commit(next); this.ensureSelection()
    },
    duplicate2d(id: string) {
      const next = copy(this.scene); const item = next.components2d.find(component => component.id === id)
      if (!item) return
      const duplicate = copy(item); duplicate.id = crypto.randomUUID(); duplicate.name += ' 副本'; duplicate.layout.x += 30; duplicate.layout.y += 30
      duplicate.layout.zIndex = Math.max(0, ...next.components2d.map(component => component.layout.zIndex)) + 1
      next.components2d.push(duplicate); this.commit(next); this.selectedId = duplicate.id
    },
    addModel(assetId: string, position: [number, number, number] = [0, 0, 0]) {
      const asset = this.scene.assets.find(item => item.id === assetId)
      if (!asset) throw new Error('资产不存在')
      const id = crypto.randomUUID()
      const next = copy(this.scene)
      next.scene3d.nodes.push({ id, type: 'model.gltf', name: asset.name, parentId: null, visible: true, transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] }, props: { assetId } })
      this.commit(next); this.selectedId = id
    },
    add(type: PrimitiveType, position: [number, number, number] = [0, 0, 0]) {
      const id = crypto.randomUUID()
      const node: Node = { id, type, name: primitiveNames[type], parentId: null, visible: true,
        transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] }, props: { color: '#4e9bff' } }
      const next = copy(this.scene)
      next.scene3d.nodes.push(node)
      this.commit(next)
      this.selectedId = id
    },
    update(id: string, update: (node: Node) => void) {
      const next = copy(this.scene)
      const node = next.scene3d.nodes.find(item => item.id === id)
      if (!node) return
      update(node)
      this.commit(next)
    },
    remove(id: string) {
      const ids = new Set([id])
      let previousSize = 0
      while (previousSize !== ids.size) {
        previousSize = ids.size
        this.scene.scene3d.nodes.forEach(node => { if (node.parentId && ids.has(node.parentId)) ids.add(node.id) })
      }
      const next = copy(this.scene)
      next.scene3d.nodes = next.scene3d.nodes.filter(node => !ids.has(node.id))
      next.bindings = next.bindings.filter(binding => !ids.has(binding.targetId))
      removeEventReferences(next, ids)
      this.commit(next)
      this.ensureSelection()
    },
    duplicate(id: string) {
      const original = this.scene.scene3d.nodes.find(node => node.id === id)
      if (!original) return
      const descendants = new Set([id])
      let previousSize = 0
      while (previousSize !== descendants.size) {
        previousSize = descendants.size
        this.scene.scene3d.nodes.forEach(node => { if (node.parentId && descendants.has(node.parentId)) descendants.add(node.id) })
      }
      const mapping = new Map([...descendants].map(oldId => [oldId, crypto.randomUUID()]))
      const next = copy(this.scene)
      const copies = copy(next.scene3d.nodes.filter(node => descendants.has(node.id))).map(node => {
        const oldId = node.id
        node.id = mapping.get(oldId)!
        if (node.parentId && mapping.has(node.parentId)) node.parentId = mapping.get(node.parentId)!
        if (oldId === id) { node.name += ' 副本'; node.transform.position[0] += 1 }
        return node
      })
      next.scene3d.nodes.push(...copies)
      this.commit(next)
      this.selectedId = mapping.get(id)!
    },
    importScene(content: string) {
      const next = parseScene(content)
      this.commit(next)
      this.selectedId = null
    }
  }
})
