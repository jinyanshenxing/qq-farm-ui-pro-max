<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDataTable from '@/components/ui/BaseDataTable.vue'
import BaseDataTableHead from '@/components/ui/BaseDataTableHead.vue'
import BaseDataTableStateRow from '@/components/ui/BaseDataTableStateRow.vue'
import BaseFilterChip from '@/components/ui/BaseFilterChip.vue'
import BaseFilterChips from '@/components/ui/BaseFilterChips.vue'
import BaseFilterFields from '@/components/ui/BaseFilterFields.vue'
import BaseHistorySummaryPanel from '@/components/ui/BaseHistorySummaryPanel.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseManagementTableLayout from '@/components/ui/BaseManagementTableLayout.vue'
import BaseSectionHeader from '@/components/ui/BaseSectionHeader.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseStatCard from '@/components/ui/BaseStatCard.vue'
import BaseStatCardGrid from '@/components/ui/BaseStatCardGrid.vue'
import BaseTableToolbar from '@/components/ui/BaseTableToolbar.vue'
import { useCopyFeedbackStore } from '@/stores/copy-feedback'
import { useToastStore } from '@/stores/toast'

type AdminOperationScope = 'users' | 'account_ownership' | 'runtime' | 'help_center'
type AdminOperationStatus = 'success' | 'warning' | 'error'
type ActionType = 'all' | 'create' | 'edit' | 'card' | 'ownership' | 'runtime' | 'delete' | 'batch' | 'other'
type ScopeFilter = 'all' | AdminOperationScope
type StatusFilter = 'all' | AdminOperationStatus

interface AdminOperationLogItem {
  id: string
  actorUsername: string
  scope: AdminOperationScope | ''
  actionLabel: string
  status: AdminOperationStatus
  totalCount: number
  successCount: number
  failedCount: number
  affectedNames: string[]
  failedNames: string[]
  detailLines: string[]
  timestamp: number
}

const COPY_FEEDBACK_DURATION = 2200
const COPY_HIGHLIGHT_DURATION = 1600

const logs = ref<AdminOperationLogItem[]>([])
const loading = ref(false)
const errorMessage = ref('')
const keyword = ref('')
const actorUsername = ref('')
const scopeFilter = ref<ScopeFilter>('all')
const statusFilter = ref<StatusFilter>('all')
const actionTypeFilter = ref<ActionType>('all')
const dateFrom = ref('')
const dateTo = ref('')
const limitFilter = ref(24)
const copiedLogId = ref('')
const copiedControlKey = ref('')
const showDetailModal = ref(false)
const detailLog = ref<AdminOperationLogItem | null>(null)

const copyFeedback = useCopyFeedbackStore()
const toast = useToastStore()

let fetchTimer: ReturnType<typeof setTimeout> | null = null
let copiedLogTimer: ReturnType<typeof setTimeout> | null = null
let copiedControlTimer: ReturnType<typeof setTimeout> | null = null
let fetchToken = 0

const scopeOptions = [
  { label: '全部范围', value: 'all' },
  { label: '用户管理', value: 'users' },
  { label: '账号归属', value: 'account_ownership' },
  { label: '运行时 / 热重载', value: 'runtime' },
  { label: '帮助中心', value: 'help_center' },
]

const statusOptions = [
  { label: '全部结果', value: 'all' },
  { label: '成功', value: 'success' },
  { label: '部分失败', value: 'warning' },
  { label: '失败', value: 'error' },
]

const actionTypeOptions = [
  { label: '全部动作', value: 'all' },
  { label: '新增', value: 'create' },
  { label: '编辑', value: 'edit' },
  { label: '卡密 / 续费', value: 'card' },
  { label: '归属变更', value: 'ownership' },
  { label: '启停动作', value: 'runtime' },
  { label: '删除', value: 'delete' },
  { label: '批量任务', value: 'batch' },
  { label: '其他', value: 'other' },
]

const limitOptions = [
  { label: '最近 24 条', value: 24 },
  { label: '最近 50 条', value: 50 },
  { label: '最近 100 条', value: 100 },
]

const inputComponent = markRaw(BaseInput)
const selectComponent = markRaw(BaseSelect)
const buttonComponent = markRaw(BaseButton)

