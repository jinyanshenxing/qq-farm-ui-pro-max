import { helpReleaseNotes as generatedHelpReleaseNotes } from '@/generated/help-release-notes'

export type HelpArticleAudience = 'all' | 'operator' | 'admin'
export type HelpArticleFreshness = 'current' | 'recent' | 'stale'
export type HelpArticleMustReadRole = 'all' | 'operator' | 'admin'
export type HelpArticleGovernanceStatus = 'aligned' | 'watching' | 'queued' | 'needs_update'

export interface HelpArticleRouteLink {
  label: string
  to: string
}

export interface HelpArticleOutlineItem {
  id: string
  text: string
  level: number
}

export interface HelpArticleTimelineItem {
  date: string
  version?: string
  title: string
  detail: string
}

export interface HelpArticleMustReadProfile {
  role: HelpArticleMustReadRole
  reason: string
}

export interface HelpArticleGovernanceProfile {
  trackingKey: string
  owner: string
  ownerTeam: string
  lastReviewedAt: string
  lastReviewedBy: string
  status: HelpArticleGovernanceStatus
  nextAction: string
}

export interface HelpArticle {
  id: string
  category: string
  title: string
  icon: string
  summary: string
  markdown?: string
  plainText?: string
  outline?: HelpArticleOutlineItem[]
  searchText?: string
  metadataSearchText: string
  tags: string[]
  updatedAt: string
  version: string
  author: string
  reviewStatus: 'draft' | 'published' | 'archived'
  audience: HelpArticleAudience
  freshness: HelpArticleFreshness
  timeline: HelpArticleTimelineItem[]
  mustReadProfiles: HelpArticleMustReadProfile[]
  governance: HelpArticleGovernanceProfile
  relatedRoutes: HelpArticleRouteLink[]
}

export interface HelpArticleContent {
  markdown: string
  plainText: string
  outline: HelpArticleOutlineItem[]
  searchText: string
}

export type ResolvedHelpArticle = HelpArticle & HelpArticleContent

export interface HelpCategory {
  name: string
  icon: string
  description: string
  color: string
}

export interface HelpReleaseNote {
  version: string
  date: string
  title: string
  summary: string
}

const CURRENT_HELP_VERSION = 'v4.5.29'
const CURRENT_HELP_UPDATED_AT = '2026-03-24'
const helpMarkdownModules = import.meta.glob('../content/help-center/*.md', { import: 'default', query: '?raw' }) as Record<string, () => Promise<string>>
const helpArticleContentCache = new Map<string, HelpArticleContent>()

const helpArticleCategoryTimelineMap: Record<string, HelpArticleTimelineItem[]> = {
  快速开始: [
    {
      date: '2026-03-16',
      version: 'v4.5.21',
      title: '设置与主界面结构继续收口',
      detail: '设置页风险说明、账号页筛选与仪表盘布局继续统一，帮助文档入口也需要跟着更新。',
    },
    {
      date: '2026-03-07',
      version: 'v4.5.0',
      title: '导航体系不再是早期单页结构',
      detail: '公告、后台和社交相关页面已经独立成模块，旧版上手口径需要整体重写。',
    },
  ],
  核心功能: [
    {
      date: '2026-03-07',
      version: 'v4.5.0',
      title: '社交策略与过滤口径继续调整',
      detail: '偷菜过滤、微信兼容链路和社交动作边界不再适合沿用早期的笼统说明。',
    },
    {
      date: '2026-03-05',
      version: 'v4.2.0',
      title: '图鉴、监控与好友分析进入主线',
      detail: '图鉴推荐、好友雷达和农场工具逐渐从附属功能变成核心页面。',
    },
  ],
  配置中心: [
    {
      date: '2026-03-16',
      version: 'v4.5.21',
      title: '高风险说明与确认流程统一',
      detail: 'QQ 风险窗口、自动回退和保存前确认文案统一进入设置主线。',
    },
    {
      date: '2026-03-04',
      version: 'v4.1.0',
      title: '设置面板从零散开关演进为分层配置中心',
      detail: '防封时间中枢、账号模式和策略项逐步收口到更明确的分类里。',
    },
  ],
  账号与风控: [
    {
      date: '2026-03-16',
      version: 'v4.5.21',
      title: 'QQ 风险窗口与封禁态拦截落地',
      detail: '高风险动作不再适合长期常开，帮助中心也需要更明确提示边界。',
    },
    {
      date: '2026-03-04',
      version: 'v4.1.0',
      title: '主号 / 小号 / 风险规避模式上线',
      detail: '账号模式从经验配置变成正式能力后，相关文档需要转成稳定口径。',
    },
  ],
  管理后台: [
    {
      date: '2026-03-10',
      version: 'v4.5.18',
      title: '后台治理链路继续补强',
      detail: '用户、日志、公告和管理态持久化逐步从辅助能力变成日常运营入口。',
    },
    {
      date: '2026-03-07',
      version: 'v4.5.0',
      title: '公告中台独立成正式模块',
      detail: '帮助中心需要把后台能力按管理员视角重新讲清楚，而不是散落在设置页里。',
    },
  ],
  运维部署: [
    {
      date: '2026-03-11',
      version: 'v4.5.20',
      title: '发布资产与兼容软链继续统一',
      detail: '离线包、发布包、旧服 current 兼容和部署入口继续收口到新主线。',
    },
    {
      date: '2026-03-11',
      version: 'v4.5.19',
      title: '安装 / 更新统一入口与更新代理落地',
      detail: '部署帮助从旧脚本集合迁移到 install-or-update 和系统更新中心口径。',
    },
  ],
  故障排查: [
    {
      date: '2026-03-10',
      version: 'v4.5.18',
      title: '部署前自检与数据库修复进入标准流程',
      detail: '排障不再只靠手工猜测，部署链路开始提供标准核验与修复路径。',
    },
    {
      date: '2026-03-06',
      version: 'v4.3.0',
      title: '日志隔离与状态分级完善',
      detail: '系统日志、账号状态和连接异常都比早期更适合按顺序排查。',
    },
  ],
  版本演进: [
    {
      date: '2026-03-20',
      version: 'v4.5.25',
      title: '版本页改成自动同步索引',
      detail: '帮助中心不再手工抄写更新日志，而是直接读取精简版本索引。',
    },
    {
      date: '2026-03-16',
      version: 'v4.5.21',
      title: '近期版本变化继续快速迭代',
      detail: '需要把最影响使用方式的改动集中整理，减少继续沿用旧经验。',
    },
  ],
}

