<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import BaseFilterChip from '@/components/ui/BaseFilterChip.vue'
import BaseFilterChips from '@/components/ui/BaseFilterChips.vue'
import { useViewPreferenceSync } from '@/composables/use-view-preference-sync'
import { useAccountStore } from '@/stores/account'
import { buildFriendGuardCopy, formatFriendFetchReasonLabel, formatFriendGuardResultLabel } from '@/utils/friend-fetch-status'
import { localizeRuntimeText } from '@/utils/runtime-text'
import { DEFAULT_SYSTEM_LOGS_VIEW_STATE, normalizeSystemLogsViewState } from '@/utils/view-preferences'

const router = useRouter()
const loading = ref(false)
const dataSource = ref<any[]>([])
const total = ref(0)
const detailModalData = ref<any>(null)
const isDetailModalOpen = ref(false)
const route = useRoute()
const accountStore = useAccountStore()

const pagination = reactive({
  current: 1,
  pageSize: 20,
})

const queryParams = reactive({
  level: '',
  accountId: '',
  keyword: '',
})
const SYSTEM_LOGS_SESSION_PREF_NOTE = '这里的筛选条件和分页页码会跟随当前登录用户同步到服务器；日志内容本身仍来自后端 MySQL 审计表。'
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pagination.pageSize)))
const hasNextPage = computed(() => pagination.current < totalPages.value)
const quickFilterChips = computed(() => ([
  { key: 'friend_manual_refresh', label: '好友手动刷新', keyword: 'friend_manual_refresh', tone: 'info' },
  { key: 'wx_friend_guard', label: '微信好友降级', keyword: 'wx_friend_fetch_guard', tone: 'warning' },
  { key: 'qq_friend_guard', label: 'QQ好友保守链路', keyword: 'qq_friend_fetch_guard', tone: 'warning' },
  { key: 'task_failures', label: '任务失败', keyword: '调度失败', tone: 'danger' },
  { key: 'qq_risk_auto_disable', label: 'QQ高风险自动关闭', keyword: 'qq_high_risk_auto_disabled', tone: 'danger' },
]))
const FRIEND_LOG_ROUTE_KEYWORDS = [
  'friend_manual_refresh',
  'wx_friend_fetch_guard',
  'qq_friend_fetch_guard',
  'friend_cache_reuse',
  'friend_cache_seed',
]

const friendPageShortcut = computed(() => {
  const keyword = String(queryParams.keyword || '').trim().toLowerCase()
  const accountId = String(queryParams.accountId || '').trim()
  const isFriendScoped = FRIEND_LOG_ROUTE_KEYWORDS.some(item => keyword.includes(item)) || keyword.includes('好友')
  if (!isFriendScoped)
    return null
  return {
    label: accountId ? '返回该账号好友页' : '返回好友页',
    accountId,
  }
})