function normalizeLogItem(raw: unknown): AdminOperationLogItem | null {
  if (!raw || typeof raw !== 'object')
    return null

  const item = raw as Record<string, unknown>
  const status = String(item.status || '').trim()
  const scope = String(item.scope || '').trim()
  if (!['success', 'warning', 'error'].includes(status))
    return null

  return {
    id: String(item.id || '').trim() || `log-${Number(item.timestamp) || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actorUsername: String(item.actorUsername || '').trim(),
    scope: scope === 'users' || scope === 'account_ownership' || scope === 'runtime' || scope === 'help_center' ? scope : '',
    actionLabel: String(item.actionLabel || '').trim() || '未命名操作',
    status: status as AdminOperationStatus,
    totalCount: Math.max(Number(item.totalCount) || 0, 0),
    successCount: Math.max(Number(item.successCount) || 0, 0),
    failedCount: Math.max(Number(item.failedCount) || 0, 0),
    affectedNames: Array.isArray(item.affectedNames) ? item.affectedNames.map(value => String(value || '').trim()).filter(Boolean) : [],
    failedNames: Array.isArray(item.failedNames) ? item.failedNames.map(value => String(value || '').trim()).filter(Boolean) : [],
    detailLines: Array.isArray(item.detailLines) ? item.detailLines.map(value => String(value || '').trim()).filter(Boolean) : [],
    timestamp: Number(item.timestamp) || Date.now(),
  }
}

function clearFetchTimer() {
  if (fetchTimer !== null) {
    clearTimeout(fetchTimer)
    fetchTimer = null
  }
}

function clearCopiedLogTimer() {
  if (copiedLogTimer !== null) {
    clearTimeout(copiedLogTimer)
    copiedLogTimer = null
  }
}

function clearCopiedControlTimer() {
  if (copiedControlTimer !== null) {
    clearTimeout(copiedControlTimer)
    copiedControlTimer = null
  }
}

function scopeLabel(scope: AdminOperationScope | '') {
  if (scope === 'users')
    return '用户管理'
  if (scope === 'account_ownership')
    return '账号归属'
  if (scope === 'runtime')
    return '运行时'
  if (scope === 'help_center')
    return '帮助中心'
  return '其他范围'
}

function scopeSubLabel(scope: AdminOperationScope | '') {
  if (scope === 'users')
    return '账号、卡密、状态治理'
  if (scope === 'account_ownership')
    return '绑定关系、模式、运行态'
  if (scope === 'runtime')
    return '仪表盘热重载、模块重建'
  if (scope === 'help_center')
    return '帮助文档反馈、埋点与跳转治理'
  return '未识别范围'
}

function resolveScopeRoute(scope: AdminOperationScope | '') {
  if (scope === 'users')
    return '/users'
  if (scope === 'account_ownership')
    return '/account-ownership'
  if (scope === 'runtime')
    return '/dashboard'
  if (scope === 'help_center')
    return '/help-center-feedback'
  return ''
}

function statusLabel(status: AdminOperationStatus) {
  if (status === 'success')
    return '成功'
  if (status === 'warning')
    return '部分失败'
  return '失败'
}

function actionTypeLabel(type: ActionType) {
  if (type === 'create')
    return '新增'
  if (type === 'edit')
    return '编辑'
  if (type === 'card')
    return '卡密 / 续费'
  if (type === 'ownership')
    return '归属变更'
  if (type === 'runtime')
    return '启停动作'
  if (type === 'delete')
    return '删除'
  if (type === 'batch')
    return '批量任务'
  if (type === 'other')
    return '其他'
  return '全部动作'
}

function resolveActionType(actionLabel: string): ActionType {
  const label = String(actionLabel || '').trim()
  if (label.includes('批量'))
    return 'batch'
  if (label.includes('续费') || label.includes('卡密'))
    return 'card'
  if (label.includes('归属'))
    return 'ownership'
  if (label.includes('启动') || label.includes('停止') || label.includes('热重载') || label.includes('重载'))
    return 'runtime'
  if (label.includes('删除'))
    return 'delete'
  if (label.includes('新增'))
    return 'create'
  if (label.includes('编辑'))
    return 'edit'
  return 'other'
}

function statusClass(status: AdminOperationStatus) {
  if (status === 'success')
    return 'operation-logs-status operation-logs-status-success'
  if (status === 'warning')
    return 'operation-logs-status operation-logs-status-warning'
  return 'operation-logs-status operation-logs-status-danger'
}

function scopeClass(scope: AdminOperationScope | '') {
  if (scope === 'users')
    return 'operation-logs-scope operation-logs-scope-users'
  if (scope === 'account_ownership')
    return 'operation-logs-scope operation-logs-scope-ownership'
  if (scope === 'runtime')
    return 'operation-logs-scope operation-logs-scope-runtime'
  if (scope === 'help_center')
    return 'operation-logs-scope operation-logs-scope-help-center'
  return 'operation-logs-scope operation-logs-scope-neutral'
}

function actionTypeClass(type: ActionType) {
  if (type === 'batch')
    return 'operation-logs-action operation-logs-action-batch'
  if (type === 'delete')
    return 'operation-logs-action operation-logs-action-delete'
  if (type === 'runtime')
    return 'operation-logs-action operation-logs-action-runtime'
  if (type === 'ownership')
    return 'operation-logs-action operation-logs-action-ownership'
  if (type === 'card')
    return 'operation-logs-action operation-logs-action-card'
  return 'operation-logs-action operation-logs-action-neutral'
}

function formatActionTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp)
}

function formatDateRangeChip() {
  if (!dateFrom.value && !dateTo.value)
    return '全部时间'
  if (dateFrom.value && dateTo.value)
    return `${dateFrom.value.replace('T', ' ')} -> ${dateTo.value.replace('T', ' ')}`
  return `${(dateFrom.value || dateTo.value).replace('T', ' ')} 起`
}

function normalizeDateFilter(value: string) {
  const text = String(value || '').trim()
  if (!text)
    return ''
  const parsed = new Date(text)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ''
}

function resolveDateTimestamp(value: string) {
  const text = String(value || '').trim()
  if (!text)
    return null
  const parsed = new Date(text)
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null
}

function buildActionResultMessage(item: AdminOperationLogItem) {
  const summary = `共 ${item.totalCount} 项，成功 ${item.successCount} 项，失败 ${item.failedCount} 项`
  const successNames = item.affectedNames.filter(name => !item.failedNames.includes(name)).slice(0, 3)
  const failureNames = item.failedNames.slice(0, 3)
  const details = [
    successNames.length ? `成功：${successNames.join('、')}` : '',
    failureNames.length ? `失败：${failureNames.join('、')}` : '',
  ].filter(Boolean)
  return [summary, ...details].join('；')
}

function buildCopyText(item: AdminOperationLogItem) {
  return [
    `${item.actionLabel} · ${formatActionTime(item.timestamp)}`,
    `管理员：${item.actorUsername || '-'}`,
    `范围：${scopeLabel(item.scope)} · 结果：${statusLabel(item.status)} · 类型：${actionTypeLabel(resolveActionType(item.actionLabel))}`,
    buildActionResultMessage(item),
    ...(item.detailLines.length ? ['', ...item.detailLines.map(line => `- ${line}`)] : []),
  ].join('\n')
}

async function copyText(text: string, successMessage: string, options: { controlKey?: string, logId?: string, detail?: string } = {}) {
  try {
    await navigator.clipboard.writeText(text)
    copyFeedback.show({
      message: successMessage,
      detail: options.detail || '内容已写入剪贴板',
      duration: COPY_FEEDBACK_DURATION,
    })

    if (options.logId) {
      copiedLogId.value = options.logId
      clearCopiedLogTimer()
      copiedLogTimer = setTimeout(() => {
        copiedLogId.value = ''
        copiedLogTimer = null
      }, COPY_HIGHLIGHT_DURATION)
    }

    if (options.controlKey) {
      copiedControlKey.value = options.controlKey
      clearCopiedControlTimer()
      copiedControlTimer = setTimeout(() => {
        copiedControlKey.value = ''
        copiedControlTimer = null
      }, COPY_HIGHLIGHT_DURATION)
    }
  }
  catch {
    toast.error('复制失败，请检查浏览器剪贴板权限')
  }
}

async function copyLatestSummary() {
  const latestItem = filterLogs()[0]
  if (!latestItem) {
    toast.warning('当前没有可复制的日志')
    return
  }
  await copyText(buildCopyText(latestItem), '最新日志摘要已复制', {
    controlKey: 'latest-summary',
    logId: latestItem.id,
    detail: `${latestItem.actionLabel} · ${formatActionTime(latestItem.timestamp)}`,
  })
}

async function copyLogItem(item: AdminOperationLogItem) {
  await copyText(buildCopyText(item), '日志摘要已复制', {
    logId: item.id,
    detail: `${item.actionLabel} · ${formatActionTime(item.timestamp)}`,
  })
}

function buildCsvCell(value: string | number) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function exportCurrentLogs() {
  const exportItems = filterLogs()
  if (!exportItems.length) {
    toast.warning('当前没有可导出的日志')
    return
  }

  const rows = [
    ['时间', '管理员', '范围', '动作类型', '动作', '结果', '总数', '成功', '失败', '涉及对象', '失败对象', '详情'],
    ...exportItems.map(item => [
      formatActionTime(item.timestamp),
      item.actorUsername || '-',
      scopeLabel(item.scope),
      actionTypeLabel(resolveActionType(item.actionLabel)),
      item.actionLabel,
      statusLabel(item.status),
      item.totalCount,
      item.successCount,
      item.failedCount,
      item.affectedNames.join('、'),
      item.failedNames.join('、'),
      item.detailLines.join(' | '),
    ]),
  ]

  const csvContent = `\uFEFF${rows.map(row => row.map(buildCsvCell).join(',')).join('\n')}`
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `admin-operation-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(url)
  toast.success(`已导出 ${exportItems.length} 条日志`)
}

const hasInvalidDateRange = computed(() => {
  const from = resolveDateTimestamp(dateFrom.value)
  const to = resolveDateTimestamp(dateTo.value)
  return from !== null && to !== null && from > to
})

const visibleErrorMessage = computed(() => {
  if (hasInvalidDateRange.value)
    return '开始时间不能晚于结束时间'
  return errorMessage.value
})

function filterLogs(items: AdminOperationLogItem[] = logs.value) {
  const from = resolveDateTimestamp(dateFrom.value)
  const to = resolveDateTimestamp(dateTo.value)
  if (hasInvalidDateRange.value)
    return []

  return items.filter((item) => {
    const matchesFrom = from === null || item.timestamp >= from
    const matchesTo = to === null || item.timestamp <= to
    const matchesActionType = actionTypeFilter.value === 'all' || resolveActionType(item.actionLabel) === actionTypeFilter.value
    return matchesFrom && matchesTo && matchesActionType
  })
}

async function fetchLogs() {
  if (hasInvalidDateRange.value) {
    errorMessage.value = '开始时间不能晚于结束时间'
    return
  }

  const currentToken = ++fetchToken
  const previousLogs = [...logs.value]
  loading.value = true
  errorMessage.value = ''

  try {
    const response = await api.get('/api/admin-operation-logs', {
      params: {
        actorUsername: actorUsername.value,
        scope: scopeFilter.value === 'all' ? undefined : scopeFilter.value,
        status: statusFilter.value === 'all' ? undefined : statusFilter.value,
        keyword: keyword.value.trim() || undefined,
        dateFrom: normalizeDateFilter(dateFrom.value) || undefined,
        dateTo: normalizeDateFilter(dateTo.value) || undefined,
        limit: limitFilter.value,
      },
    })

    if (currentToken !== fetchToken)
      return

    logs.value = Array.isArray(response.data?.data?.items)
      ? response.data.data.items.map(normalizeLogItem).filter((item: AdminOperationLogItem | null): item is AdminOperationLogItem => !!item)
      : []
  }
  catch (error: unknown) {
    if (currentToken !== fetchToken)
      return

    logs.value = previousLogs
    errorMessage.value = error instanceof Error ? error.message : '读取操作日志失败'
    toast.error('读取操作日志失败，请稍后重试')
  }
  finally {
    if (currentToken === fetchToken)
      loading.value = false
  }
}

function scheduleFetch() {
  clearFetchTimer()
  fetchTimer = setTimeout(() => {
    fetchLogs()
    fetchTimer = null
  }, 220)
}

function resetFilters() {
  keyword.value = ''
  actorUsername.value = ''
  scopeFilter.value = 'all'
  statusFilter.value = 'all'
  actionTypeFilter.value = 'all'
  dateFrom.value = ''
  dateTo.value = ''
  limitFilter.value = 24
}

function openDetailModal(item: AdminOperationLogItem) {
  detailLog.value = item
  showDetailModal.value = true
}

function closeDetailModal() {
  showDetailModal.value = false
}

const filteredLogs = computed(() => filterLogs())

const hasFilters = computed(() =>
  !!keyword.value.trim()
  || !!actorUsername.value.trim()
  || scopeFilter.value !== 'all'
  || statusFilter.value !== 'all'
  || actionTypeFilter.value !== 'all'
  || !!dateFrom.value
  || !!dateTo.value
  || limitFilter.value !== 24,
)

const summary = computed(() => {
  return filterLogs().reduce((acc, item) => {
    acc.total += 1
    acc.actors.add(item.actorUsername || '-')
    if (item.scope === 'users')
      acc.users += 1
    if (item.scope === 'account_ownership')
      acc.ownership += 1
    if (item.scope === 'runtime')
      acc.runtime += 1
    if (item.status === 'success')
      acc.success += 1
    else if (item.status === 'warning')
      acc.warning += 1
    else
      acc.error += 1
    return acc
  }, {
    total: 0,
    success: 0,
    warning: 0,
    error: 0,
    users: 0,
    ownership: 0,
    runtime: 0,
    actors: new Set<string>(),
  })
})

const summaryCards = computed(() => [
  {
    key: 'total',
    label: '当前命中',
    value: String(summary.value.total),
    description: '按当前筛选命中的持久化日志',
  },
  {
    key: 'status',
    label: '成功 / 部分失败 / 失败',
    value: `${summary.value.success} / ${summary.value.warning} / ${summary.value.error}`,
    description: '执行结果分层展示',
  },
  {
    key: 'scope',
    label: '用户 / 归属 / 运行时',
    value: `${summary.value.users} / ${summary.value.ownership} / ${summary.value.runtime}`,
    description: '覆盖三个管理域',
  },
  {
    key: 'actors',
    label: '涉及管理员',
    value: String(summary.value.actors.size),
    description: actorUsername.value.trim() ? `当前聚焦 ${actorUsername.value.trim()}` : '空值表示查看全部管理员',
  },
])

const latestLog = computed(() => filterLogs()[0] || null)
const recentLogs = computed(() => filterLogs().slice(1, 5))

const primaryFilterFields = computed(() => [
  {
    key: 'keyword',
    component: inputComponent,
    modelValue: keyword.value,
    props: {
      label: '关键词检索',
      placeholder: '搜索动作、对象、失败原因',
      clearable: true,
    },
    onUpdate: (value: unknown) => {
      keyword.value = String(value ?? '')
    },
  },
  {
    key: 'actor',
    component: inputComponent,
    modelValue: actorUsername.value,
    props: {
      label: '管理员',
      placeholder: '留空表示全部管理员',
      clearable: true,
    },
    onUpdate: (value: unknown) => {
      actorUsername.value = String(value ?? '')
    },
  },
  {
    key: 'scope',
    component: selectComponent,
    modelValue: scopeFilter.value,
    props: {
      label: '范围筛选',
      options: scopeOptions,
    },
    onUpdate: (value: unknown) => {
      scopeFilter.value = value as ScopeFilter
    },
  },
  {
    key: 'status',
    component: selectComponent,
    modelValue: statusFilter.value,
    props: {
      label: '结果筛选',
      options: statusOptions,
    },
    onUpdate: (value: unknown) => {
      statusFilter.value = value as StatusFilter
    },
  },
  {
    key: 'action-type',
    component: selectComponent,
    modelValue: actionTypeFilter.value,
    props: {
      label: '动作类型',
      options: actionTypeOptions,
    },
    onUpdate: (value: unknown) => {
      actionTypeFilter.value = value as ActionType
    },
  },
])

const secondaryFilterFields = computed(() => [
  {
    key: 'date-from',
    component: inputComponent,
    modelValue: dateFrom.value,
    props: {
      label: '开始时间',
      type: 'datetime-local',
      error: hasInvalidDateRange.value ? '开始时间不能晚于结束时间' : '',
    },
    onUpdate: (value: unknown) => {
      dateFrom.value = String(value ?? '')
    },
  },
  {
    key: 'date-to',
    component: inputComponent,
    modelValue: dateTo.value,
    props: {
      label: '结束时间',
      type: 'datetime-local',
      error: hasInvalidDateRange.value ? '结束时间不能早于开始时间' : '',
    },
    onUpdate: (value: unknown) => {
      dateTo.value = String(value ?? '')
    },
  },
  {
    key: 'limit',
    component: selectComponent,
    modelValue: limitFilter.value,
    props: {
      label: '载入数量',
      options: limitOptions,
    },
    onUpdate: (value: unknown) => {
      limitFilter.value = Number(value) || 24
    },
  },
  {
    key: 'reset',
    component: buttonComponent,
    props: {
      variant: 'ghost',
      class: 'w-full xl:w-auto',
    },
    wrapperClass: 'flex items-end',
    text: '重置筛选',
    onClick: () => {
      resetFilters()
    },
  },
])

const toolbarActions = computed(() => {
  const actions = [
    {
      key: 'export',
      label: '导出当前结果',
      onClick: () => {
        exportCurrentLogs()
      },
    },
  ]

  if (hasFilters.value) {
    actions.unshift({
      key: 'clear-filters',
      label: '清空筛选',
      onClick: () => {
        resetFilters()
      },
    })
  }

  return actions
})

watch([keyword, actorUsername, scopeFilter, statusFilter, dateFrom, dateTo, limitFilter], () => {
  scheduleFetch()
})

watch(actionTypeFilter, () => {
  if (detailLog.value && resolveActionType(detailLog.value.actionLabel) !== actionTypeFilter.value && actionTypeFilter.value !== 'all')
    closeDetailModal()
})

onMounted(() => {
  fetchLogs()
})

onBeforeUnmount(() => {
  clearFetchTimer()
  clearCopiedLogTimer()
  clearCopiedControlTimer()
})
</script>

<template>
  <div class="fade-in ui-page-shell ui-page-stack ui-page-density-compact operation-logs-page w-full">
    <div class="ui-page-header">
      <div class="ui-page-header__main">
        <h1 class="ui-page-title flex items-center gap-2">
          <div class="i-carbon-task text-primary-500" />
          操作日志中心
        </h1>
        <p class="ui-page-desc">
          汇总用户治理、账号归属和运行时热重载的持久化操作日志，支持按操作者、范围、结果、动作类型和时间范围统一回查。
        </p>
      </div>
      <div class="ui-page-actions">
        <BaseButton variant="outline" :loading="loading" @click="fetchLogs">
          <span class="i-carbon-renew mr-2 text-base" />
          刷新日志
        </BaseButton>
      </div>
    </div>

    <BaseManagementTableLayout>
      <template #summary>
        <BaseStatCardGrid class="xl:grid-cols-4">
          <BaseStatCard
            v-for="card in summaryCards"
            :key="card.key"
            class="operation-logs-summary-card"
            :label="card.label"
            :value="card.value"
            :description="card.description"
          />
        </BaseStatCardGrid>
      </template>

      <template #filters>
        <section class="glass-panel ui-filter-panel">
          <BaseSectionHeader
            title="日志筛选"
            description="管理员留空时默认查看全部管理员；时间范围会直接作用到后端持久化日志查询，动作类型在前端做精细归类。"
          />

          <BaseFilterFields
            class="mt-5 2xl:grid-cols-[1.3fr_1fr_0.85fr_0.85fr_0.85fr]"
            :fields="primaryFilterFields"
          />
          <BaseFilterFields
            class="mt-4 xl:grid-cols-[1fr_1fr_0.7fr_auto]"
            :fields="secondaryFilterFields"
          />

          <BaseTableToolbar class="mt-4">
            <template #left>
              <BaseFilterChips>
                <BaseFilterChip>当前命中 {{ filteredLogs.length }} 条</BaseFilterChip>
                <BaseFilterChip :active="!!actorUsername.trim()">
                  管理员：{{ actorUsername.trim() || '全部' }}
                </BaseFilterChip>
                <BaseFilterChip :active="scopeFilter !== 'all'">
                  范围：{{ scopeFilter === 'all' ? '全部范围' : scopeLabel(scopeFilter) }}
                </BaseFilterChip>
                <BaseFilterChip :active="statusFilter !== 'all'">
                  结果：{{ statusFilter === 'all' ? '全部结果' : statusLabel(statusFilter) }}
                </BaseFilterChip>
                <BaseFilterChip :active="actionTypeFilter !== 'all'">
                  动作：{{ actionTypeLabel(actionTypeFilter) }}
                </BaseFilterChip>
                <BaseFilterChip :active="!!dateFrom || !!dateTo">
                  时间：{{ formatDateRangeChip() }}
                </BaseFilterChip>
              </BaseFilterChips>
            </template>
            <template #right>
              <div class="ui-page-actions">
                <BaseButton
                  v-for="action in toolbarActions"
                  :key="action.key"
                  variant="ghost"
                  size="sm"
                  @click="action.onClick"
                >
                  {{ action.label }}
                </BaseButton>
              </div>
            </template>
          </BaseTableToolbar>
        </section>
      </template>

      <template #supporting>
        <BaseHistorySummaryPanel
          title="最新执行回放"
          description="高亮最近一条命中的持久化日志，并保留后续几次操作摘要，方便快速审计和追踪。"
        >
          <template #actions>
            <BaseButton
              variant="outline"
              size="sm"
              :class="{ 'operation-logs-copy-active': copiedControlKey === 'latest-summary' }"
              :disabled="!latestLog"
              @click="copyLatestSummary"
            >
              <span :class="copiedControlKey === 'latest-summary' ? 'mr-1 text-sm i-carbon-checkmark-filled' : 'mr-1 text-sm i-carbon-copy-file'" />
              {{ copiedControlKey === 'latest-summary' ? '最新摘要已复制' : '复制最新摘要' }}
            </BaseButton>
            <BaseButton variant="ghost" size="sm" :disabled="!latestLog" @click="latestLog && openDetailModal(latestLog)">
              查看详情
            </BaseButton>
          </template>

          <div v-if="latestLog" class="grid gap-3 xl:grid-cols-[1.35fr_0.85fr]">
            <div class="operation-logs-feature-card">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div class="operation-logs-feature-title">
                    {{ latestLog.actionLabel }}
                  </div>
                  <div class="operation-logs-feature-meta">
                    {{ formatActionTime(latestLog.timestamp) }} · 管理员 {{ latestLog.actorUsername || '-' }}
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <BaseBadge :class="scopeClass(latestLog.scope)">
                    {{ scopeLabel(latestLog.scope) }}
                  </BaseBadge>
                  <BaseBadge :class="statusClass(latestLog.status)">
                    {{ statusLabel(latestLog.status) }}
                  </BaseBadge>
                  <BaseBadge :class="actionTypeClass(resolveActionType(latestLog.actionLabel))">
                    {{ actionTypeLabel(resolveActionType(latestLog.actionLabel)) }}
                  </BaseBadge>
                </div>
              </div>

              <p class="operation-logs-feature-desc">
                {{ buildActionResultMessage(latestLog) }}
              </p>

              <div v-if="latestLog.detailLines.length" class="operation-logs-details">
                <div
                  v-for="line in latestLog.detailLines"
                  :key="line"
                  class="operation-logs-detail-line"
                >
                  {{ line }}
                </div>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="operation-logs-metric operation-logs-metric-success">
                <div class="operation-logs-metric-label">
                  成功
                </div>
                <div class="operation-logs-metric-value">
                  {{ latestLog.successCount }}
                </div>
              </div>
              <div class="operation-logs-metric operation-logs-metric-warning">
                <div class="operation-logs-metric-label">
                  失败
                </div>
                <div class="operation-logs-metric-value">
                  {{ latestLog.failedCount }}
                </div>
              </div>
              <div class="operation-logs-metric operation-logs-metric-neutral">
                <div class="operation-logs-metric-label">
                  涉及
                </div>
                <div class="operation-logs-metric-value">
                  {{ latestLog.totalCount }}
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="loading" class="operation-logs-empty-hint">
            正在读取最新日志...
          </div>

          <div v-else class="operation-logs-empty-hint">
            {{ visibleErrorMessage || '当前筛选条件下没有匹配日志；可以调整动作类型或时间范围后再试。' }}
          </div>

          <template v-if="recentLogs.length" #recent>
            <div class="grid gap-3 2xl:grid-cols-4 lg:grid-cols-2">
              <button
                v-for="item in recentLogs"
                :key="item.id"
                class="operation-logs-history-item"
                :class="{ 'operation-logs-history-item-copied': copiedLogId === item.id }"
                @click="copyLogItem(item)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="operation-logs-history-title">
                      {{ item.actionLabel }}
                    </div>
                    <div class="operation-logs-history-meta">
                      {{ item.actorUsername || '-' }} · {{ formatActionTime(item.timestamp) }}
                    </div>
                  </div>
                  <div
                    class="text-base transition-transform duration-300"
                    :class="copiedLogId === item.id ? 'scale-110 text-[var(--ui-brand-600)] i-carbon-checkmark-filled' : 'text-[var(--ui-text-3)] i-carbon-copy'"
                  />
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <BaseBadge :class="scopeClass(item.scope)">
                    {{ scopeLabel(item.scope) }}
                  </BaseBadge>
                  <BaseBadge :class="statusClass(item.status)">
                    {{ statusLabel(item.status) }}
                  </BaseBadge>
                  <BaseBadge :class="actionTypeClass(resolveActionType(item.actionLabel))">
                    {{ actionTypeLabel(resolveActionType(item.actionLabel)) }}
                  </BaseBadge>
                </div>
                <p class="operation-logs-history-desc">
                  {{ buildActionResultMessage(item) }}
                </p>
              </button>
            </div>
          </template>
        </BaseHistorySummaryPanel>
      </template>

      <template #table>
        <section class="glass-panel ui-table-card">
          <BaseSectionHeader
            title="持久化日志列表"
            description="每条记录都包含动作、归类、时间、影响对象、失败对象和字段变化摘要，可直接打开详情或跳回来源页面。"
          />

          <div class="mt-5 md:hidden space-y-4">
            <div v-if="loading && !filteredLogs.length" class="operation-logs-empty-hint">
              正在加载持久化操作日志...
            </div>

            <div v-else-if="!filteredLogs.length" class="operation-logs-empty-hint">
              {{ visibleErrorMessage || '当前筛选条件下没有匹配的持久化操作记录。' }}
            </div>

            <div v-else class="ui-mobile-record-list">
              <article
                v-for="item in filteredLogs"
                :key="`mobile-${item.id}`"
                class="operation-logs-mobile-card ui-mobile-record-card"
              >
                <div class="ui-mobile-record-head">
                  <div class="ui-mobile-record-body">
                    <div class="ui-mobile-record-badges">
                      <BaseBadge :class="scopeClass(item.scope)">
                        {{ scopeLabel(item.scope) }}
                      </BaseBadge>
                      <BaseBadge :class="statusClass(item.status)">
                        {{ statusLabel(item.status) }}
                      </BaseBadge>
                      <BaseBadge :class="actionTypeClass(resolveActionType(item.actionLabel))">
                        {{ actionTypeLabel(resolveActionType(item.actionLabel)) }}
                      </BaseBadge>
                    </div>
                    <h3 class="ui-mobile-record-title mt-3">
                      {{ item.actionLabel }}
                    </h3>
                    <p class="ui-mobile-record-subtitle">
                      {{ item.actorUsername || '-' }} · {{ formatActionTime(item.timestamp) }}
                    </p>
                  </div>
                </div>

                <div class="ui-mobile-record-grid">
                  <div class="ui-mobile-record-field ui-mobile-record-field--full">
                    <div class="ui-mobile-record-label">
                      动作摘要
                    </div>
                    <div class="ui-mobile-record-value">
                      {{ buildActionResultMessage(item) }}
                    </div>
                  </div>
                  <div class="ui-mobile-record-field">
                    <div class="ui-mobile-record-label">
                      涉及对象
                    </div>
                    <div class="ui-mobile-record-value">
                      {{ item.affectedNames.length ? item.affectedNames.join(' / ') : '无对象摘要' }}
                    </div>
                  </div>
                  <div class="ui-mobile-record-field">
                    <div class="ui-mobile-record-label">
                      失败项
                    </div>
                    <div class="ui-mobile-record-value">
                      {{ item.failedNames.length ? item.failedNames.join(' / ') : '无失败项' }}
                    </div>
                  </div>
                  <div v-if="item.detailLines.length" class="ui-mobile-record-field ui-mobile-record-field--full">
                    <div class="ui-mobile-record-label">
                      细节
                    </div>
                    <div class="ui-mobile-record-value ui-mobile-record-value--muted">
                      {{ item.detailLines.slice(0, 3).join(' · ') }}
                    </div>
                  </div>
                </div>

                <div class="ui-mobile-record-actions">
                  <BaseButton variant="ghost" size="sm" @click="openDetailModal(item)">
                    查看详情
                  </BaseButton>
                  <BaseButton variant="ghost" size="sm" @click="copyLogItem(item)">
                    复制摘要
                  </BaseButton>
                  <BaseButton
                    v-if="resolveScopeRoute(item.scope)"
                    variant="outline"
                    size="sm"
                    :to="resolveScopeRoute(item.scope)"
                  >
                    前往来源页
                  </BaseButton>
                </div>
              </article>
            </div>
          </div>

          <BaseDataTable class="mt-5 hidden md:block" table-class="min-w-[1280px]">
            <BaseDataTableHead>
              <tr>
                <th class="px-4 py-3 text-left text-xs text-[var(--ui-text-3)] font-semibold tracking-[0.14em] uppercase">
                  时间 / 管理员
                </th>
                <th class="px-4 py-3 text-left text-xs text-[var(--ui-text-3)] font-semibold tracking-[0.14em] uppercase">
                  范围 / 结果 / 类型
                </th>
                <th class="px-4 py-3 text-left text-xs text-[var(--ui-text-3)] font-semibold tracking-[0.14em] uppercase">
                  动作摘要
                </th>
                <th class="px-4 py-3 text-left text-xs text-[var(--ui-text-3)] font-semibold tracking-[0.14em] uppercase">
                  涉及对象
                </th>
                <th class="px-4 py-3 text-left text-xs text-[var(--ui-text-3)] font-semibold tracking-[0.14em] uppercase">
                  失败 / 细节
                </th>
                <th class="px-4 py-3 text-right text-xs text-[var(--ui-text-3)] font-semibold tracking-[0.14em] uppercase">
                  操作
                </th>
              </tr>
            </BaseDataTableHead>

            <tbody>
              <BaseDataTableStateRow v-if="loading && !filteredLogs.length" :colspan="6" loading loading-label="正在加载持久化操作日志..." />

              <BaseDataTableStateRow v-else-if="!filteredLogs.length" :colspan="6" icon="i-carbon-document-blank">
                <template #title>
                  {{ visibleErrorMessage ? '日志加载失败' : '暂无操作日志' }}
                </template>
                <template #description>
                  {{ visibleErrorMessage || '当前筛选条件下没有匹配的持久化操作记录。' }}
                </template>
              </BaseDataTableStateRow>

              <template v-else>
                <tr
                  v-for="item in filteredLogs"
                  :key="item.id"
                  class="operation-logs-row"
                >
                  <td class="px-4 py-4 align-top">
                    <div class="operation-logs-cell-title">
                      {{ formatActionTime(item.timestamp) }}
                    </div>
                    <div class="operation-logs-cell-meta">
                      管理员：{{ item.actorUsername || '-' }}
                    </div>
                  </td>

                  <td class="px-4 py-4 align-top">
                    <div class="flex flex-wrap gap-2">
                      <BaseBadge :class="scopeClass(item.scope)">
                        {{ scopeLabel(item.scope) }}
                      </BaseBadge>
                      <BaseBadge :class="statusClass(item.status)">
                        {{ statusLabel(item.status) }}
                      </BaseBadge>
                      <BaseBadge :class="actionTypeClass(resolveActionType(item.actionLabel))">
                        {{ actionTypeLabel(resolveActionType(item.actionLabel)) }}
                      </BaseBadge>
                    </div>
                    <div class="operation-logs-cell-meta mt-3">
                      {{ scopeSubLabel(item.scope) }}
                    </div>
                  </td>

                  <td class="px-4 py-4 align-top">
                    <div class="operation-logs-cell-title">
                      {{ item.actionLabel }}
                    </div>
                    <div class="operation-logs-cell-desc">
                      {{ buildActionResultMessage(item) }}
                    </div>
                  </td>

                  <td class="px-4 py-4 align-top">
                    <div v-if="item.affectedNames.length" class="operation-logs-tag-list">
                      <span
                        v-for="name in item.affectedNames"
                        :key="name"
                        class="operation-logs-tag"
                      >
                        {{ name }}
                      </span>
                    </div>
                    <div v-else class="operation-logs-cell-meta">
                      无对象摘要
                    </div>
                  </td>

                  <td class="px-4 py-4 align-top">
                    <div v-if="item.failedNames.length" class="operation-logs-tag-list operation-logs-tag-list-danger">
                      <span
                        v-for="name in item.failedNames"
                        :key="name"
                        class="operation-logs-tag operation-logs-tag-danger"
                      >
                        {{ name }}
                      </span>
                    </div>
                    <div v-else class="operation-logs-cell-meta">
                      无失败项
                    </div>

                    <div v-if="item.detailLines.length" class="operation-logs-inline-details">
                      <div
                        v-for="line in item.detailLines.slice(0, 3)"
                        :key="line"
                        class="operation-logs-inline-detail"
                      >
                        {{ line }}
                      </div>
                    </div>
                  </td>

                  <td class="px-4 py-4 align-top">
                    <div class="flex justify-end gap-2">
                      <BaseButton variant="ghost" size="sm" @click="openDetailModal(item)">
                        查看详情
                      </BaseButton>
                      <BaseButton variant="ghost" size="sm" @click="copyLogItem(item)">
                        复制摘要
                      </BaseButton>
                      <BaseButton
                        v-if="resolveScopeRoute(item.scope)"
                        variant="outline"
                        size="sm"
                        :to="resolveScopeRoute(item.scope)"
                      >
                        前往来源页
                      </BaseButton>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </BaseDataTable>
        </section>
      </template>
    </BaseManagementTableLayout>

    <ConfirmModal
      :show="showDetailModal"
      title="日志详情"
      confirm-text="关闭"
      is-alert
      @confirm="closeDetailModal"
      @cancel="closeDetailModal"
    >
      <div v-if="detailLog" class="operation-logs-detail-modal">
        <div class="operation-logs-detail-modal__header">
          <div>
            <div class="operation-logs-detail-modal__title">
              {{ detailLog.actionLabel }}
            </div>
            <div class="operation-logs-detail-modal__meta">
              {{ formatActionTime(detailLog.timestamp) }} · 管理员 {{ detailLog.actorUsername || '-' }}
            </div>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <BaseBadge :class="scopeClass(detailLog.scope)">
              {{ scopeLabel(detailLog.scope) }}
            </BaseBadge>
            <BaseBadge :class="statusClass(detailLog.status)">
              {{ statusLabel(detailLog.status) }}
            </BaseBadge>
            <BaseBadge :class="actionTypeClass(resolveActionType(detailLog.actionLabel))">
              {{ actionTypeLabel(resolveActionType(detailLog.actionLabel)) }}
            </BaseBadge>
          </div>
        </div>

        <div class="operation-logs-detail-modal__stats">
          <div class="operation-logs-detail-modal__stat">
            <span>总数</span>
            <strong>{{ detailLog.totalCount }}</strong>
          </div>
          <div class="operation-logs-detail-modal__stat">
            <span>成功</span>
            <strong>{{ detailLog.successCount }}</strong>
          </div>
          <div class="operation-logs-detail-modal__stat">
            <span>失败</span>
            <strong>{{ detailLog.failedCount }}</strong>
          </div>
        </div>

        <div class="operation-logs-detail-modal__section">
          <div class="operation-logs-detail-modal__section-title">
            结果摘要
          </div>
          <p class="operation-logs-detail-modal__text">
            {{ buildActionResultMessage(detailLog) }}
          </p>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="operation-logs-detail-modal__section">
            <div class="operation-logs-detail-modal__section-title">
              涉及对象
            </div>
            <div v-if="detailLog.affectedNames.length" class="operation-logs-tag-list">
              <span
                v-for="name in detailLog.affectedNames"
                :key="name"
                class="operation-logs-tag"
              >
                {{ name }}
              </span>
            </div>
            <p v-else class="operation-logs-detail-modal__text operation-logs-detail-modal__text-muted">
              无对象摘要
            </p>
          </div>

          <div class="operation-logs-detail-modal__section">
            <div class="operation-logs-detail-modal__section-title">
              失败对象
            </div>
            <div v-if="detailLog.failedNames.length" class="operation-logs-tag-list operation-logs-tag-list-danger">
              <span
                v-for="name in detailLog.failedNames"
                :key="name"
                class="operation-logs-tag operation-logs-tag-danger"
              >
                {{ name }}
              </span>
            </div>
            <p v-else class="operation-logs-detail-modal__text operation-logs-detail-modal__text-muted">
              无失败项
            </p>
          </div>
        </div>

        <div class="operation-logs-detail-modal__section">
          <div class="operation-logs-detail-modal__section-header">
            <div class="operation-logs-detail-modal__section-title">
              字段变化 / 细节说明
            </div>
            <BaseButton variant="ghost" size="sm" @click="copyLogItem(detailLog)">
              复制本条摘要
            </BaseButton>
          </div>
          <div v-if="detailLog.detailLines.length" class="operation-logs-details">
            <div
              v-for="line in detailLog.detailLines"
              :key="line"
              class="operation-logs-detail-line"
            >
              {{ line }}
            </div>
          </div>
          <p v-else class="operation-logs-detail-modal__text operation-logs-detail-modal__text-muted">
            这条日志没有附带额外字段变化明细。
          </p>
        </div>
      </div>
    </ConfirmModal>
  </div>
</template>

<style scoped>
.operation-logs-page {
  --operation-logs-success-bg: color-mix(in srgb, var(--ui-status-success) 14%, transparent);
  --operation-logs-success-text: color-mix(in srgb, var(--ui-status-success) 88%, var(--ui-text-1) 12%);
  --operation-logs-warning-bg: color-mix(in srgb, var(--ui-status-warning) 18%, transparent);
  --operation-logs-warning-text: color-mix(in srgb, var(--ui-status-warning) 76%, var(--ui-text-1) 24%);
  --operation-logs-danger-bg: color-mix(in srgb, var(--ui-status-danger) 14%, transparent);
  --operation-logs-danger-text: color-mix(in srgb, var(--ui-status-danger) 82%, var(--ui-text-1) 18%);
}

.operation-logs-summary-card {
  min-height: 142px;
}

.operation-logs-copy-active {
  border-color: color-mix(in srgb, var(--ui-brand-500) 56%, var(--ui-border-subtle) 44%);
  color: var(--ui-brand-700);
}

.operation-logs-feature-card {
  border: 1px solid var(--ui-border-subtle);
  border-radius: 28px;
  padding: 1.1rem 1.2rem;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--ui-brand-500) 7%, transparent), transparent 48%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 84%, transparent);
}