const helpArticleTimelineOverrides: Partial<Record<string, HelpArticleTimelineItem[]>> = {
  'quick-start': [
    {
      date: '2026-03-20',
      version: 'v4.5.25',
      title: '按当前面板重写最小可用路径',
      detail: '首次使用的操作顺序改成账号、设置、概览三段式，避免继续沿用早期引导。',
    },
  ],
  'workflow-and-steal': [
    {
      date: '2026-03-07',
      version: 'v4.5.0',
      title: '偷菜过滤与社交策略继续拆分',
      detail: '流程编排和偷菜设置不再被当成同一类开关，需要分别说明职责边界。',
    },
  ],
  'account-modes-and-risk': [
    {
      date: '2026-03-16',
      version: 'v4.5.21',
      title: 'QQ 高风险临时窗口进入主线',
      detail: '高风险自动化受临时窗口控制，到期自动回退，文档需要同步风险边界。',
    },
  ],
  'admin-console': [
    {
      date: '2026-03-07',
      version: 'v4.5.0',
      title: '公告系统升级为独立后台',
      detail: '公告、日志、用户和卡密的使用方式逐步转成真正的中后台协作模式。',
    },
  ],
  'deployment-update-and-recovery': [
    {
      date: '2026-03-11',
      version: 'v4.5.20',
      title: '发布链路进一步归一',
      detail: '本地 Release、Docker 推送和旧服兼容脚本继续围绕新主线调整。',
    },
  ],
  'system-update-center': [
    {
      date: '2026-03-11',
      version: 'v4.5.19',
      title: '系统更新中心与宿主机代理落地',
      detail: '概览、任务、节点和排空逻辑第一次形成完整的更新中台闭环。',
    },
  ],
  'troubleshooting': [
    {
      date: '2026-03-16',
      version: 'v4.5.21',
      title: '新增 QQ 风险窗口与好友链路排查口径',
      detail: '当前版本排障已经需要区分账号风险窗口、封禁态和保守单链路行为。',
    },
  ],
  'release-highlights': [
    {
      date: '2026-03-20',
      version: 'v4.5.25',
      title: '版本索引改为构建前自动同步',
      detail: '帮助中心版本页开始直接消费精简版更新索引，减少维护遗漏和包体浪费。',
    },
  ],
}