function formatDate(dateStr: string) {
  if (!dateStr)
    return '-'
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function formatLevel(level: string) {
  const value = String(level || '').trim().toLowerCase()
  if (value === 'info')
    return '信息'
  if (value === 'warn')
    return '警告'
  if (value === 'error')
    return '错误'
  return '未知'
}

function getLevelBadgeClass(level: string) {
  const value = String(level || '').trim().toLowerCase()
  if (value === 'error')
    return 'system-logs-level-badge system-logs-level-badge-danger'
  if (value === 'warn')
    return 'system-logs-level-badge system-logs-level-badge-warning'
  if (value === 'info')
    return 'system-logs-level-badge system-logs-level-badge-info'
  return 'system-logs-level-badge system-logs-level-badge-neutral'
}

async function fetchData(page = pagination.current, limit = pagination.pageSize) {
  loading.value = true
  try {
    const res = await api.get('/api/system-logs', {
      params: {
        page,
        limit,
        level: queryParams.level || undefined,
        accountId: queryParams.accountId || undefined,
        keyword: queryParams.keyword || undefined,
      },
    })

    if (res.data && res.data.ok) {
      dataSource.value = res.data.data.items
      total.value = res.data.data.total
      pagination.current = page
      pagination.pageSize = limit
    }
  }
  catch (err: any) {
    console.error('获取日志失败:', err.message)
  }
  finally {
    loading.value = false
  }
}

function buildSystemLogsViewState() {
  return normalizeSystemLogsViewState({
    level: queryParams.level,
    accountId: queryParams.accountId,
    keyword: queryParams.keyword,
    page: pagination.current,
    pageSize: pagination.pageSize,
  }, DEFAULT_SYSTEM_LOGS_VIEW_STATE)
}

const {
  hydrating: systemLogsViewHydrating,
  hydrate: hydrateSystemLogsViewState,
  enableSync: enableSystemLogsViewSync,
} = useViewPreferenceSync({
  key: 'systemLogsViewState',
  label: '系统日志页视图偏好',
  buildState: buildSystemLogsViewState,
  applyState: applySystemLogsViewState,
  defaultState: DEFAULT_SYSTEM_LOGS_VIEW_STATE,
})

function applySystemLogsViewState(state: Partial<typeof DEFAULT_SYSTEM_LOGS_VIEW_STATE> | null | undefined) {
  const normalized = normalizeSystemLogsViewState(state, DEFAULT_SYSTEM_LOGS_VIEW_STATE)
  systemLogsViewHydrating.value = true
  queryParams.level = normalized.level
  queryParams.accountId = normalized.accountId
  queryParams.keyword = normalized.keyword
  pagination.current = normalized.page
  pagination.pageSize = normalized.pageSize
  systemLogsViewHydrating.value = false
}

function prevPage() {
  if (pagination.current > 1) {
    fetchData(pagination.current - 1)
  }
}

function nextPage() {
  if (hasNextPage.value) {
    fetchData(pagination.current + 1)
  }
}

function onSearch() {
  pagination.current = 1
  fetchData()
}

function applyQuickKeywordFilter(keyword: string) {
  const normalized = String(keyword || '').trim()
  queryParams.keyword = queryParams.keyword === normalized ? '' : normalized
  onSearch()
}

function isQuickKeywordFilterActive(keyword: string) {
  return String(queryParams.keyword || '').trim() === String(keyword || '').trim()
}

function onReset() {
  queryParams.level = ''
  queryParams.accountId = ''
  queryParams.keyword = ''
  onSearch()
}

function applyRouteFilters() {
  const nextKeyword = String(route.query.keyword || '').trim()
  const nextAccountId = String(route.query.accountId || '').trim()
  const nextLevel = String(route.query.level || '').trim()
  const hasRouteFilter = !!(nextKeyword || nextAccountId || nextLevel)
  if (!hasRouteFilter)
    return false

  queryParams.keyword = nextKeyword
  queryParams.accountId = nextAccountId
  queryParams.level = nextLevel
  pagination.current = 1
  return true
}

async function openRelatedFriendPage() {
  const shortcut = friendPageShortcut.value
  if (!shortcut)
    return
  const targetAccountId = String(shortcut.accountId || '').trim()
  if (targetAccountId) {
    if (!Array.isArray(accountStore.accounts) || accountStore.accounts.length <= 0) {
      await accountStore.fetchAccounts()
    }
    const matched = accountStore.accounts.find(item => String(item?.id || '').trim() === targetAccountId)
    if (matched) {
      await accountStore.selectAccount(targetAccountId)
    }
  }
  router.push({ name: 'friends' })
}

function parseMetaData(rawMeta: any) {
  if (!rawMeta)
    return {}
  if (typeof rawMeta === 'string') {
    try {
      return JSON.parse(rawMeta)
    }
    catch {
      return {}
    }
  }
  if (typeof rawMeta === 'object')
    return rawMeta
  return {}
}

function formatSecondsLabel(seconds: number) {
  const total = Math.max(0, Number(seconds || 0))
  if (total <= 0)
    return '0 秒'
  if (total < 60)
    return `${total} 秒`
  const minutes = Math.floor(total / 60)
  const remainSeconds = total % 60
  return remainSeconds > 0 ? `${minutes} 分 ${remainSeconds} 秒` : `${minutes} 分钟`
}

function formatMinutesLabel(minutes: number) {
  const total = Math.max(0, Number(minutes || 0))
  if (total <= 0)
    return '未记录'
  if (total < 60)
    return `${total} 分钟`
  const hours = Math.floor(total / 60)
  const remainMinutes = total % 60
  return remainMinutes > 0 ? `${hours} 小时 ${remainMinutes} 分钟` : `${hours} 小时`
}

function formatTimestampLabel(value: any) {
  const time = Math.max(0, Number(value || 0))
  if (time <= 0)
    return '未记录'
  return new Date(time).toLocaleString('zh-CN', { hour12: false })
}

function extractErrorMessage(text: string) {
  const normalized = localizeRuntimeText(String(text || '').trim())
  if (!normalized)
    return '未附带错误细节'
  const separatorIndex = Math.max(normalized.lastIndexOf('：'), normalized.lastIndexOf(':'))
  return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1).trim() || normalized : normalized
}

