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
type Box = { x: number, y: number, width: number, height: number }
type SnapReference = { id: string, box: Box, visible: boolean }
type SnapLine = { axis: 'x' | 'y', position: number, source: 'canvas' | 'component', id?: string }

// Equal distances retain the first candidate: canvas first, then references in input order;
// within each, start, center and end anchors are considered in that order.
export function snapMove(box: Box, references: SnapReference[], selectedIds: string[], canvas: { width: number, height: number }, scale: number, offset: { x: number, y: number }, thresholdPx = 6) {
  const raw = { x: Number.isFinite(offset.x) ? offset.x : 0, y: Number.isFinite(offset.y) ? offset.y : 0 }
  const result: { offset: typeof raw, lines: SnapLine[] } = { offset: raw, lines: [] }
  const validBox = (value: Box) => [value.x, value.y, value.width, value.height, value.x + value.width, value.y + value.height].every(Number.isFinite) && value.width >= 0 && value.height >= 0
  if (!validBox(box) || !Number.isFinite(canvas.width) || !Number.isFinite(canvas.height) || canvas.width <= 0 || canvas.height <= 0 || !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(thresholdPx) || thresholdPx < 0) return result
  const threshold = thresholdPx / scale
  if (!Number.isFinite(threshold)) return result
  const targets: { box: Box, source: 'canvas' | 'component', id?: string }[] = [{ box: { x: 0, y: 0, width: canvas.width, height: canvas.height }, source: 'canvas' }]
  for (const reference of references) if (reference.visible && !selectedIds.includes(reference.id) && validBox(reference.box)) targets.push({ box: reference.box, source: 'component', id: reference.id })
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height'
    const start = box[axis] + raw[axis]
    const anchors = [start, start + box[size] / 2, start + box[size]]
    let best: { distance: number, line: SnapLine } | undefined
    for (const target of targets) {
      const positions = [target.box[axis], target.box[axis] + target.box[size] / 2, target.box[axis] + target.box[size]]
      for (const position of positions) for (const anchor of anchors) {
        const distance = position - anchor
        if (Number.isFinite(distance) && Math.abs(distance) <= threshold && (!best || Math.abs(distance) < Math.abs(best.distance)) && Number.isFinite(raw[axis] + distance)) best = { distance, line: { axis, position, source: target.source, ...(target.id === undefined ? {} : { id: target.id }) } }
      }
    }
    if (best) { result.offset[axis] += best.distance; result.lines.push(best.line) }
  }
  return result
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
