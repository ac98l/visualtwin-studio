# VisualTwin Studio

VisualTwin Studio 是一个基于浏览器的三维场景与二维数据可视化编辑器。使用 Vue 3、TypeScript、Three.js 和 ECharts，在同一画布中配置场景、图表、数据与交互，并导出独立静态 Player。

## 功能

- 创建和编辑基础几何体，上传 GLB 模型；支持场景树、对象变换、复制、删除及撤销重做。
- 添加柱状图、折线图、饼图、文字与数字卡片，按 1920×1080 设计画布布局。
- 配置静态 JSON 或 HTTP GET 数据源，用 JSON Pointer 绑定受支持的属性。
- 通过白名单事件规则实现三维对象点击与柱图高亮、柱图点击与三维对象显隐联动。
- 导入导出场景 JSON、包含资产的项目 ZIP，或导出独立静态 Web 项目。

项目基于 pnpm workspace，场景协议使用 JSON Schema 与 Ajv；编辑器和 Player 共用运行时。

## 目录

```text
apps/editor       场景编辑器
apps/player       独立 Player
packages/schema   场景协议、校验和示例场景
packages/core     数据源和事件运行时
packages/runtime-3d  Three.js 视口
packages/runtime-2d  Vue / ECharts 二维渲染
scripts           协议类型一致性检查
```

## 环境与启动

建议使用 Node.js LTS（Node 20.19+ 或 22.12+）、pnpm 10.33.0 和支持 WebGL2 的现代桌面浏览器。本快照已在 Node 23.7.0 / pnpm 10.33.0 构建；其他版本及操作系统需要分别验证。

```bash
pnpm install --frozen-lockfile
pnpm dev:editor
```

Editor 默认运行在 `http://localhost:5173/`。另开终端运行 `pnpm dev:player`，Player 开发示例默认运行在 `http://localhost:5174/`。Editor 启动命令会先构建 Player。端口被占用时，请释放对应端口后重试。

```bash
pnpm typecheck
pnpm build
```

## 基本使用

1. 在 Editor 左侧选择基础组件，或在“模型资产”上传 `.glb` 后点击或拖入模型。选中对象后使用工具栏和右侧属性面板编辑。
2. 从组件库添加图表和其他二维组件，在属性面板编辑布局、标题与静态数据。需要操作被二维图层覆盖的三维对象时，可启用“3D 操作优先”。
3. 在“数据源与绑定”打开“配置 JSON”，可用“填入静态柱状图示例”生成配置并保存。HTTP 数据源使用 GET 返回 JSON，绑定通过 JSON Pointer 提取值；目前支持柱状图 `source`、`title` 及立方体 `color`。不要在场景中保存密钥或访问令牌。
4. 添加柱图与立方体或 GLB 后，在“事件规则”点击“配置事件”并填入双向示例，保存后在预览中点击三维对象或柱图验证。运行时显隐和高亮不会写回场景配置。
5. “导出 JSON”保存场景配置，但不包含模型文件；“导出项目”生成包含场景和资产的 ZIP，可用“导入项目”恢复或迁移。建议在编辑前保留备份。

## 静态部署

“导出静态 Web”生成的 ZIP 与项目备份 ZIP 用途不同。解压静态 Web ZIP 后，在解压目录启动 HTTP 服务器，例如：

```bash
python3 -m http.server 8080
```

通过 `http://localhost:8080/` 访问，Windows 可使用 `py -m http.server 8080`。静态 Player 需要同目录下的 `scene.json`、`manifest.json` 和 `assets/`，不能直接使用 `file://`。正式部署建议 HTTPS；HTTP 下的 SHA-256 只检查资源与清单是否一致，不提供传输保护。

HTTP 数据源由访问者的浏览器请求，部署方须保证接口可访问并处理 CORS、HTTPS 混合内容与鉴权；不要将私有凭证写入前端。相对 URL 以部署位置解析，部署前需自行配置对应接口资源。

## 已知限制与常见问题

- 当前主要面向支持 WebGL2 的桌面 Chrome、Edge；不同系统、浏览器与硬件仍需实际验证。
- GLB 优先支持单文件，不支持 Draco、Meshopt、KTX2 解码、外部纹理引用或动画播放。默认单个 GLB 上限为 100 MiB，可通过 `VITE_MAX_GLB_BYTES` 调整。
- 项目存于浏览器 IndexedDB，JSON 不含资产；换浏览器或电脑时应使用项目 ZIP。不要同时在多个标签页编辑同一项目。
- 静态接口失败时检查网络、CORS、接口路径和安全上下文；运行时保留最近一次有效数据。
- 大场景的性能及 GPU 资源释放仍需在目标设备评估；生产构建可能提示较大的 JavaScript chunk。

## 许可与贡献

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE)。欢迎通过 Issue 描述问题或提出建议，提交变更时请说明用途并执行类型检查与构建；提交内容应确保有权公开，不包含私有资产或凭证。