function getTaskEventLabel(event: string) {
  const value = String(event || '').trim()
  if (value === 'farm_tick')
    return '农场调度'
  if (value === 'friend_applications_tick')
    return '好友申请调度'
  if (value === 'help_tick')
    return '好友帮忙调度'
  if (value === 'steal_tick')
    return '好友偷菜调度'
  if (value === 'daily_routine')
    return '每日任务调度'
  if (value === 'email_rewards')
    return '邮箱领取'
  return value || '任务调度'
}

function buildTaskFailureSummary(record: any, meta: any) {
  const event = String(meta?.event || '').trim()
  const result = String(meta?.result || '').trim()
  const isRuntimeFailure = ['farm_tick', 'friend_applications_tick', 'help_tick', 'steal_tick', 'daily_routine'].includes(event) && result === 'error'
  const isEmailTimeout = event === 'email_rewards' && result === 'timeout'
  if (!isRuntimeFailure && !isEmailTimeout)
    return null

  const taskLabel = getTaskEventLabel(event)
  const reason = extractErrorMessage(record?.text)
  return {
    tone: isEmailTimeout ? 'warning' : 'danger',
    title: `${taskLabel}${isEmailTimeout ? '已跳过' : '执行失败'}`,
    description: isEmailTimeout
      ? `这次 ${taskLabel} 因超时被安全跳过，主流程没有继续阻塞。`
      : `这次 ${taskLabel} 执行失败，建议优先查看错误原因并确认对应功能是否仍在自动重试。`,
    metrics: [
      { key: 'task', label: '任务', value: taskLabel },
      { key: 'result', label: '结果', value: isEmailTimeout ? '超时跳过' : '执行失败' },
      { key: 'reason', label: '原因', value: reason },
    ],
  }
}

function buildFriendCacheSummary(record: any, meta: any) {
  const event = String(meta?.event || '').trim()
  const result = String(meta?.result || '').trim()
  if (event === 'friend_cache_reuse') {
    const count = Math.max(0, Number(meta?.count || 0))
    const sourceAccountId = String(meta?.sourceAccountId || '').trim()
    if (result === 'ok') {
      return {
        tone: 'info',
        title: sourceAccountId ? '已复用其他账号的好友缓存' : '已复用共享好友缓存',
        description: sourceAccountId
          ? `当前账号缺少可用好友缓存，系统已临时复用账号 ${sourceAccountId} 的好友快照。`
          : '当前账号缺少可用好友缓存，系统已临时复用共享好友快照。',
        metrics: [
          { key: 'count', label: '快照人数', value: `${count} 人` },
          { key: 'sourceAccountId', label: '来源账号', value: sourceAccountId || '共享缓存池' },
        ],
      }
    }
    return {
      tone: 'danger',
      title: '共享好友缓存复用失败',
      description: '系统尝试从共享缓存池补底好友列表，但这次没有复用成功。',
      metrics: [
        { key: 'result', label: '结果', value: '复用失败' },
        { key: 'reason', label: '原因', value: extractErrorMessage(record?.text) },
      ],
    }
  }

  if (event === 'friend_cache_seed') {
    const visitorCount = Math.max(0, Number(meta?.visitorCount || 0))
    const cachedCount = Math.max(0, Number(meta?.cachedCount || 0))
    if (result === 'ok') {
      return {
        tone: 'info',
        title: '已从最近访客回填好友缓存',
        description: '当前账号没有现成好友缓存时，系统尝试用最近访客 GID 去补回一份可用缓存。',
        metrics: [
          { key: 'visitorCount', label: '访客 GID', value: `${visitorCount} 个` },
          { key: 'cachedCount', label: '回填好友', value: `${cachedCount} 人` },
        ],
      }
    }
    return {
      tone: 'warning',
      title: '最近访客回填好友缓存失败',
      description: '系统尝试从最近访客里补种好友缓存，但这次没有成功。',
      metrics: [
        { key: 'result', label: '结果', value: '回填失败' },
        { key: 'reason', label: '原因', value: extractErrorMessage(record?.text) },
      ],
    }
  }

  return null
}