const helpArticleMustReadMap: Partial<Record<string, HelpArticleMustReadProfile[]>> = {
  'quick-start': [
    { role: 'all', reason: '第一次进入当前版本面板时，先用这篇建立最小可用路径。' },
  ],
  'settings-overview': [
    { role: 'all', reason: '后续所有配置都会回到这六大分类，先看这一篇最省时间。' },
  ],
  'account-modes-and-risk': [
    { role: 'all', reason: '账号能不能稳定长期运行，核心取决于这里的模式与风控边界。' },
  ],
  'workflow-and-steal': [
    { role: 'operator', reason: '高频动作和社交策略的误配成本最高，建议优先掌握。' },
  ],
  'notifications-and-reports': [
    { role: 'operator', reason: '把提醒和经营汇报先配好，很多问题能比人工巡检更早发现。' },
  ],
  troubleshooting: [
    { role: 'all', reason: '出现异常时，先按标准排障顺序走，能明显减少误判。' },
  ],
  'admin-console': [
    { role: 'admin', reason: '管理员日常最常用的公告、日志、用户和卡密能力都在这里。' },
  ],
  'ownership-and-permissions': [
    { role: 'admin', reason: '多管理员协作前先厘清权限边界，能减少误操作和越权。' },
  ],
  'deployment-update-and-recovery': [
    { role: 'admin', reason: '上线、修复和回滚都离不开这篇，是运维必读主文档。' },
  ],
  'system-update-center': [
    { role: 'admin', reason: '当前版本的节点更新、排空和任务编排都围绕这条主线展开。' },
  ],
  'release-highlights': [
    { role: 'all', reason: '先看近期变化，再决定哪些旧经验还可以继续沿用。' },
  ],
}

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => {
      const lines = block.split('\n')
      return lines.slice(1, -1).join('\n')
    })
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 $2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/~{2}([^~]+)~{2}/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00+08:00`)
}

function diffDaysFromToday(value: string) {
  const now = new Date()
  const target = parseDateOnly(value)
  const diff = now.getTime() - target.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function getHelpFreshness(updatedAt: string, version: string): HelpArticleFreshness {
  const ageDays = diffDaysFromToday(updatedAt)
  if (version === CURRENT_HELP_VERSION && ageDays <= 21)
    return 'current'
  if (ageDays <= 60)
    return 'recent'
  return 'stale'
}

function normalizeHeadingText(text: string) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function slugifyHeading(text: string) {
  const normalized = normalizeHeadingText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'section'
}

export function createHelpAnchorId(text: string) {
  return slugifyHeading(text)
}

function extractOutline(markdown: string) {
  const used = new Map<string, number>()
  const lines = markdown.split('\n')
  const outline: HelpArticleOutlineItem[] = []

  for (const line of lines) {
    const match = line.match(/^(##|###|####)\s+(.+)$/)
    if (!match)
      continue

    const [, headingHashes = '', headingText = ''] = match
    const level = headingHashes.length
    const text = normalizeHeadingText(headingText)
    const baseId = slugifyHeading(text)
    const count = (used.get(baseId) || 0) + 1
    used.set(baseId, count)
    outline.push({
      id: count > 1 ? `${baseId}-${count}` : baseId,
      text,
      level,
    })
  }

  return outline
}

function buildReleaseHighlightsMarkdown(introMarkdown: string, releaseNotes: HelpReleaseNote[]) {
  const sections = releaseNotes
    .slice(0, 8)
    .map((releaseNote) => {
      return [
        `## ${releaseNote.version} (${releaseNote.date})`,
        '',
        `### ${releaseNote.title}`,
        '',
        `- ${releaseNote.summary}`,
      ].join('\n')
    })
    .join('\n\n')

  return [
    introMarkdown.trim(),
    '',
    '## 自动同步的版本索引',
    '',
    '以下版本条目直接读取仓库根目录 `CHANGELOG.md` 的精简索引生成，后续发布时只要更新日志继续维护，这一页就会跟着同步。',
    '',
    sections,
  ].join('\n')
}

function buildMetadataSearchText(input: {
  title: string
  summary: string
  category: string
  tags: string[]
  audience: HelpArticleAudience
  relatedRoutes: HelpArticleRouteLink[]
}) {
  return [
    input.title,
    input.summary,
    input.category,
    input.tags.join(' '),
    input.audience,
    input.relatedRoutes.map(route => `${route.label} ${route.to}`).join(' '),
  ].join('\n').toLowerCase()
}

function buildSearchText(input: {
  title: string
  summary: string
  category: string
  tags: string[]
  audience: HelpArticleAudience
  markdown: string
  relatedRoutes: HelpArticleRouteLink[]
}) {
  return [
    buildMetadataSearchText(input),
    stripMarkdown(input.markdown),
  ].join('\n').toLowerCase()
}

function buildArticleTimeline(input: Pick<HelpArticle, 'id' | 'title' | 'category' | 'updatedAt' | 'version'>) {
  const migrationEntry: HelpArticleTimelineItem = {
    date: input.updatedAt,
    version: input.version,
    title: '帮助中心完成当前版本对齐',
    detail: `围绕 ${input.title} 补齐当前版本的界面、配置和运维口径。`,
  }

  const timeline = [
    migrationEntry,
    ...(helpArticleTimelineOverrides[input.id] || []),
    ...(helpArticleCategoryTimelineMap[input.category] || []),
  ]

  const used = new Set<string>()
  return timeline
    .filter((item) => {
      const key = `${item.date}-${item.version || ''}-${item.title}`
      if (used.has(key))
        return false
      used.add(key)
      return true
    })
    .sort((a, b) => b.date.localeCompare(a.date) || (b.version || '').localeCompare(a.version || ''))
    .slice(0, 4)
}