.operation-logs-feature-title,
.operation-logs-cell-title,
.operation-logs-history-title,
.operation-logs-detail-modal__title {
  color: var(--ui-text-1);
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.5;
}

.operation-logs-feature-meta,
.operation-logs-cell-meta,
.operation-logs-history-meta,
.operation-logs-detail-modal__meta {
  color: var(--ui-text-3);
  font-size: 0.78rem;
  line-height: 1.6;
}

.operation-logs-feature-desc,
.operation-logs-cell-desc,
.operation-logs-history-desc,
.operation-logs-detail-modal__text {
  margin-top: 0.85rem;
  color: var(--ui-text-2);
  font-size: 0.86rem;
  line-height: 1.7;
}

.operation-logs-detail-modal__text-muted {
  color: var(--ui-text-3);
}

.operation-logs-details,
.operation-logs-inline-details {
  margin-top: 0.85rem;
  display: grid;
  gap: 0.5rem;
}

.operation-logs-detail-line,
.operation-logs-inline-detail {
  border-radius: 16px;
  background: color-mix(in srgb, var(--ui-bg-surface) 90%, transparent);
  color: var(--ui-text-2);
  font-size: 0.82rem;
  line-height: 1.6;
  padding: 0.6rem 0.85rem;
}

.operation-logs-metric {
  border-radius: 24px;
  padding: 1rem 0.9rem;
  text-align: center;
}

