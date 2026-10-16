import type { Language } from '../../i18n'
import { createNode } from '../mindmap/document'
import type { Direction, MapNode, MindMap, NodeShape } from '../mindmap/types'
import { exportMarkdown } from '../import-export/markdownExport'
import { findPreset } from './themes'

/** [topic, children?, shape?] — a compact way to write a tree. */
type Outline = [string, Outline[]?, NodeShape?]

export interface MapTemplate {
  id: string
  /** Theme preset id; undefined follows the system. */
  theme?: string
  direction: Direction
  /**
   * Topic shape by depth: [center, first level, second level, …]. Also applied
   * when the user's own outline is poured into the template.
   */
  levels?: Array<NodeShape | undefined>
  content: Record<Language, Outline>
}

const SIDE = 2
const RIGHT = 1
const DOWN = 3

export const TEMPLATES: MapTemplate[] = [
  {
    id: 'blank',
    direction: SIDE,
    content: { en: ['Central topic'], 'zh-CN': ['中心主题'] },
  },
  {
    id: 'project',
    theme: 'ocean',
    direction: SIDE,
    levels: ['card', 'card'],
    content: {
      en: [
        'Project plan',
        [
          ['Goals', [['Outcome 1'], ['Outcome 2']]],
          ['Scope', [['In scope'], ['Out of scope']]],
          ['Timeline', [['Phase 1 · Research'], ['Phase 2 · Build'], ['Phase 3 · Launch']]],
          ['Team', [['Owner'], ['Contributors']]],
          ['Risks', [['Risk'], ['Mitigation']]],
          ['Success metrics'],
        ],
      ],
      'zh-CN': [
        '项目计划',
        [
          ['目标', [['成果一'], ['成果二']]],
          ['范围', [['包含'], ['不包含']]],
          ['时间线', [['阶段一 · 调研'], ['阶段二 · 开发'], ['阶段三 · 上线']]],
          ['团队', [['负责人'], ['参与者']]],
          ['风险', [['风险点'], ['应对措施']]],
          ['衡量指标'],
        ],
      ],
    },
  },
  {
    id: 'meeting',
    theme: 'mono',
    direction: RIGHT,
    levels: ['double', 'note'],
    content: {
      en: [
        'Meeting notes',
        [
          ['Date & attendees'],
          ['Agenda', [['Topic 1'], ['Topic 2']]],
          ['Discussion'],
          ['Decisions'],
          ['Action items', [['Who · What · When']]],
        ],
      ],
      'zh-CN': [
        '会议记录',
        [
          ['时间与参会人'],
          ['议程', [['议题一'], ['议题二']]],
          ['讨论要点'],
          ['决定事项'],
          ['待办', [['负责人 · 事项 · 截止时间']]],
        ],
      ],
    },
  },
  {
    id: 'swot',
    theme: 'macaron',
    direction: SIDE,
    levels: [undefined, 'hexagon'],
    content: {
      en: [
        'SWOT analysis',
        [
          ['Strengths', [['Internal advantage']]],
          ['Weaknesses', [['Internal limitation']]],
          ['Opportunities', [['External chance']]],
          ['Threats', [['External risk']]],
        ],
      ],
      'zh-CN': [
        'SWOT 分析',
        [
          ['优势 Strengths', [['内部优势']]],
          ['劣势 Weaknesses', [['内部不足']]],
          ['机会 Opportunities', [['外部机会']]],
          ['威胁 Threats', [['外部风险']]],
        ],
      ],
    },
  },
  {
    id: 'reading',
    theme: 'forest',
    direction: RIGHT,
    levels: ['card', 'leaf'],
    content: {
      en: [
        'Book title',
        [
          ['About', [['Author'], ['Why I read it']]],
          ['Key ideas', [['Idea 1'], ['Idea 2'], ['Idea 3']]],
          ['Favourite quotes'],
          ['Questions'],
          ['What I will do differently'],
        ],
      ],
      'zh-CN': [
        '书名',
        [
          ['基本信息', [['作者'], ['阅读原因']]],
          ['核心观点', [['观点一'], ['观点二'], ['观点三']]],
          ['摘抄'],
          ['疑问'],
          ['行动与改变'],
        ],
      ],
    },
  },
  {
    id: 'weekly',
    theme: 'sakura',
    direction: SIDE,
    levels: [undefined, 'note'],
    content: {
      en: [
        'This week',
        [
          ['Work', [['Top priority']]],
          ['Study', [['Course / reading']]],
          ['Health', [['Exercise'], ['Sleep']]],
          ['Personal', [['Family & friends']]],
          ['Review', [['Went well'], ['To improve']]],
        ],
      ],
      'zh-CN': [
        '本周计划',
        [
          ['工作', [['最重要的事']]],
          ['学习', [['课程 / 阅读']]],
          ['健康', [['运动'], ['睡眠']]],
          ['生活', [['家人与朋友']]],
          ['复盘', [['做得好的'], ['可以改进的']]],
        ],
      ],
    },
  },
  {
    id: 'brainstorm',
    theme: 'sunset',
    direction: SIDE,
    levels: ['ellipse', 'cloud'],
    content: {
      en: [
        'Big question',
        [
          ['Problem', [['Who is affected?'], ['Why now?']]],
          ['Ideas', [['Idea A'], ['Idea B'], ['Wild idea']]],
          ['Constraints'],
          ['Next steps'],
        ],
      ],
      'zh-CN': [
        '核心问题',
        [
          ['问题', [['影响了谁？'], ['为什么是现在？']]],
          ['想法', [['想法 A'], ['想法 B'], ['大胆的想法']]],
          ['限制条件'],
          ['下一步'],
        ],
      ],
    },
  },
  {
    id: 'decision',
    theme: 'midnight',
    direction: RIGHT,
    levels: ['diamond', 'flag'],
    content: {
      en: [
        'Decision',
        [
          ['Option A', [['Pros'], ['Cons']]],
          ['Option B', [['Pros'], ['Cons']]],
          ['Criteria', [['Cost'], ['Time'], ['Impact']]],
          ['Conclusion'],
        ],
      ],
      'zh-CN': [
        '决策',
        [
          ['方案 A', [['优点'], ['缺点']]],
          ['方案 B', [['优点'], ['缺点']]],
          ['评估标准', [['成本'], ['时间'], ['影响']]],
          ['结论'],
        ],
      ],
    },
  },
  {
    id: 'org',
    theme: 'bunny',
    direction: DOWN,
    levels: ['double', 'card'],
    content: {
      en: ['Organization', [['Team A', [['Member'], ['Member']]], ['Team B', [['Member']]], ['Team C']]],
      'zh-CN': ['组织架构', [['团队 A', [['成员'], ['成员']]], ['团队 B', [['成员']]], ['团队 C']]],
    },
  },
  {
    id: 'trip',
    theme: 'sunset',
    direction: SIDE,
    levels: ['ticket', 'flag', 'tag'],
    content: {
      en: [
        'Tokyo in 5 days',
        [
          ['Itinerary', [['Day 1 · Asakusa'], ['Day 2 · Shibuya'], ['Day 3 · Kamakura']]],
          ['Getting around', [['Flights'], ['Metro card']]],
          ['Stay', [['Hotel booking number']]],
          ['Packing list', [['Passport'], ['Plug adapter'], ['Power bank']]],
        ],
      ],
      'zh-CN': [
        '东京五日游',
        [
          ['行程', [['第 1 天 · 浅草'], ['第 2 天 · 涩谷'], ['第 3 天 · 镰仓']]],
          ['交通', [['机票'], ['地铁卡']]],
          ['住宿', [['酒店确认号']]],
          ['打包清单', [['护照'], ['转换插头'], ['充电宝']]],
        ],
      ],
    },
  },
  {
    id: 'archive',
    theme: 'classic',
    direction: RIGHT,
    levels: ['folder', 'folder', 'tag'],
    content: {
      en: [
        'Knowledge base',
        [
          ['Work', [['Contracts'], ['Reports']]],
          ['Study', [['Course notes'], ['Papers']]],
          ['Life', [['Documents'], ['Bills']]],
        ],
      ],
      'zh-CN': [
        '资料库',
        [
          ['工作', [['合同'], ['报告']]],
          ['学习', [['课程笔记'], ['论文']]],
          ['生活', [['证件'], ['账单']]],
        ],
      ],
    },
  },
  {
    id: 'process',
    theme: 'bunny',
    direction: RIGHT,
    levels: ['chamfer', 'chamfer'],
    content: {
      en: [
        'Expense claim',
        [
          ['① Submit', [['Fill in the form'], ['Attach receipts']]],
          ['② Manager review', [['Approved?', [['Yes → payment'], ['No → revise and resubmit']], 'diamond']]],
          ['③ Payment'],
          ['④ Archive'],
        ],
      ],
      'zh-CN': [
        '报销流程',
        [
          ['① 提交申请', [['填写报销单'], ['附上发票']]],
          ['② 主管审批', [['是否通过？', [['通过 → 进入打款'], ['退回 → 修改后重新提交']], 'diamond']]],
          ['③ 财务打款'],
          ['④ 归档备查'],
        ],
      ],
    },
  },
]