function buildFriendGuardSummary(record: any, meta: any) {
  const event = String(meta?.event || '').trim()
  if (event !== 'wx_friend_fetch_guard' && event !== 'qq_friend_fetch_guard')
    return null

  const result = String(meta?.result || '').trim()
  const cachedCount = Math.max(0, Number(meta?.cachedCount || 0))
  const cooldownMs = Math.max(0, Number(meta?.cooldownMs || 0))
  const cooldownSec = Math.max(0, Number(meta?.cooldownSec || 0))
  const copy = buildFriendGuardCopy({
    event,
    result,
    reason: meta?.reason,
  })
  if (!copy)
    return null

  const metrics = [
    { key: 'result', label: '结果', value: formatFriendGuardResultLabel(result) },
  ]

  if (result === 'realtime_unavailable') {
    metrics.push(
      { key: 'reason', label: '原因', value: formatFriendFetchReasonLabel(meta?.reason) },
      { key: 'cooldown', label: '休息时长', value: cooldownMs > 0 ? formatMinutesLabel(Math.round(cooldownMs / 60000)) : '30 分钟' },
    )
  }
  else if (result === 'sync_all_unsupported') {
    metrics.push({ key: 'cooldown', label: '记忆时长', value: cooldownMs > 0 ? formatMinutesLabel(Math.round(cooldownMs / 60000)) : '24 小时' })
  }
  else if (result === 'manual_refresh_probe') {
    metrics.push({ key: 'retry', label: '自动重试', value: '不会恢复' })
  }
  else if (result === 'cache_fallback' || result === 'error_cache') {
    metrics.push({ key: 'cachedCount', label: '缓存好友', value: `${cachedCount} 人` })
    if (cooldownMs > 0)
      metrics.push({ key: 'cooldown', label: '休息时长', value: formatMinutesLabel(Math.round(cooldownMs / 60000)) })
  }
  else if (result === 'error_empty' || result === 'empty') {
    metrics.push({ key: 'reason', label: '原因', value: extractErrorMessage(record?.text) })
  }
  else if (result === 'force_get_all_ignored') {
    metrics.push({ key: 'mode', label: '当前主链路', value: 'SyncAll' })
  }
  else {
    metrics.unshift({ key: 'event', label: '事件', value: event })
    if (cooldownSec > 0)
      metrics.push({ key: 'cooldown', label: '休息一会', value: formatSecondsLabel(cooldownSec) })
  }

  return {
    tone: copy.tone,
    title: copy.title,
    description: copy.description || localizeRuntimeText(String(record?.text || '').trim()) || '本条日志记录了好友链路状态调整。',
    metrics,
  }
}

function buildSystemLogSummary(record: any, meta: any) {
  const event = String(meta?.event || '').trim()
  const result = String(meta?.result || '').trim()
  if (event === 'friend_manual_refresh') {
    const visibleCount = Math.max(0, Number(meta?.visibleCount || 0))
    const rawCount = Math.max(0, Number(meta?.rawCount || 0))
    const filteredOutCount = Math.max(0, Number(meta?.filteredOutCount || 0))
    const cooldownSec = Math.max(0, Number(meta?.cooldownSec || 0))
    const source = String(meta?.source || result || '').trim() || 'empty'
    const reason = String(meta?.reason || '').trim()
    if (source === 'live') {
      return {
        tone: 'success',
        title: '好友手动刷新成功',
        description: `本次拿到了实时好友列表，当前可见 ${visibleCount} 人。`,
        metrics: [
          { key: 'source', label: '来源', value: '实时' },
          { key: 'visible', label: '可见好友', value: `${visibleCount} 人` },
          { key: 'raw', label: '原始返回', value: `${rawCount} 人` },
          { key: 'filtered', label: '过滤掉', value: `${filteredOutCount} 人` },
        ],
      }
    }

    const description = source === 'cache'
      ? `本次没有拿到可用实时好友，已回退到缓存好友 ${visibleCount} 人。`
      : '本次没有拿到可用好友结果，而且没有可回退的缓存好友。'
    const metrics = [
      { key: 'source', label: '来源', value: source === 'cache' ? '缓存' : '空结果' },
      { key: 'visible', label: '可见好友', value: `${visibleCount} 人` },
      { key: 'reason', label: '原因', value: formatFriendFetchReasonLabel(reason) },
    ]
    if (cooldownSec > 0) {
      metrics.push({ key: 'cooldown', label: '自动重试', value: `${cooldownSec} 秒后` })
    }
    return {
      tone: source === 'cache' ? 'warning' : 'danger',
      title: source === 'cache' ? '好友手动刷新已回退缓存' : '好友手动刷新未拿到可用结果',
      description,
      metrics,
    }
  }

  const taskFailureSummary = buildTaskFailureSummary(record, meta)
  if (taskFailureSummary) {
    return taskFailureSummary
  }

  const friendCacheSummary = buildFriendCacheSummary(record, meta)
  if (friendCacheSummary) {
    return friendCacheSummary
  }

  if (event === 'qq_high_risk_auto_disabled') {
    const labels = Array.isArray(meta?.labels)
      ? meta.labels.map((item: any) => String(item || '').trim()).filter(Boolean)
      : []
    const durationMinutes = Math.max(0, Number(meta?.durationMinutes || 0))
    return {
      tone: 'warning',
      title: 'QQ 高风险项已自动回退',
      description: labels.length > 0
        ? `QQ 高风险临时窗口到期后，系统已自动关闭：${labels.join('、')}。`
        : 'QQ 高风险临时窗口到期后，系统已自动关闭相关高风险项。',
      metrics: [
        { key: 'count', label: '关闭项数', value: `${labels.length || 0} 项` },
        { key: 'duration', label: '授权时长', value: formatMinutesLabel(durationMinutes) },
        { key: 'disabledAt', label: '回退时间', value: formatTimestampLabel(meta?.autoDisabledAt) },
      ],
    }
  }

  const friendGuardSummary = buildFriendGuardSummary(record, meta)
  if (friendGuardSummary) {
    return friendGuardSummary
  }

  return null
}

