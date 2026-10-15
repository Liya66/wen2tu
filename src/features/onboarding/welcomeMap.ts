import { REPO_URL } from '../../config'
import type { Language } from '../../i18n'
import { createNode } from '../mindmap/document'
import type { MapNode, MindMap } from '../mindmap/types'

/** A topic, optionally with children and a link. */
interface Topic {
  text: string
  link?: string
  children?: Topic[]
}

/** First-level branches: which side of the center they sit on. */
interface Branch extends Topic {
  side: 'left' | 'right'
}

const repoLabel = REPO_URL.replace(/^https:\/\//, '')

/*
 * Branch order sets the colors (the theme palette is handed out in order),
 * so it matches the designed layout: left — intro, AI tip, shortcuts;
 * right — files, next steps, open source.
 */
const CONTENT: Record<Language, { title: string; root: string; branches: Branch[] }> = {
  'zh-CN': {
    title: '欢迎使用文兔兔',
    root: '欢迎来到文兔兔',
    branches: [
      {
        text: '文兔兔',
        side: 'left',
        children: [
          { text: '开源、本地优先的思维导图工具' },
          { text: '“文兔兔” = “文 to 图”' },
          { text: '不用注册账号，极简操作' },
          { text: '纯本地数据，无隐私担忧' },
          { text: '支持导出多种图片格式' },
        ],
      },
      {
        text: '一键生成',
        side: 'left',
        children: [
          { text: 'tip：让任意 AI 把材料整理成 Markdown 大纲，复制后在文兔兔按 Ctrl/⌘ + V，秒出导图' },
          { text: '“新建 → 粘贴文字生成…”里可一键复制 AI 提示词' },
        ],
      },
      {
        text: '快捷键',
        side: 'left',
        children: [
          { text: '选中节点，按 Tab 添加子节点' },
          { text: '按 Enter 添加同级节点' },
          { text: '双击或按 F2 编辑文字' },
          { text: '拖动节点调整位置' },
          { text: '右键节点查看更多操作' },
          { text: 'Ctrl/⌘ + Z 撤销' },
          { text: '“样式”：配色与节点外观' },
          { text: '“新建 → 从模板新建”' },
        ],
      },
      {
        text: '文件与保存',
        side: 'right',
        children: [
          { text: '编辑内容自动暂存在浏览器' },
          { text: 'Ctrl/⌘ + S 保存为文件' },
          { text: 'Chrome / Edge 可直接写回原文件' },
          { text: '其他浏览器会下载副本' },
          { text: '导入 Markdown / OPML' },
          { text: '导出 PNG / SVG / Markdown' },
        ],
      },
      {
        text: '下一步',
        side: 'right',
        children: [
          { text: '这张导图可以随意修改或删除' },
          { text: '点击“新建”开始第一张脑图' },
          { text: '在“设置 → 欢迎导图”可重新打开' },
        ],
      },
      {
        text: '开源项目',
        side: 'right',
        children: [
          { text: 'MIT 许可证，免费使用' },
          { text: `GitHub：${repoLabel}`, link: REPO_URL },
          { text: '欢迎提交 Issue 和 PR' },
          { text: '官网仅统计访问量，看不到你的脑图' },
        ],
      },
    ],
  },
  en: {
    title: 'Welcome to wen2tu',
    root: 'Welcome to wen2tu',
    branches: [
      {
        text: 'wen2tu',
        side: 'left',
        children: [
          { text: 'Open-source, local-first mind maps' },
          { text: '文兔兔 sounds like “text to map”' },
          { text: 'No sign-up, minimal and simple' },
          { text: 'Local-only data, no privacy worries' },
          { text: 'Export to several image formats' },
        ],
      },
      {
        text: 'One-click maps',
        side: 'left',
        children: [
          { text: 'Tip: ask any AI to turn your notes into a Markdown outline, copy it, press Ctrl/⌘ + V here — instant map' },
          { text: '“New → From pasted text…” has an AI prompt to copy' },
        ],
      },
      {
        text: 'Shortcuts',
        side: 'left',
        children: [
          { text: 'Select a topic, press Tab to add a child' },
          { text: 'Press Enter to add a sibling' },
          { text: 'Double-click or press F2 to edit' },
          { text: 'Drag topics to move them' },
          { text: 'Right-click a topic for more actions' },
          { text: 'Ctrl/⌘ + Z to undo' },
          { text: '“Style”: colors and topic looks' },
          { text: '“New → From template”' },
        ],
      },
      {
        text: 'Files & saving',
        side: 'right',
        children: [
          { text: 'Edits are kept in your browser automatically' },
          { text: 'Ctrl/⌘ + S saves to a file' },
          { text: 'Chrome / Edge save back to the original file' },
          { text: 'Other browsers download a copy' },
          { text: 'Import Markdown / OPML' },
          { text: 'Export PNG / SVG / Markdown' },
        ],
      },
      {
        text: 'Next',
        side: 'right',
        children: [
          { text: 'Edit or delete this map freely' },
          { text: 'Click “New” to start your first map' },
          { text: 'Reopen it from “Settings → Welcome map”' },
        ],
      },
      {
        text: 'Open source',
        side: 'right',
        children: [
          { text: 'MIT license, free to use' },
          { text: `GitHub: ${repoLabel}`, link: REPO_URL },
          { text: 'Issues and PRs welcome' },
          { text: 'The site only counts visits and never sees your maps' },
        ],
      },
    ],
  },
}

function build(topic: Topic): MapNode {
  const node = createNode(topic.text, topic.children?.map(build))
  if (topic.link) node.hyperLink = topic.link
  return node
}

/** The map shown on a first visit: what wen2tu is, a quick guide and project links. */
export function createWelcomeMap(language: Language): { title: string; map: MindMap } {
  const content = CONTENT[language]
  const branches = content.branches.map((branch) => ({ ...build(branch), direction: branch.side === 'left' ? 0 : 1 }) as MapNode)
  // No theme: it follows the system, i.e. the wen2tu colors in light and dark.
  return { title: content.title, map: { nodeData: createNode(content.root, branches), direction: 2 } }
}
