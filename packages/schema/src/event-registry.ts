/** 可信构建期事件与动作白名单；场景文档不能注册代码。 */
export const eventRegistry: Record<string, { events: readonly string[], actions: readonly string[] }> = {
  'primitive.box': { events: ['click'], actions: ['node.setVisible'] },
  'model.gltf': { events: ['click'], actions: ['node.setVisible'] },
  'chart.bar': { events: ['click'], actions: ['chart.highlight'] }
}