function showDetail(record: any) {
  let metaJson = '{}'
  const parsedMeta = parseMetaData(record.meta_data)
  try {
    if (record.meta_data) {
      metaJson = typeof record.meta_data === 'string' ? record.meta_data : JSON.stringify(record.meta_data, null, 2)
    }
  }
  catch {
    // quiet catch
  }

  detailModalData.value = {
    text: localizeRuntimeText(record.text),
    meta: metaJson,
    summary: buildSystemLogSummary(record, parsedMeta),
  }
  isDetailModalOpen.value = true
}

onMounted(async () => {
  await hydrateSystemLogsViewState()
  applyRouteFilters()
  await fetchData(pagination.current, pagination.pageSize)
  enableSystemLogsViewSync()
})

watch(
  () => [route.query.keyword, route.query.accountId, route.query.level],
  async (next, prev) => {
    if (next.join('|') === prev.join('|'))
      return
    if (!applyRouteFilters())
      return
    await fetchData(1, pagination.pageSize)
  },
)
</script>

<template>
  <div class="fade-in ui-page-shell ui-page-stack ui-page-density-compact w-full">
    <div class="ui-page-header">
      <div class="ui-page-header__main">
        <h1 class="ui-page-title flex items-center gap-2">
          <div class="i-carbon-catalog text-primary-400" />
          系统安全日志审计 (冷热归档)
        </h1>
        <p class="ui-page-desc">
          此面板用于检索由后端抛出的 MySQL 固化日志，方便排查农场底层状态及账号降级历史。
        </p>
      </div>
      <div class="ui-page-actions">
        <BaseButton v-if="friendPageShortcut" variant="secondary" ghost @click="openRelatedFriendPage">
          <div class="i-carbon-arrow-left mr-2" />
          {{ friendPageShortcut.label }}
        </BaseButton>
        <BaseButton variant="primary" ghost @click="fetchData(pagination.current, pagination.pageSize)">
          <div class="i-carbon-renew mr-2" />
          刷新数据
        </BaseButton>
      </div>
    </div>

    <div class="glass-panel ui-filter-panel ui-mobile-sticky-panel">
      <div class="ui-filter-grid lg:grid-cols-[140px_180px_minmax(0,1fr)_auto]">
        <div class="w-32 flex flex-col gap-1">
          <label class="glass-text-muted text-xs">日志级别</label>
          <select v-model="queryParams.level" class="form-input">
            <option value="">
              全部
            </option>
            <option value="info">
              信息
            </option>
            <option value="warn">
              警告
            </option>
            <option value="error">
              错误
            </option>
          </select>
        </div>
        <div class="w-48 flex flex-col gap-1">
          <label class="glass-text-muted text-xs">账号 ID</label>
          <input v-model="queryParams.accountId" placeholder="精准匹配" class="form-input" @keyup.enter="onSearch">
        </div>
        <div class="min-w-48 flex flex-1 flex-col gap-1">
          <label class="glass-text-muted text-xs">关键词检索</label>
          <input v-model="queryParams.keyword" placeholder="日志内容模糊搜索" class="form-input" @keyup.enter="onSearch">
        </div>
        <div class="flex items-end gap-2">
          <BaseButton variant="primary" @click="onSearch">
            <div class="i-carbon-search mr-1" />查询
          </BaseButton>
          <BaseButton variant="secondary" @click="onReset">
            重置
          </BaseButton>
        </div>
      </div>

      <div class="system-logs-info-banner mt-3 rounded-xl px-3 py-2 text-xs leading-5">
        {{ SYSTEM_LOGS_SESSION_PREF_NOTE }}
      </div>

      <div class="mt-4 flex flex-col gap-2">
        <div class="glass-text-muted text-xs">
          快捷筛选
        </div>
        <BaseFilterChips class="system-logs-quick-chips">
          <BaseFilterChip
            v-for="chip in quickFilterChips"
            :key="chip.key"
            as="button"
            type="button"
            :active="isQuickKeywordFilterActive(chip.keyword)"
            class="system-logs-quick-chip"
            :class="`system-logs-quick-chip--${chip.tone}`"
            @click="applyQuickKeywordFilter(chip.keyword)"
          >
            {{ chip.label }}
          </BaseFilterChip>
        </BaseFilterChips>
      </div>
    </div>

    <div class="glass-panel ui-table-card">
      <div v-if="loading && dataSource.length === 0" class="glass-text-muted px-5 pb-5 text-sm md:hidden">
        <div class="i-svg-spinners-ring-resize mb-2 text-2xl text-primary-500" />
        正在加载日志...
      </div>

      <BaseEmptyState
        v-else-if="dataSource.length === 0"
        class="mx-4 my-6 md:hidden"
        icon="i-carbon-catalog"
        title="暂无匹配日志"
        description="可以调整日志级别、账号 ID 或关键词后再试。"
      />

      <div v-else class="ui-mobile-record-list px-4 pb-4 md:hidden">
        <article
          v-for="record in dataSource"
          :key="`mobile-${record.id}`"
          class="ui-mobile-record-card"
        >
          <div class="ui-mobile-record-head">
            <div class="ui-mobile-record-body">
              <div class="ui-mobile-record-badges">
                <span :class="getLevelBadgeClass(record.level)" class="rounded-full px-2.5 py-1 text-xs font-semibold">
                  {{ formatLevel(record.level) }}
                </span>
                <span class="system-logs-category-tag rounded-full px-2.5 py-1 text-xs font-semibold">
                  {{ record.category || '未分类' }}
                </span>
              </div>
              <h3 class="ui-mobile-record-title line-clamp-3">
                {{ localizeRuntimeText(record.text) }}
              </h3>
              <p class="ui-mobile-record-subtitle">
                {{ formatDate(record.created_at) }}
              </p>
            </div>
          </div>

          <div class="ui-mobile-record-grid">
            <div class="ui-mobile-record-field">
              <div class="ui-mobile-record-label">
                账号 ID
              </div>
              <div class="ui-mobile-record-value font-mono">
                {{ record.account_id || '-' }}
              </div>
            </div>
            <div class="ui-mobile-record-field">
              <div class="ui-mobile-record-label">
                时间
              </div>
              <div class="ui-mobile-record-value">
                {{ formatDate(record.created_at) }}
              </div>
            </div>
            <div class="ui-mobile-record-field ui-mobile-record-field--full">
              <div class="ui-mobile-record-label">
                详情摘要
              </div>
              <div class="ui-mobile-record-value ui-mobile-record-value--muted">
                {{ record.meta_data ? '包含元数据，可展开详情查看 JSON。' : '无附加元数据。' }}
              </div>
            </div>
          </div>

          <div class="ui-mobile-record-actions">
            <BaseButton variant="outline" size="sm" @click="showDetail(record)">
              查看详情
            </BaseButton>
          </div>
        </article>
      </div>

      <div class="hidden overflow-x-auto md:block">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="system-logs-head-row">
              <th class="p-3 font-medium">
                时间
              </th>
              <th class="p-3 font-medium">
                级别
              </th>
              <th class="p-3 font-medium">
                分类
              </th>
              <th class="p-3 font-medium">
                账号 ID
              </th>
              <th class="min-w-64 p-3 font-medium">
                日志内容
              </th>
              <th class="p-3 text-right font-medium">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading && dataSource.length === 0">
              <td colspan="6" class="glass-text-muted p-8 text-center">
                <div class="i-svg-spinners-ring-resize mx-auto mb-2 text-2xl text-primary-500" />
                正在加载日志...
              </td>
            </tr>
            <tr v-else-if="dataSource.length === 0">
              <td colspan="6" class="glass-text-muted p-8 text-center">
                暂无匹配的系统日志历史
              </td>
            </tr>
            <tr
              v-for="record in dataSource"
              :key="record.id"
              class="system-logs-row transition-colors last:border-0"
            >
              <td class="whitespace-nowrap p-3">
                {{ formatDate(record.created_at) }}
              </td>
              <td class="p-3">
                <span :class="getLevelBadgeClass(record.level)" class="rounded px-2 py-0.5 text-xs font-semibold">
                  {{ formatLevel(record.level) }}
                </span>
              </td>
              <td class="whitespace-nowrap p-3">
                {{ record.category || '-' }}
              </td>
              <td class="whitespace-nowrap p-3 text-xs font-mono">
                {{ record.account_id || '-' }}
              </td>
              <td class="max-w-xs truncate p-3" :title="localizeRuntimeText(record.text)">
                {{ localizeRuntimeText(record.text) }}
              </td>
              <td class="whitespace-nowrap p-3 text-right">
                <button class="text-xs text-primary-500 font-medium underline hover:text-primary-400" @click="showDetail(record)">
                  详情
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页栏 -->
      <div v-if="total > 0" class="system-logs-footer flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="glass-text-muted text-xs">
          共 {{ total }} 条记录，当前第 {{ pagination.current }} / {{ totalPages }} 页
        </div>
        <div class="flex items-center gap-2">
          <BaseButton variant="secondary" size="sm" :disabled="pagination.current === 1" @click="prevPage">
            上一页
          </BaseButton>
          <span class="px-2 text-sm font-medium">{{ pagination.current }}</span>
          <BaseButton variant="secondary" size="sm" :disabled="!hasNextPage" @click="nextPage">
            下一页
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- 弹窗 -->
    <div v-if="isDetailModalOpen" class="system-logs-modal-overlay fixed inset-0 z-50 flex items-center justify-center" @click.self="isDetailModalOpen = false">
      <div class="glass-panel max-w-2xl w-full rounded-xl p-6 shadow-2xl">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-bold">
            系统日志分析明细
          </h3>
          <button class="system-logs-close i-carbon-close text-xl" @click="isDetailModalOpen = false" />
        </div>
        <div class="space-y-4">
          <div v-if="detailModalData?.summary" class="system-logs-summary-card rounded-xl px-4 py-3" :class="`system-logs-summary-card--${detailModalData.summary.tone}`">
            <div class="system-logs-summary-title">
              {{ detailModalData.summary.title }}
            </div>
            <div class="system-logs-summary-desc mt-1 text-sm leading-6">
              {{ detailModalData.summary.description }}
            </div>
            <div v-if="detailModalData.summary.metrics?.length" class="system-logs-summary-metrics mt-3">
              <div
                v-for="item in detailModalData.summary.metrics"
                :key="item.key"
                class="system-logs-summary-metric rounded-lg px-3 py-2"
              >
                <div class="system-logs-summary-metric-label">
                  {{ item.label }}
                </div>
                <div class="system-logs-summary-metric-value">
                  {{ item.value }}
                </div>
              </div>
            </div>
          </div>
          <div>
            <h4 class="glass-text-muted mb-1 text-sm font-semibold">
              执行记录
            </h4>
            <div class="system-logs-detail-block rounded-lg p-3 text-sm font-mono">
              {{ detailModalData?.text }}
            </div>
          </div>
          <div>
            <h4 class="glass-text-muted mb-1 text-sm font-semibold">
              元数据包 (JSON)
            </h4>
            <pre class="system-logs-detail-block max-h-64 overflow-auto whitespace-pre-wrap rounded-lg p-3 text-xs font-mono">{{ detailModalData?.meta }}</pre>
          </div>
        </div>
        <div class="mt-6 flex justify-end">
          <BaseButton variant="secondary" @click="isDetailModalOpen = false">
            关闭
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-input {
  width: 100%;
  min-height: var(--ui-control-height);
  border-radius: 0.375rem;
  border: 1px solid var(--ui-border-subtle);
  background-color: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent);
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  color: inherit;
  outline: none;
  transition: all 0.2s;
}
.dark .form-input {
  background-color: color-mix(in srgb, var(--ui-bg-surface-raised) 68%, transparent);
  border-color: var(--ui-border-subtle);
}
.form-input:focus {
  border-color: color-mix(in srgb, var(--ui-brand-500) 50%, transparent);
  box-shadow: 0 0 0 2px var(--ui-focus-ring);
}