.operation-logs-metric-success {
  background: var(--operation-logs-success-bg);
  color: var(--operation-logs-success-text);
}

.operation-logs-metric-warning {
  background: var(--operation-logs-danger-bg);
  color: var(--operation-logs-danger-text);
}

.operation-logs-metric-neutral {
  background: color-mix(in srgb, var(--ui-brand-500) 12%, transparent);
  color: color-mix(in srgb, var(--ui-brand-700) 82%, var(--ui-text-1) 18%);
}

.operation-logs-metric-label {
  font-size: 0.76rem;
  opacity: 0.82;
}

.operation-logs-metric-value {
  margin-top: 0.55rem;
  font-size: 1.4rem;
  font-weight: 700;
}

.operation-logs-empty-hint {
  border: 1px dashed var(--ui-border-subtle);
  border-radius: 24px;
  padding: 1rem 1.1rem;
  color: var(--ui-text-3);
  font-size: 0.9rem;
}

.operation-logs-history-item {
  border: 1px solid var(--ui-border-subtle);
  border-radius: 22px;
  padding: 1rem;
  text-align: left;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 80%, transparent);
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.operation-logs-history-item:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--ui-brand-500) 34%, var(--ui-border-subtle) 66%);
}

.operation-logs-history-item-copied {
  border-color: color-mix(in srgb, var(--ui-brand-500) 56%, var(--ui-border-subtle) 44%);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ui-brand-500) 12%, transparent);
}