function build([topic, children, shape]: Outline, depth: number, levels: MapTemplate['levels']): MapNode {
  const node = createNode(topic, children?.map((child) => build(child, depth + 1, levels)))
  const levelShape = shape ?? levels?.[depth]
  if (levelShape) node.shape = levelShape
  return node
}

/** Creates a fresh map (new ids) from a template in the given language. */
export function createMapFromTemplate(template: MapTemplate, language: Language): MindMap {
  const map: MindMap = { nodeData: build(template.content[language], 0, template.levels), direction: template.direction }
  const theme = template.theme ? findPreset(template.theme) : undefined
  if (theme) map.theme = structuredClone(theme)
  return map
}

/**
 * Gives a map (e.g. built from the user's pasted outline) a template's look:
 * its color scheme, layout and topic shapes by depth. Topics that already
 * have a shape keep it.
 */
export function applyTemplateLook(map: MindMap, template: MapTemplate): MindMap {
  const result = structuredClone(map)
  result.direction = template.direction
  const theme = template.theme ? findPreset(template.theme) : undefined
  if (theme) result.theme = structuredClone(theme)
  else delete result.theme
  const stack: Array<{ node: MapNode; depth: number }> = [{ node: result.nodeData, depth: 0 }]
  while (stack.length) {
    const { node, depth } = stack.pop()!
    const shape = template.levels?.[depth]
    if (shape && !node.shape) node.shape = shape
    for (const child of node.children ?? []) stack.push({ node: child, depth: depth + 1 })
  }
  return result
}

/** The template's structure as a Markdown outline (for AI prompts or copying). */
export function templateOutline(template: MapTemplate, language: Language): string {
  return exportMarkdown(createMapFromTemplate(template, language))
}

/** Shapes a template uses, in order of depth, without repeats. */
export function templateShapes(template: MapTemplate): NodeShape[] {
  const found = new Set<NodeShape>()
  const walk = ([, children, shape]: Outline, depth: number) => {
    const s = shape ?? template.levels?.[depth]
    if (s) found.add(s)
    children?.forEach((child) => walk(child, depth + 1))
  }
  walk(template.content.en, 0)
  return [...found]
}
