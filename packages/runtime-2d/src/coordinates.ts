export function fitFrame(width: number, height: number, designWidth: number, designHeight: number) {
  const scale = Math.min(width / designWidth, height / designHeight)
  return { scale, left: (width - designWidth * scale) / 2, top: (height - designHeight * scale) / 2 }
}
export function toDesign(x: number, y: number, frame: ReturnType<typeof fitFrame>, width: number, height: number) {
  if (!frame.scale) return null
  const dx = (x - frame.left) / frame.scale, dy = (y - frame.top) / frame.scale
  return dx < 0 || dy < 0 || dx > width || dy > height ? null : { x: dx, y: dy }
}