.operation-logs-status,
.operation-logs-scope,
.operation-logs-action {
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  padding: 0.5rem 0.75rem;
}

.operation-logs-status-success {
  background: var(--operation-logs-success-bg);
  color: var(--operation-logs-success-text);
}

.operation-logs-status-warning {
  background: var(--operation-logs-warning-bg);
  color: var(--operation-logs-warning-text);
}

.operation-logs-status-danger {
  background: var(--operation-logs-danger-bg);
  color: var(--operation-logs-danger-text);
}

.operation-logs-scope-users {
  background: color-mix(in srgb, var(--ui-brand-500) 13%, transparent);
  color: color-mix(in srgb, var(--ui-brand-700) 82%, var(--ui-text-1) 18%);
}

.operation-logs-scope-ownership {
  background: color-mix(in srgb, var(--ui-status-success) 11%, transparent);
  color: color-mix(in srgb, var(--ui-status-success) 84%, var(--ui-text-1) 16%);
}

.operation-logs-scope-runtime {
  background: color-mix(in srgb, var(--ui-status-info) 12%, transparent);
  color: color-mix(in srgb, var(--ui-status-info) 82%, var(--ui-text-1) 18%);
}

.operation-logs-scope-help-center {
  background: color-mix(in srgb, var(--ui-status-warning) 14%, transparent);
  color: color-mix(in srgb, var(--ui-status-warning) 82%, var(--ui-text-1) 18%);
}

