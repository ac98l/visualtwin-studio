import type { ScreenComponent2D as Component2D } from './registry'
export function normalizeAngle(value: number) { return ((value + 180) % 360 + 360) % 360 - 180 }
export function bounds(item: Component2D, angle = 0) {
  const { x, y, width, height } = item.layout
  const radians = angle * Math.PI / 180
  const w = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))
  const h = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
  return { x: x + width / 2 - w / 2, y: y + height / 2 - h / 2, width: w, height: h }
}
export function union(items: Component2D[], rotations: Record<string, number> = {}) {
  if (!items.length) return null
  const boxes = items.map(item => bounds(item, rotations[item.id] ?? 0))
  const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y))
  return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x, height: Math.max(...boxes.map(box => box.y + box.height)) - y }
}
export function align(items: Component2D[], mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'horizontal' | 'vertical', rotations: Record<string, number> = {}) {
  if (items.length < (mode === 'horizontal' || mode === 'vertical' ? 3 : 2)) return items
  const outer = union(items, rotations)!
  const horizontal = mode === 'horizontal', vertical = mode === 'vertical'
  const boxes = items.map(item => ({ item, box: bounds(item, rotations[item.id] ?? 0) }))
  if (horizontal || vertical) boxes.sort((a, b) => horizontal ? a.box.x - b.box.x : a.box.y - b.box.y)
  const extent = horizontal ? outer.width : outer.height
  const occupied = boxes.reduce((sum, entry) => sum + (horizontal ? entry.box.width : entry.box.height), 0)
  const gap = (extent - occupied) / (items.length - 1)
  let cursor = horizontal ? outer.x : outer.y
  return boxes.map(({ item, box }) => {
    let dx = 0, dy = 0
    if (mode === 'left') dx = outer.x - box.x
    if (mode === 'center') dx = outer.x + outer.width / 2 - (box.x + box.width / 2)
    if (mode === 'right') dx = outer.x + outer.width - box.x - box.width
    if (mode === 'top') dy = outer.y - box.y
    if (mode === 'middle') dy = outer.y + outer.height / 2 - (box.y + box.height / 2)
    if (mode === 'bottom') dy = outer.y + outer.height - box.y - box.height
    if (horizontal) { dx = cursor - box.x; cursor += box.width + gap }
    if (vertical) { dy = cursor - box.y; cursor += box.height + gap }
    return { ...item, layout: { ...item.layout, x: item.layout.x + dx, y: item.layout.y + dy } }
  })
}