function buildGovernanceTrackingKey(articleId: string) {
  return `HC-${articleId.replace(/[^a-z0-9]+/gi, '-').toUpperCase()}`
}

function buildGovernanceOwner(articleCategory: string) {
  if (['运维部署', '故障排查'].includes(articleCategory)) {
    return {
      owner: '部署与运维文档负责人',
      ownerTeam: '部署与运维文档组',
      lastReviewedBy: '运维发布值守',
    }
  }

  if (articleCategory === '管理后台') {
    return {
      owner: '后台治理文档负责人',
      ownerTeam: '后台治理文档组',
      lastReviewedBy: '后台治理维护人',
    }
  }

  if (articleCategory === '版本演进') {
    return {
      owner: '版本发布文档负责人',
      ownerTeam: '版本发布联动组',
      lastReviewedBy: '版本发布值守',
    }
  }

  return {
    owner: '产品与运营文档负责人',
    ownerTeam: '产品与运营文档组',
    lastReviewedBy: '帮助中心维护组',
  }
}

function buildGovernanceStatus(input: Pick<HelpArticle, 'id' | 'category' | 'freshness'>): HelpArticleGovernanceStatus {
  if (input.freshness === 'stale')
    return 'needs_update'

  if (['release-highlights', 'system-update-center', 'deployment-update-and-recovery', 'troubleshooting'].includes(input.id))
    return 'watching'

  if (input.freshness === 'recent')
    return 'queued'

  return 'aligned'
}

function buildGovernanceNextAction(status: HelpArticleGovernanceStatus, category: string) {
  if (status === 'needs_update')
    return '优先复核真实页面、命令链路和跳转入口，并补正文。'
  if (status === 'queued')
    return '在下一次版本发布前完成例行复核。'
  if (status === 'watching')
    return category === '版本演进'
      ? '跟随最近一次 CHANGELOG 与公告同步复核。'
      : '持续观察版本变动，并在高频变化后回看命令和界面。'
  return '随版本迭代复核关键截图、命令和关联入口。'
}

function buildGovernanceProfile(input: Pick<HelpArticle, 'id' | 'category' | 'updatedAt' | 'freshness'>): HelpArticleGovernanceProfile {
  const owner = buildGovernanceOwner(input.category)
  const status = buildGovernanceStatus(input)

  return {
    trackingKey: buildGovernanceTrackingKey(input.id),
    owner: owner.owner,
    ownerTeam: owner.ownerTeam,
    lastReviewedAt: input.updatedAt,
    lastReviewedBy: owner.lastReviewedBy,
    status,
    nextAction: buildGovernanceNextAction(status, input.category),
  }
}

function createArticle(input: Omit<HelpArticle, 'freshness' | 'timeline' | 'mustReadProfiles' | 'governance' | 'metadataSearchText' | 'markdown' | 'plainText' | 'outline' | 'searchText'>): HelpArticle {
  const freshness = getHelpFreshness(input.updatedAt, input.version)

  return {
    ...input,
    freshness,
    timeline: buildArticleTimeline(input),
    mustReadProfiles: helpArticleMustReadMap[input.id] || [],
    governance: buildGovernanceProfile({
      id: input.id,
      category: input.category,
      updatedAt: input.updatedAt,
      freshness,
    }),
    metadataSearchText: buildMetadataSearchText({
      title: input.title,
      summary: input.summary,
      category: input.category,
      tags: input.tags,
      audience: input.audience,
      relatedRoutes: input.relatedRoutes,
    }),
  }
}

function getHelpArticleMarkdownPath(articleId: string) {
  return `../content/help-center/${articleId}.md`
}

function buildResolvedHelpArticle(article: HelpArticle, markdown: string): ResolvedHelpArticle {
  const normalizedMarkdown = article.id === 'release-highlights'
    ? buildReleaseHighlightsMarkdown(markdown, helpReleaseNotes)
    : markdown

  const plainText = stripMarkdown(normalizedMarkdown)
  const outline = extractOutline(normalizedMarkdown)

  return {
    ...article,
    markdown: normalizedMarkdown,
    plainText,
    outline,
    searchText: buildSearchText({
      title: article.title,
      summary: article.summary,
      category: article.category,
      tags: article.tags,
      audience: article.audience,
      markdown: normalizedMarkdown,
      relatedRoutes: article.relatedRoutes,
    }),
  }
}