.operation-logs-scope-neutral,
.operation-logs-action-neutral {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 86%, transparent);
  color: var(--ui-text-2);
}

.operation-logs-action-card {
  background: color-mix(in srgb, var(--ui-status-warning) 14%, transparent);
  color: color-mix(in srgb, var(--ui-status-warning) 82%, var(--ui-text-1) 18%);
}

.operation-logs-action-ownership {
  background: color-mix(in srgb, var(--ui-status-success) 12%, transparent);
  color: color-mix(in srgb, var(--ui-status-success) 84%, var(--ui-text-1) 16%);
}

.operation-logs-action-runtime {
  background: color-mix(in srgb, var(--ui-brand-500) 12%, transparent);
  color: color-mix(in srgb, var(--ui-brand-700) 82%, var(--ui-text-1) 18%);
}

.operation-logs-action-delete {
  background: var(--operation-logs-danger-bg);
  color: var(--operation-logs-danger-text);
}

.operation-logs-action-batch {
  background: color-mix(in srgb, var(--ui-brand-500) 18%, transparent);
  color: color-mix(in srgb, var(--ui-brand-700) 86%, var(--ui-text-1) 14%);
}

.operation-logs-row + .operation-logs-row td {
  border-top: 1px solid var(--ui-border-subtle);
}

