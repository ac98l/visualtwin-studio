import * as THREE from 'three'
import type { SceneDocument } from '@visualtwin/schema'

type Node = Extract<SceneDocument['scene3d']['nodes'][number], { type: `primitive.${string}` }>
const geometries: Record<Node['type'], () => THREE.BufferGeometry> = {
  'primitive.box': () => new THREE.BoxGeometry(),
  'primitive.sphere': () => new THREE.SphereGeometry(0.5, 32, 20),
  'primitive.plane': () => new THREE.PlaneGeometry(1, 1),
  'primitive.cylinder': () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
}
export function createPrimitive(node: Node) {
  return new THREE.Mesh(geometries[node.type](), new THREE.MeshStandardMaterial({ color: node.props.color, side: THREE.DoubleSide }))
}
