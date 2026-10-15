import { REPO_URL } from '../../config'
import type { Language } from '../../i18n'
import { createNode } from '../mindmap/document'
import type { MapNode, MindMap } from '../mindmap/types'

/** A topic, optionally with children, an icon and a link. */
interface Topic {
  text: string
  icon?: string
  link?: string
  children?: Topic[]
}

const repoLabel = REPO_URL.replace(/^https:\/\//, '')

const CONTENT: Record<Language, { title: string; root: Topic }> = {
  'zh-CN': {
    title: '欢迎使用文兔兔',
    root: {
      text: '欢迎来到文兔兔',
      children: [
        {
          text: '这是什么',
          icon: '🐰',
          children: [
            { text: '开源、本地优先的思维导图工具' },
            { text: '“文兔兔” = “文 to 图”' },
            { text: '不用注册账号，打开就能用' },
            { text: '脑图只保存在你的设备上，不会上传' },
          ],
        },
        {
          text: '适合用来',
          icon: '💡',
          children: [
            { text: '读书笔记和学习大纲' },
            { text: '项目计划与任务拆解' },
            { text: '会议记录' },
            { text: '头脑风暴' },
            { text: '把 Markdown 笔记一键变成脑图' },
          ],
        },
        {
          text: '快速上手',
          icon: '🚀',
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
          icon: '💾',
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
          text: '开源项目',
          icon: '🌱',
          children: [
            { text: 'MIT 许可证，免费使用' },
            { text: `GitHub：${repoLabel}`, link: REPO_URL },
            { text: '欢迎提交 Issue 和 PR' },
            { text: '官网仅统计访问量，看不到你的脑图' },
          ],
        },
        {
          text: '下一步',
          icon: '✨',
          children: [
            { text: '这张导图可以随意修改或删除' },
            { text: '点击“新建”开始第一张脑图' },
            { text: '在“设置 → 欢迎导图”可重新打开' },
          ],
        },
      ],
    },
  },
  en: {
    title: 'Welcome to wen2tu',
    root: {
      text: 'Welcome to wen2tu',
      children: [
        {
          text: 'What it is',
          icon: '🐰',
          children: [
            { text: 'Open-source, local-first mind maps' },
            { text: '文兔兔 sounds like “text to map”' },
            { text: 'No account needed — just start' },
            { text: 'Maps stay on your device' },
          ],
        },
        {
          text: 'Great for',
          icon: '💡',
          children: [
            { text: 'Reading notes and study outlines' },
            { text: 'Project plans and task breakdowns' },
            { text: 'Meeting notes' },
            { text: 'Brainstorming' },
            { text: 'Markdown notes → maps' },
          ],
        },
        {
          text: 'Quick guide',
          icon: '🚀',
          children: [
            { text: 'Tab: add a child topic' },
            { text: 'Enter: add a sibling' },
            { text: 'Double-click or F2: edit' },
            { text: 'Drag topics to move them' },
            { text: 'Right-click for more actions' },
            { text: 'Ctrl/⌘ + Z: undo' },
            { text: 'Style: colors and topic looks' },
            { text: 'New → From template' },
          ],
        },
        {
          text: 'Files & saving',
          icon: '💾',
          children: [
            { text: 'Edits are kept in your browser' },
            { text: 'Ctrl/⌘ + S: save to a file' },
            { text: 'Chrome / Edge save in place' },
            { text: 'Other browsers download a copy' },
            { text: 'Import Markdown / OPML' },
            { text: 'Export PNG / SVG / Markdown' },
          ],
        },
        {
          text: 'Open source',
          icon: '🌱',
          children: [
            { text: 'MIT license, free to use' },
            { text: `GitHub: ${repoLabel}`, link: REPO_URL },
            { text: 'Issues and PRs welcome' },
            { text: 'The site never sees your maps' },
          ],
        },
        {
          text: 'Next',
          icon: '✨',
          children: [
            { text: 'Edit or delete this map freely' },
            { text: 'Click New to start your own' },
            { text: 'Reopen: Settings → Welcome map' },
          ],
        },
      ],
    },
  },
}

function build(topic: Topic): MapNode {
  const node = createNode(topic.text, topic.children?.map(build))
  if (topic.icon) node.icons = [topic.icon]
  if (topic.link) node.hyperLink = topic.link
  return node
}

/** The map shown on a first visit: what wen2tu is, a quick guide and project links. */
export function createWelcomeMap(language: Language): { title: string; map: MindMap } {
  const content = CONTENT[language]
  // No theme: it follows the system, i.e. the wen2tu colors in light and dark.
  return { title: content.title, map: { nodeData: build(content.root), direction: 2 } }
}