.system-logs-info-banner {
  border: 1px solid color-mix(in srgb, var(--ui-status-info) 24%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-info-soft) 72%, var(--ui-bg-surface-raised));
  color: var(--ui-status-info);
}

.system-logs-quick-chips {
  align-items: center;
}

.system-logs-quick-chip {
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.system-logs-quick-chip:hover {
  transform: translateY(-1px);
}

.system-logs-quick-chip--info {
  border-color: color-mix(in srgb, var(--ui-status-info) 18%, var(--ui-border-subtle));
  color: color-mix(in srgb, var(--ui-status-info) 72%, var(--ui-text-1));
}

.system-logs-quick-chip--warning {
  border-color: color-mix(in srgb, var(--ui-status-warning) 18%, var(--ui-border-subtle));
  color: color-mix(in srgb, var(--ui-status-warning) 72%, var(--ui-text-1));
}

.system-logs-quick-chip--danger {
  border-color: color-mix(in srgb, var(--ui-status-danger) 18%, var(--ui-border-subtle));
  color: color-mix(in srgb, var(--ui-status-danger) 72%, var(--ui-text-1));
}

.system-logs-head-row,
.system-logs-footer {
  border-color: var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent);
}

.system-logs-row {
  border-bottom: 1px solid var(--ui-border-subtle);
}

