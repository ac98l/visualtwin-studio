# VisualTwin Studio

VisualTwin Studio 是基于浏览器的三维场景与数据大屏编辑工具，包含独立的 3D Editor、Screen Editor 和共享 Player。当前候选为**开源预览版**，适合本地探索，不代表已完成所有平台或生产环境验收。

## 功能

- 3D Editor：基础几何体和 GLB 导入、拖放与变换、场景树、撤销重做、项目 ZIP 和静态网页导出。
- Screen Editor：导入 3D 项目 ZIP 作为独立背景，叠加柱状图、折线图、饼图、文本、数字指标、边框、装饰及滚动表格；支持图层、多选、旋转、对齐和单层组合。
- 静态 JSON / HTTP GET 数据源与 JSON Pointer；柱状图支持 `source`、`title` 白名单绑定。大屏支持 3D 节点点击高亮柱状图、柱状图点击切换背景节点显隐。
- 统一 Player 渲染已校验的场景和大屏；支持导出大屏工程 ZIP 迁移，以及导出可由静态服务器托管的独立网页。

技术栈：Vue 3、TypeScript、Vite、Three.js、ECharts、Element Plus、Pinia、JSON Schema / Ajv。项目使用 pnpm workspace，共享 `schema`、`core`、二维/三维 Runtime 和资产管理模块。

## 安装和启动

需要桌面浏览器支持 WebGL2。Vite 6 要求 Node.js `^18.0.0 || ^20.0.0 || >=22.0.0`，pnpm 10.33.0 至少需要 Node.js 18.12；建议使用受支持的 Node.js LTS。本项目本次干净安装验证环境为 macOS、Node 23.7.0、pnpm 10.33.0；其他 Node 版本需自行验证。可通过 Corepack 启用指定 pnpm：

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
git clone https://github.com/ac98l/visualtwin-studio.git
cd visualtwin-studio
pnpm install --frozen-lockfile
```

在三个终端分别启动：

```bash
pnpm dev:editor  # http://localhost:5173/，启动前构建 Player
pnpm dev:screen  # http://localhost:5175/，启动前构建 Player
pnpm dev:player  # http://localhost:5174/，开发示例
```

端口被占用时命令会失败；开发服务监听的实际地址以终端为准。Player 默认显示内置示例，不会自动读取其他端口编辑器的本地项目。

```bash
pnpm typecheck
pnpm build       # 按 Player、3D Editor、Screen Editor 顺序构建
```

修改协议 Schema 后可运行 `pnpm generate:types`；类型检查会验证生成类型与 Schema 一致。

## 基本使用

### 1. 创建 3D 场景

在 3D Editor 的“模型资产”中点击“上传 GLB”，再从资产库点击或拖入场景；也可加入基础几何体。选中节点后调整名称、位置、旋转、缩放与显隐。点击“导出项目”得到包含场景和模型的 3D 项目 ZIP。JSON 仅保存配置，不包含 GLB，不能单独跨设备恢复模型。

### 2. 创建大屏并导入背景

打开 Screen Editor，选择“导入 3D 项目 ZIP”；背景是原场景的独立快照，不会修改或同步原 3D 工程。背景原有二维组件、数据源和事件规则会保留在快照中，但不会自动运行。可从左侧组件库点击或拖入组件，通过右侧属性及图层工具编辑；大屏默认 1920×1080 等比适配。修改后点击“保存”，大屏采用手动保存策略。

### 3. 绑定数据

在“数据源”中点击“新增静态”，填写例如：

```json
{"rows":[["category","value"],["一月",42],["二月",65]]}
```

点击“保存数据源配置”。选中柱状图，在右侧“数据绑定”选择该数据源和 `柱状图数据 source`，JSON Pointer 填 `/rows`，点击“保存绑定”。也可选择“新增 HTTP”，填写可访问的 GET JSON 地址、超时和轮询间隔，再通过相同方式绑定。当前大屏白名单只开放柱状图 `source` 和 `title`，其他组件不能任意绑定属性。动态响应仅影响运行显示，不写回静态配置。

### 4. 配置跨层事件

先导入含立方体或 GLB 节点的背景并添加柱状图。在左侧“跨层事件”选择“3D 背景”来源、节点、柱状图目标和非负数据索引，点击“保存事件”；再新建一条“2D 前景”来源为柱状图、目标为背景节点的规则，设置显隐并保存。点击“联动预览”后可尝试点击模型高亮图表、点击柱状图数据项控制模型显隐；返回编辑模式继续编辑。运行时显隐与高亮不会写入持久化配置。

### 5. 导出、导入和部署

- “导出大屏工程”用于备份与迁移，包含大屏、背景快照及实际引用的 GLB；在另一来源或电脑点击“导入大屏工程”，确认结果后**手动点击保存**。
- “导出 JSON”只导出配置，不包含 GLB，不能作为完整模型备份。
- “导出静态网页”生成 Player、场景、清单和模型的部署 ZIP。将其整体解压到普通 HTTP/HTTPS 静态服务器目录，访问该目录；支持根路径和子目录，不能双击 `file://` 直接使用。部署端不需要 Editor 或 Node.js。例如本地检查可在解压目录运行 `python3 -m http.server 8080`。

