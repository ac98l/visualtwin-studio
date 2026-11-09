export function jsonType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return '数组'
  return ({ string: '字符串', number: '数字', boolean: '布尔值', object: '对象' } as Record<string, string>)[typeof value] ?? '未知类型'
}

// 只展示已知类别，不回显错误中的路径、响应或 URL。
export function diagnostic(error: string): string {
  const http = error.match(/(?:^|：)HTTP (\d{3})(?:\b|$)/)
  if (http) return `HTTP ${http[1]}：请检查接口状态。`
  if (error.includes('请求超时')) return '请求超时：请检查接口响应时间或超时配置。'
  if (error.includes('256 KiB')) return '响应超过预览读取上限 256 KiB：请缩小返回数据。'
  if (error.includes('JSON Pointer 无效')) return 'JSON Pointer 格式无效：请检查路径转义。'
  if (error.includes('路径不存在')) return 'JSON Pointer 路径不存在：请检查字段路径。'
  if (error.includes('类型不匹配')) return error.includes('非负数') ? '绑定值类型不匹配：饼图数值须为非负数。' : '绑定值类型不匹配：请检查目标属性的数据要求。'
  if (/有效 JSON|JSON 格式|JSON\.parse|JSON Parse|Unexpected token|Unexpected end|not valid JSON/i.test(error)) return 'JSON 解析失败：请检查接口是否返回有效 JSON。'
  return '请求或数据处理失败：请检查接口、网络及浏览器访问限制。'
}