export const helpReleaseNotes: HelpReleaseNote[] = [...generatedHelpReleaseNotes]

const latestReleaseNote = helpReleaseNotes[0] || null

export const helpReleaseSyncStatus = latestReleaseNote?.version === CURRENT_HELP_VERSION
  ? {
      tone: 'success',
      title: `更新日志已同步到 ${CURRENT_HELP_VERSION}`,
      detail: `最近版本说明和帮助中心当前口径一致，最后对齐日期 ${latestReleaseNote?.date || CURRENT_HELP_UPDATED_AT}。`,
    }
  : {
      tone: 'warning',
      title: `帮助中心覆盖 ${CURRENT_HELP_VERSION}`,
      detail: latestReleaseNote
        ? `当前仓库 CHANGELOG 最近记录到 ${latestReleaseNote.version}（${latestReleaseNote.date}），帮助中心已经先按 ${CURRENT_HELP_VERSION} 的界面和功能补齐。`
        : `当前仓库还没有解析到最新版本索引，帮助中心暂按 ${CURRENT_HELP_VERSION} 维护。`,
    }

export const helpCategories: HelpCategory[] = [
  {
    name: '快速开始',
    icon: 'i-carbon-rocket',
    description: '先认页面，再完成最小可用配置',
    color: 'emerald',
  },
  {
    name: '核心功能',
    icon: 'i-carbon-apps',
    description: '农场工具、图鉴、偷菜与流程编排',
    color: 'sky',
  },
  {
    name: '配置中心',
    icon: 'i-carbon-settings-adjust',
    description: '设置分类、自动化、通知和高级配置',
    color: 'amber',
  },
  {
    name: '账号与风控',
    icon: 'i-carbon-security',
    description: '账号模式、运行态、QQ 风险守卫',
    color: 'rose',
  },
  {
    name: '管理后台',
    icon: 'i-carbon-rule',
    description: '公告、日志、用户、卡密与归属治理',
    color: 'violet',
  },
  {
    name: '运维部署',
    icon: 'i-carbon-terminal',
    description: '安装、更新、修复与宿主机更新代理',
    color: 'orange',
  },
  {
    name: '故障排查',
    icon: 'i-carbon-warning-alt',
    description: '功能异常、部署问题与常用检查命令',
    color: 'red',
  },
  {
    name: '版本演进',
    icon: 'i-carbon-change-catalog',
    description: '近期版本重点更新与使用口径变化',
    color: 'teal',
  },
]

export function buildHelpRoute(input: {
  article: string
  audience?: HelpArticleAudience | 'recommended'
  section?: string
}) {
  const params = new URLSearchParams()
  params.set('article', input.article)
  params.set('audience', input.audience || 'recommended')
  if (input.section)
    params.set('section', input.section)
  return `/help?${params.toString()}`
}

function buildSettingsRoute(input: {
  category: 'common' | 'plant' | 'auto' | 'notice' | 'security' | 'advanced'
  advancedSection?: 'health' | 'timing' | 'update' | 'cluster' | 'theme' | 'trial' | 'api'
  updateTab?: 'overview' | 'jobs' | 'nodes'
  anchorId?: string
}) {
  const params = new URLSearchParams()
  params.set('category', input.category)
  if (input.advancedSection)
    params.set('advancedSection', input.advancedSection)
  if (input.updateTab)
    params.set('updateTab', input.updateTab)
  const query = params.toString()
  const hash = input.anchorId ? `#${input.anchorId}` : ''
  return `/settings${query ? `?${query}` : ''}${hash}`
}