外部 HTTP 数据仍由访问者浏览器请求，不随 ZIP 打包；接口需允许目标站点 CORS，HTTPS 网页不能调用不安全 HTTP 接口。不要在 URL、静态数据或场景中放置 Token、密码或其他私密信息。哈希只检查文件与清单一致性，不能替代 HTTPS。

## 目录

```text
apps/editor          3D Editor
apps/screen-editor   大屏设计器
apps/player          统一 Player
packages/schema      协议与校验
packages/core        数据与事件机制
packages/runtime-3d  三维渲染与 GLB
packages/runtime-2d  图表及大屏组件
packages/editor-ui   共享属性面板
packages/project-archive / screen-storage  项目包与本地存储
```

## 已知限制

目前以 Windows/macOS 桌面 Chrome、Edge 的 WebGL2 环境为目标；已验证 macOS Chrome + SwiftShader 软件渲染，macOS Edge、Windows Chrome/Edge、真实硬件 GPU、跨物理设备迁移及长期资源压力尚未完成验收。模型首版仅支持单文件 GLB，不支持 Draco、Meshopt、KTX2 解码及外部纹理引用，也不提供动画播放。大屏不支持后端账户、云同步、多人协同、任意脚本和模板市场。多标签页并发编辑没有冲突协调，历史无引用资产不会自动全部清理。HTTP 接口可能因跨域、混合内容、网络或鉴权限制不可访问。构建存在大 chunk 警告，未承诺特定 FPS 或模型规模。

## 从早期公开快照迁移

3D Editor 的启动命令和端口保持不变。早期的 `packages/schema/examples/event-demo.json` 已由 `packages/schema/examples/scene-p6.json` 取代；两份示例的事件、数据源和节点一致，场景名称不同，旧文件路径或直接链接需要更新。此前源码内的 `apps/editor/src/Properties2D.vue` 已迁至 `packages/editor-ui/src/Properties2D.vue`，自行修改或引用该内部文件的开发者需调整路径。早期 SceneDocument 与 3D 项目 ZIP 继续使用原导入入口。

## 安全复核状态

截至本次复核，当前锁定生产依赖的 npm 审计报告 3 项中危和 1 项高危：涉及 Element Plus、Ajv、ECharts 和 Vue 服务端渲染组件；后续应重新审计并以最新结果为准。这些依赖版本尚未修复相应通告。fflate 已更新至 0.8.3，修复了相应 ZIP64 解析通告。当前项目未发现对应的 el-link 不可信输入、Ajv `$data`、ECharts `lines` 系列或 SSR 用法；外部 ZIP 在解压前会先做结构和大小校验。上述为有限代码路径分析，不保证所有攻击输入均安全；正式对外更新前仍应完成依赖安全和许可复核，勿将项目用于未经安全评估的高风险部署。

## 许可证与贡献

项目源码采用 [MIT License](LICENSE)，版权持有人为 zhangZhen。依赖使用各自的开源许可证，见 [第三方许可候选清单](THIRD_PARTY_NOTICES.md)；静态网页 ZIP 自动包含项目 LICENSE、Apache ECharts NOTICE 和当前 Player 构建依赖的许可文本。lodash-unified 的上游具体版权文本尚未核实；有关构建或依赖版本变化后应重新审查声明。导入和发布的模型、图片与数据需由使用者自行确认授权。欢迎通过 Issue 或 Pull Request 反馈，提交前请运行类型检查与构建，不要提交凭证、个人项目或构建产物。