.operation-logs-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.operation-logs-tag {
  border-radius: 999px;
  padding: 0.38rem 0.7rem;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent);
  color: var(--ui-text-2);
  font-size: 0.78rem;
  line-height: 1;
}

.operation-logs-tag-list-danger {
  margin-top: 0.2rem;
}

.operation-logs-tag-danger {
  background: var(--operation-logs-danger-bg);
  color: var(--operation-logs-danger-text);
}

.operation-logs-detail-modal {
  display: grid;
  gap: 1rem;
  text-align: left;
}

.operation-logs-detail-modal__header,
.operation-logs-detail-modal__section-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
}

.operation-logs-detail-modal__stats {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.operation-logs-detail-modal__stat {
  border-radius: 18px;
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 84%, transparent);
  padding: 0.85rem 0.95rem;
}

.operation-logs-detail-modal__stat span {
  display: block;
  color: var(--ui-text-3);
  font-size: 0.76rem;
}

.operation-logs-detail-modal__stat strong {
  display: block;
  margin-top: 0.4rem;
  color: var(--ui-text-1);
  font-size: 1.1rem;
}

.operation-logs-detail-modal__section {
  border-radius: 22px;
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent);
  padding: 1rem;
}

.operation-logs-detail-modal__section-title {
  color: var(--ui-text-1);
  font-size: 0.86rem;
  font-weight: 700;
}

.operation-logs-mobile-card {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 86%, transparent);
}

@media (max-width: 1024px) {
  .operation-logs-summary-card {
    min-height: 0;
  }

  .operation-logs-feature-card {
    border-radius: 24px;
  }
}

@media (max-width: 768px) {
  .operation-logs-detail-modal__stats {
    grid-template-columns: 1fr;
  }
}
</style>
