<p align="center">
  <img src="brand/wen2tu-logo.webp" width="420" alt="wen2tu logo: a bunny holding a carrot pencil, connected to mind map topics">
</p>

<h1 align="center">文兔兔 · wen2tu</h1>

<p align="center">
  开源、本地优先的浏览器思维导图。<br>
  <a href="README.md">English</a> · <b>简体中文</b>
</p>

---

“文兔兔”取自“文 to 图”的谐音：写下大纲，就能得到一张脑图；也可以直接开始画。

- **文件在你自己手里。** 直接打开、保存电脑上的 `.mind.json` 文件。不需要账号，没有服务器，不上传任何内容。
- **不怕丢失。** 每次编辑都会在瞬间暂存到浏览器中，页面崩溃或误刷新后可以恢复。
- **完整的编辑器。** 节点的添加、编辑、拖拽、折叠和连线，撤销与重做，常用操作都有快捷键。
- **随心定制外观。** 12 套配色方案和自定义颜色，12 个模板（项目计划、SWOT、旅行计划、流程梳理等），节点样式面板提供 13 种形状（菱形、云朵、便签、票券、吊牌等），还可调圆角、全包边框或下划线、填充、文字颜色和字号、分支颜色；连线可调强度（含隐藏）、粗细和线型（曲线、折线、直线）。可以把自己的大纲（比如 AI 的回复）套进任意模板的样式。
- **导入已有大纲。** 可直接粘贴 Markdown 或缩进大纲（比如 AI 的回复）：选中节点时生成下级节点，否则生成新导图；也可导入 Markdown、OPML 文件。内置“AI 提示词”，让任意 AI 按合适的格式输出。
- **方便分享。** 可导出 PNG、SVG、Markdown 大纲，或可交互的 HTML：单个文件，离线也能在任何浏览器打开（缩放、折叠分支、点击链接），还能再导入文兔兔。图片默认带配色背景，也可以选择透明背景导出（深色配色会自动换成浅色版本，适合贴进白底文档）。
- **中英双语。** 界面可在中英文之间切换，不会改动你的脑图内容。

## 浏览器支持

| 浏览器 | 直接打开和保存文件 | 兼容方式 |
| --- | --- | --- |
| Chrome、Edge、Opera、Brave、Arc（桌面版） | ✅ 保存时直接写回原文件 | — |
| Firefox、Safari、手机浏览器 | ❌（浏览器不提供该接口） | 通过文件选择器打开；**保存时下载一份新副本**，不会覆盖原文件 |

在所有浏览器中，侧边栏里的脑图都会保存在浏览器存储（IndexedDB）里，直到你手动移除。所以即使还没保存成文件，下次打开时内容也还在。

## 隐私

文兔兔没有后端。脑图内容只在你的浏览器中处理，不会发送到任何地方。部署在 Cloudflare Pages 上的官方站点使用 [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) 统计访问量：它不使用 Cookie，不做指纹识别，也看不到你的脑图。自行部署的版本不包含任何统计。

## 快捷键

| 按键 | 操作 |
| --- | --- |
| `Ctrl/⌘ S` · `Ctrl/⌘ Shift S` | 保存 · 另存为 |
| `Ctrl/⌘ O` | 打开 |
| `Ctrl/⌘ Z` · `Ctrl/⌘ Shift Z` | 撤销 · 重做 |
| `Tab` · `Enter` · `Shift Enter` | 添加子节点 · 在后面添加同级 · 在前面添加同级 |
| `F2` 或双击 | 编辑节点 |
| `Delete` | 删除选中节点 |
| 方向键 | 在节点间移动 |
| `Ctrl/⌘ K` 再按 `0–9` | 展开或折叠到指定层级 |

## 文件格式

`.mind.json` 是带版本号的普通 JSON，详见 [docs/FILE_FORMAT.md](docs/FILE_FORMAT.md)。也可以直接打开 [Mind Elixir](https://github.com/SSShooter/mind-elixir-core) 导出的数据。

## 本地开发

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 单元和组件测试（Vitest）
npm run test:e2e     # 针对生产构建的端到端测试（Playwright）
npm run check        # lint + 测试 + 类型检查 + 构建
```

部署自己的副本到 Cloudflare Pages：见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)。文兔兔基于 [Mind Elixir](https://github.com/SSShooter/mind-elixir-core)（MIT）等开源项目构建，所有生产依赖均为 MIT 或 ISC 许可证。