.system-logs-row:hover {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 78%, transparent);
}

.system-logs-level-badge {
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--ui-bg-surface) 82%, transparent);
}

.system-logs-level-badge-danger {
  background: color-mix(in srgb, var(--ui-status-danger) 10%, var(--ui-bg-surface-raised));
  color: var(--ui-status-danger);
}

.system-logs-level-badge-warning {
  background: color-mix(in srgb, var(--ui-status-warning) 10%, var(--ui-bg-surface-raised));
  color: var(--ui-status-warning);
}

.system-logs-level-badge-info {
  background: color-mix(in srgb, var(--ui-status-info) 10%, var(--ui-bg-surface-raised));
  color: var(--ui-status-info);
}

.system-logs-level-badge-neutral {
  color: var(--ui-text-2);
}

.system-logs-category-tag {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 76%, transparent);
  color: var(--ui-text-2);
}

.system-logs-modal-overlay {
  background: color-mix(in srgb, var(--ui-overlay-backdrop) 84%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.system-logs-close {
  color: var(--ui-text-2);
  transition: color 160ms ease;
}

.system-logs-close:hover {
  color: var(--ui-text-1);
}

.system-logs-detail-block {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 76%, transparent);
}

.system-logs-summary-card {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 78%, transparent);
}

.system-logs-summary-card--success {
  border-color: color-mix(in srgb, var(--ui-status-success) 22%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-success) 8%, var(--ui-bg-surface));
}

.system-logs-summary-card--warning {
  border-color: color-mix(in srgb, var(--ui-status-warning) 22%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-warning) 8%, var(--ui-bg-surface));
}

.system-logs-summary-card--danger {
  border-color: color-mix(in srgb, var(--ui-status-danger) 22%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-danger) 8%, var(--ui-bg-surface));
}

.system-logs-summary-card--info {
  border-color: color-mix(in srgb, var(--ui-status-info) 22%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-info) 8%, var(--ui-bg-surface));
}

.system-logs-summary-title {
  color: var(--ui-text-1);
  font-size: 0.95rem;
  font-weight: 700;
}

.system-logs-summary-desc {
  color: var(--ui-text-2);
}

.system-logs-summary-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
}

.system-logs-summary-metric {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent);
}

.system-logs-summary-metric-label {
  color: var(--ui-text-3);
  font-size: 0.75rem;
  font-weight: 600;
}

.system-logs-summary-metric-value {
  color: var(--ui-text-1);
  font-size: 0.9rem;
  font-weight: 700;
  margin-top: 0.2rem;
}
</style>