export const helpArticles: HelpArticle[] = [
  createArticle({
    id: 'quick-start',
    category: '快速开始',
    title: '快速上手',
    icon: 'i-carbon-rocket',
    summary: '为第一次使用当前版本面板的用户准备的最小可用操作路径。',
    tags: ['上手', '入门', '首次使用', '账号', '设置'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'all',
    relatedRoutes: [
      { label: '账号', to: '/accounts' },
      { label: '设置 · 常用设置', to: buildSettingsRoute({ category: 'common', anchorId: 'settings-category-common' }) },
      { label: '概览', to: '/' },
    ],
  }),
  createArticle({
    id: 'workspace-overview',
    category: '快速开始',
    title: '面板与页面导航',
    icon: 'i-carbon-compass',
    summary: '按当前工作区结构梳理所有主要页面，帮助你快速找到正确入口。',
    tags: ['导航', '页面', '概览', '后台', '路由'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'all',
    relatedRoutes: [
      { label: '概览', to: '/' },
      { label: '总览', to: '/overview' },
      { label: '农场预览', to: '/personal' },
      { label: '好友', to: '/friends' },
    ],
  }),
  createArticle({
    id: 'farm-tools-and-atlas',
    category: '核心功能',
    title: '农场工具与图鉴',
    icon: 'i-carbon-catalog',
    summary: '解释作物图鉴与农场工具的职责边界，以及什么时候该用哪一类页面。',
    tags: ['作物图鉴', '农场工具', '计算器', '资料', '分析'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'all',
    relatedRoutes: [
      { label: '作物图鉴', to: '/analytics' },
      { label: '农场工具', to: '/farm-tools' },
    ],
  }),
  createArticle({
    id: 'workflow-and-steal',
    category: '核心功能',
    title: '策略流程与偷菜设置',
    icon: 'i-carbon-flow-stream',
    summary: '把流程编排和偷菜设置放回各自职责范围，避免把策略问题混成一个开关问题。',
    tags: ['流程编排', '偷菜设置', '好友互动', '白名单', '黑名单'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'operator',
    relatedRoutes: [
      { label: '策略流程', to: '/workflow' },
      { label: '偷菜设置', to: '/steal-settings' },
      { label: '好友', to: '/friends' },
    ],
  }),
  createArticle({
    id: 'settings-overview',
    category: '配置中心',
    title: '设置页总览',
    icon: 'i-carbon-settings',
    summary: '总览当前版本设置页的六大分类，明确每个分类解决什么问题。',
    tags: ['设置', '分类', '常用设置', '高级设置', '账号与安全'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'all',
    relatedRoutes: [
      { label: '设置 · 常用设置', to: buildSettingsRoute({ category: 'common', anchorId: 'settings-category-common' }) },
      { label: '设置 · 高级设置', to: buildSettingsRoute({ category: 'advanced', anchorId: 'settings-category-advanced' }) },
    ],
  }),
  createArticle({
    id: 'planting-and-automation',
    category: '配置中心',
    title: '种植与自动化',
    icon: 'i-carbon-ibm-automation',
    summary: '聚焦选种、巡查、收获延迟、自动任务和社交动作的整体配置思路。',
    tags: ['自动化', '种植', '巡查', '收获延迟', '好友互动'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'operator',
    relatedRoutes: [
      { label: '设置 · 种植策略', to: buildSettingsRoute({ category: 'plant', anchorId: 'settings-category-plant' }) },
      { label: '设置 · 自动任务', to: buildSettingsRoute({ category: 'auto', anchorId: 'settings-category-auto' }) },
      { label: '作物图鉴', to: '/analytics' },
    ],
  }),
  createArticle({
    id: 'notifications-and-reports',
    category: '配置中心',
    title: '通知提醒与经营汇报',
    icon: 'i-carbon-notification',
    summary: '说明系统级下线提醒与账号级经营汇报的职责区别和配置方式。',
    tags: ['通知', '经营汇报', 'Webhook', 'Bark', '下线提醒'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'all',
    relatedRoutes: [
      { label: '设置 · 通知提醒', to: buildSettingsRoute({ category: 'notice', anchorId: 'settings-category-notice' }) },
    ],
  }),
  createArticle({
    id: 'advanced-settings',
    category: '配置中心',
    title: '高级设置',
    icon: 'i-carbon-settings-adjust',
    summary: '面向管理员梳理系统体检、时间参数、集群、主题、体验卡和第三方 API。',
    tags: ['高级设置', '系统体检', '主题', 'API', '体验卡', '集群'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'admin',
    relatedRoutes: [
      { label: '高级设置 · 系统体检', to: buildSettingsRoute({ category: 'advanced', advancedSection: 'health', anchorId: 'settings-advanced-health' }) },
      { label: '高级设置 · 主题外观', to: buildSettingsRoute({ category: 'advanced', advancedSection: 'theme', anchorId: 'settings-advanced-theme' }) },
      { label: '高级设置 · 第三方 API', to: buildSettingsRoute({ category: 'advanced', advancedSection: 'api', anchorId: 'settings-advanced-api' }) },
    ],
  }),
  createArticle({
    id: 'account-modes-and-risk',
    category: '账号与风控',
    title: '账号模式与 QQ 风控守卫',
    icon: 'i-carbon-security',
    summary: '解释主号、小号、风险规避模式，以及 QQ 高风险临时窗口和自动回退机制。',
    tags: ['主号', '小号', '风险规避', 'QQ 风控', '临时窗口'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'all',
    relatedRoutes: [
      { label: '设置 · 账号与安全', to: buildSettingsRoute({ category: 'security', anchorId: 'settings-category-security' }) },
      { label: '账号', to: '/accounts' },
      { label: '系统日志', to: '/system-logs' },
    ],
  }),
  createArticle({
    id: 'accounts-runtime',
    category: '账号与风控',
    title: '账号运行管理',
    icon: 'i-carbon-user-settings',
    summary: '围绕多账号列表、运行状态、批量动作和归属筛选解释账号页的使用方式。',
    tags: ['账号', '运行管理', '批量操作', '状态', '筛选'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'operator',
    relatedRoutes: [
      { label: '账号', to: '/accounts' },
      { label: '概览', to: '/' },
    ],
  }),
  createArticle({
    id: 'admin-console',
    category: '管理后台',
    title: '公告、日志、用户与卡密',
    icon: 'i-carbon-rule',
    summary: '集中说明管理员后台中最常用的四块：公告管理、日志、用户和卡密。',
    tags: ['公告', '系统日志', '操作日志', '用户', '卡密'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'admin',
    relatedRoutes: [
      { label: '公告管理', to: '/announcements' },
      { label: '系统日志', to: '/system-logs' },
      { label: '操作日志', to: '/admin-operation-logs' },
      { label: '用户', to: '/users' },
      { label: '卡密', to: '/cards' },
    ],
  }),
  createArticle({
    id: 'ownership-and-permissions',
    category: '管理后台',
    title: '账号归属与权限边界',
    icon: 'i-carbon-user-role',
    summary: '说明多管理员和多用户场景下，账号归属为什么是避免越权和误操作的关键。',
    tags: ['账号归属', '权限', '管理员', '用户', '分配'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'admin',
    relatedRoutes: [
      { label: '账号归属', to: '/account-ownership' },
      { label: '用户', to: '/users' },
      { label: '账号', to: '/accounts' },
    ],
  }),
  createArticle({
    id: 'deployment-installation',
    category: '运维部署',
    title: '安装与首启',
    icon: 'i-carbon-cloud-service-management',
    summary: '基于当前统一部署脚本体系，说明在线首装、离线首装和首启验证方法。',
    tags: ['部署', '安装', 'Docker', 'install-or-update', '首启'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'admin',
    relatedRoutes: [
      { label: '高级设置 · 系统更新', to: buildSettingsRoute({ category: 'advanced', advancedSection: 'update', updateTab: 'overview', anchorId: 'settings-update-overview' }) },
    ],
  }),
  createArticle({
    id: 'deployment-update-and-recovery',
    category: '运维部署',
    title: '更新、修复与回滚',
    icon: 'i-carbon-upgrade',
    summary: '围绕 update、repair、safe-update 和旧环境兼容脚本梳理标准升级路径。',
    tags: ['更新', '修复', '回滚', 'safe-update', 'repair-deploy', 'farm-bot.sh'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'admin',
    relatedRoutes: [
      { label: '高级设置 · 系统更新', to: buildSettingsRoute({ category: 'advanced', advancedSection: 'update', updateTab: 'overview', anchorId: 'settings-update-overview' }) },
      { label: '系统日志', to: '/system-logs' },
    ],
  }),
  createArticle({
    id: 'system-update-center',
    category: '运维部署',
    title: '系统更新中心与集群更新',
    icon: 'i-carbon-network-4',
    summary: '解释系统更新中心的总览、任务、节点与更新代理如何配合工作。',
    tags: ['系统更新', '更新中心', '集群', '排空', 'update-agent'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'admin',
    relatedRoutes: [
      { label: '更新中心 · 总览配置', to: buildSettingsRoute({ category: 'advanced', advancedSection: 'update', updateTab: 'overview', anchorId: 'settings-update-overview' }) },
      { label: '更新中心 · 任务执行', to: buildSettingsRoute({ category: 'advanced', advancedSection: 'update', updateTab: 'jobs', anchorId: 'settings-update-jobs' }) },
      { label: '更新中心 · 节点状态', to: buildSettingsRoute({ category: 'advanced', advancedSection: 'update', updateTab: 'nodes', anchorId: 'settings-update-nodes' }) },
      { label: '系统日志', to: '/system-logs' },
    ],
  }),
  createArticle({
    id: 'troubleshooting',
    category: '故障排查',
    title: '故障排查',
    icon: 'i-carbon-warning-square',
    summary: '从账号状态、概览、系统日志到部署命令，给出当前版本的排障顺序。',
    tags: ['排查', '日志', '好友为空', '部署', '构建'],
    updatedAt: '2026-03-20',
    version: 'v4.5.25',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'all',
    relatedRoutes: [
      { label: '概览', to: '/' },
      { label: '账号', to: '/accounts' },
      { label: '系统日志', to: '/system-logs' },
      { label: '设置 · 系统体检', to: buildSettingsRoute({ category: 'advanced', advancedSection: 'health', anchorId: 'settings-advanced-health' }) },
    ],
  }),
  createArticle({
    id: 'release-highlights',
    category: '版本演进',
    title: '近期版本重点更新',
    icon: 'i-carbon-change-catalog',
    summary: '把最近几次版本演进中最影响使用方式的变化整理成一页说明。',
    tags: ['更新日志', '版本', 'v4.5.21', 'v4.5.20', '演进'],
    updatedAt: CURRENT_HELP_UPDATED_AT,
    version: CURRENT_HELP_VERSION,
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
    audience: 'all',
    relatedRoutes: [
      { label: '帮助中心', to: '/help' },
      { label: '公告管理', to: '/announcements' },
      { label: '设置', to: '/settings' },
    ],
  }),
]

export async function loadHelpArticleContent(articleId: string): Promise<HelpArticleContent | null> {
  const cached = helpArticleContentCache.get(articleId)
  if (cached)
    return cached

  const article = helpArticles.find(item => item.id === articleId)
  if (!article)
    return null

  const loader = helpMarkdownModules[getHelpArticleMarkdownPath(articleId)]
  if (!loader)
    return null

  const markdown = await loader()
  const resolvedArticle = buildResolvedHelpArticle(article, markdown)
  const content: HelpArticleContent = {
    markdown: resolvedArticle.markdown,
    plainText: resolvedArticle.plainText,
    outline: resolvedArticle.outline,
    searchText: resolvedArticle.searchText,
  }
  helpArticleContentCache.set(articleId, content)
  return content
}

export async function resolveHelpArticle(articleOrId: HelpArticle | string): Promise<ResolvedHelpArticle | null> {
  const article = typeof articleOrId === 'string'
    ? helpArticles.find(item => item.id === articleOrId) || null
    : articleOrId

  if (!article)
    return null

  const content = await loadHelpArticleContent(article.id)
  if (!content)
    return null

  return {
    ...article,
    ...content,
  }
}

export async function loadHelpSearchIndex(articleIds?: string[]): Promise<ResolvedHelpArticle[]> {
  const targets = articleIds?.length
    ? helpArticles.filter(article => articleIds.includes(article.id))
    : helpArticles

  const resolved = await Promise.all(targets.map(article => resolveHelpArticle(article)))
  return resolved.filter((article): article is ResolvedHelpArticle => !!article)
}

export const developmentProgress = {
  totalArticles: helpArticles.length,
  completedArticles: helpArticles.filter(article => article.reviewStatus === 'published').length,
  draftArticles: helpArticles.filter(article => article.reviewStatus === 'draft').length,
  lastUpdated: CURRENT_HELP_UPDATED_AT,
  nextUpdate: '随版本发布持续维护',
  version: CURRENT_HELP_VERSION,
  progress: 100,
  changelog: [
    {
      version: CURRENT_HELP_VERSION,
      date: CURRENT_HELP_UPDATED_AT,
      changes: [
        '帮助中心增加角色筛选、文档时效标记与版本联动',
        '版本演进页改为直接读取仓库根目录 CHANGELOG 快速索引',
        '文档口径继续对齐当前面板与部署链路',
      ],
    },
    ...helpReleaseNotes.slice(0, 3).map(releaseNote => ({
      version: releaseNote.version,
      date: releaseNote.date,
      changes: [
        releaseNote.title,
        releaseNote.summary,
      ],
    })),
  ],
}

export function getHelpAudienceLabel(audience: HelpArticleAudience) {
  if (audience === 'admin')
    return '管理员'
  if (audience === 'operator')
    return '运营 / 多账号用户'
  return '全部用户'
}

export function getHelpFreshnessLabel(article: Pick<HelpArticle, 'freshness' | 'updatedAt' | 'version'>) {
  const ageDays = diffDaysFromToday(article.updatedAt)
  if (article.freshness === 'current')
    return ageDays === 0 ? '今天已同步' : `${ageDays} 天前同步`
  if (article.freshness === 'recent')
    return ageDays <= 30 ? `近 ${ageDays || 1} 天校验` : '近期已校验'
  return article.version === CURRENT_HELP_VERSION ? '待复核' : '旧版口径'
}

export function getHelpFreshnessTone(article: Pick<HelpArticle, 'freshness'>) {
  if (article.freshness === 'current')
    return 'success'
  if (article.freshness === 'recent')
    return 'info'
  return 'warning'
}

export function getHelpGovernanceStatusLabel(status: HelpArticleGovernanceStatus) {
  if (status === 'aligned')
    return '已对齐'
  if (status === 'watching')
    return '持续观察'
  if (status === 'queued')
    return '待例行复核'
  return '待修订'
}

export function getHelpGovernanceStatusTone(status: HelpArticleGovernanceStatus) {
  if (status === 'aligned')
    return 'success'
  if (status === 'watching')
    return 'info'
  return 'warning'
}
