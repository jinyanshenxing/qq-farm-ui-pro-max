<script setup lang="ts">
import type { CopyInteractionOptions } from '@/composables/use-copy-interaction'
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseActionButtons from '@/components/ui/BaseActionButtons.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseBulkActions from '@/components/ui/BaseBulkActions.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'
import BaseChipList from '@/components/ui/BaseChipList.vue'
import BaseDataTable from '@/components/ui/BaseDataTable.vue'
import BaseDataTableHead from '@/components/ui/BaseDataTableHead.vue'
import BaseDataTableSelectionCell from '@/components/ui/BaseDataTableSelectionCell.vue'
import BaseDataTableSelectionHeader from '@/components/ui/BaseDataTableSelectionHeader.vue'
import BaseDataTableStateRow from '@/components/ui/BaseDataTableStateRow.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import BaseFilterFields from '@/components/ui/BaseFilterFields.vue'
import BaseHistorySectionLayout from '@/components/ui/BaseHistorySectionLayout.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseManagementPageScaffold from '@/components/ui/BaseManagementPageScaffold.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSelectionSummary from '@/components/ui/BaseSelectionSummary.vue'
import BaseStatCard from '@/components/ui/BaseStatCard.vue'
import BaseStatCardGrid from '@/components/ui/BaseStatCardGrid.vue'
import BaseTableSectionCard from '@/components/ui/BaseTableSectionCard.vue'
import BaseTableToolbar from '@/components/ui/BaseTableToolbar.vue'
import { useCopyInteraction } from '@/composables/use-copy-interaction'
import { useToastStore } from '@/stores/toast'
import { createActionButton, createActionButtons, createButtonField, createChip, createChips, createFilterFields, createHistoryHighlight, createHistoryMetric, createHistoryMetrics, createHistoryPanel, createHistoryRecentItem, createHistoryRecentItems, createInputField, createPageHeaderText, createSelectField, createStatCard, createStatCards } from '@/utils/management-schema'
import { localizeRuntimeText } from '@/utils/runtime-text'

interface User {
  username: string
  role: string
  status?: string
  cardCode?: string | null
  maxAccounts?: number
  accountCount?: number
  card: {
    type: string
    expiresAt: number | null
    enabled: boolean
  } | null
}

interface BoundAccountItem {
  id: string
  name?: string
  nick?: string
  uin?: string | number
  platform?: string
  accountZone?: string
  username?: string
  running?: boolean
  connected?: boolean
}

type ActionHistoryStatus = 'success' | 'warning' | 'error'

interface ActionHistoryItem {
  id: string
  actionLabel: string
  status: ActionHistoryStatus
  timestamp: number
  totalCount: number
  successCount: number
  failedCount: number
  affectedNames: string[]
  failedNames: string[]
  detailLines?: string[]
  pendingSync?: boolean
}

const ACTION_HISTORY_STORAGE_KEY = 'users_action_history_v1'
const ACTION_HISTORY_LIMIT = 24
const ACTION_HISTORY_SCOPE = 'users'

type RoleFilter = 'all' | 'admin' | 'user'
type StatusFilter = 'all' | 'active' | 'expired' | 'banned' | 'permanent'
type CardFilter = 'all' | 'trial' | 'standard' | 'permanent' | 'none'
type BatchAction = 'enable' | 'ban' | 'delete' | 'trial-renew' | ''
type HistoryStatusFilter = 'all' | ActionHistoryStatus
type HistoryTypeFilter = 'all' | 'create' | 'edit' | 'card' | 'ownership' | 'runtime' | 'delete' | 'batch'

const users = ref<User[]>([])
const boundAccounts = ref<BoundAccountItem[]>([])
const loading = ref(false)
const toast = useToastStore()
const router = useRouter()
const currentUsername = ref('')
const selectedUsers = ref<string[]>([])
const searchKeyword = ref('')
const roleFilter = ref<RoleFilter>('all')
const statusFilter = ref<StatusFilter>('all')
const cardFilter = ref<CardFilter>('all')

const showCreateModal = ref(false)
const createLoading = ref(false)
const createError = ref('')
const newUsername = ref('')
const newPassword = ref('')
const newCardCode = ref('')

const showEditModal = ref(false)
const editingUser = ref<User | null>(null)
const editUsername = ref('')
const newExpiryDate = ref('')
const newExpiryTime = ref('23:59')
const newEnabled = ref(true)
const editRole = ref<'admin' | 'user'>('user')
const editPassword = ref('')
const editCardCode = ref('')
const isPermanent = ref(false)
const actionLoading = ref(false)
const actionError = ref('')

const pendingDeleteUsername = ref('')
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)
const activeUserActionMenu = ref('')

const batchAction = ref<BatchAction>('')
const batchActionLabel = ref('')
const showBatchConfirm = ref(false)
const batchActionLoading = ref(false)
const showBatchFailureModal = ref(false)
const batchFailureTitle = ref('')
const batchFailureItems = ref<string[]>([])
const showUserAccountsDrawer = ref(false)
const drawerUser = ref<User | null>(null)
const drawerRuntimeActionId = ref('')
const actionHistory = ref<ActionHistoryItem[]>([])
const { copiedHistoryId, copiedControlKey, copyText: copyWithFeedback } = useCopyInteraction()
const historyKeyword = ref('')
const historyStatusFilter = ref<HistoryStatusFilter>('all')
const historyTypeFilter = ref<HistoryTypeFilter>('all')

const roleOptions = [
  { label: '全部角色', value: 'all' },
  { label: '管理员', value: 'admin' },
  { label: '普通用户', value: 'user' },
]

const editRoleOptions = [
  { label: '管理员', value: 'admin' },
  { label: '普通用户', value: 'user' },
]

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '正常', value: 'active' },
  { label: '已过期', value: 'expired' },
  { label: '已封禁', value: 'banned' },
  { label: '永久', value: 'permanent' },
]

const cardOptions = [
  { label: '全部卡型', value: 'all' },
  { label: '体验卡', value: 'trial' },
  { label: '常规卡', value: 'standard' },
  { label: '永久卡', value: 'permanent' },
  { label: '无卡密', value: 'none' },
]

const historyStatusOptions = [
  { label: '全部结果', value: 'all' },
  { label: '成功', value: 'success' },
  { label: '部分失败', value: 'warning' },
  { label: '失败', value: 'error' },
]

const historyTypeOptions = [
  { label: '全部动作', value: 'all' },
  { label: '新增用户', value: 'create' },
  { label: '编辑用户', value: 'edit' },
  { label: '卡密 / 续费', value: 'card' },
  { label: '归属解绑', value: 'ownership' },
  { label: '关联账号启停', value: 'runtime' },
  { label: '删除', value: 'delete' },
  { label: '批量处理', value: 'batch' },
]

async function loadUsers() {
  try {
    currentUsername.value = JSON.parse(localStorage.getItem('current_user') || 'null')?.username || ''
  }
  catch {
    currentUsername.value = ''
  }
  loading.value = true
  try {
    const [userRes, accountRes] = await Promise.all([
      api.get('/api/users'),
      api.get('/api/accounts'),
    ])
    const rawUsers = userRes.data.users || []
    const accounts = accountRes.data?.data?.accounts || []
    boundAccounts.value = accounts
    users.value = rawUsers.map((user: User) => ({
      ...user,
      accountCount: accounts.filter((account: any) => String(account?.username || '') === user.username).length,
    }))
  }
  finally {
    loading.value = false
  }
}

function normalizeActionHistoryItem(raw: unknown): ActionHistoryItem | null {
  if (!raw || typeof raw !== 'object')
    return null

  const item = raw as Record<string, any>
  const id = String(item.id || '').trim()
  if (!id)
    return null

  const totalCount = Math.max(Number(item.totalCount) || 0, 0)
  const failedCount = Math.max(Number(item.failedCount) || 0, 0)
  const successCount = Math.max(Number(item.successCount) || Math.max(totalCount - failedCount, 0), 0)
  const status = item.status === 'warning' || item.status === 'error' || item.status === 'success'
    ? item.status
    : resolveActionHistoryStatus(successCount, failedCount)

  return {
    id,
    actionLabel: String(item.actionLabel || '').trim() || '未命名操作',
    status,
    timestamp: Number(item.timestamp) || Date.now(),
    totalCount: totalCount || Math.max(successCount + failedCount, 1),
    successCount,
    failedCount,
    affectedNames: Array.isArray(item.affectedNames) ? item.affectedNames.map((name: unknown) => String(name || '').trim()).filter(Boolean).slice(0, 6) : [],
    failedNames: Array.isArray(item.failedNames) ? item.failedNames.map((name: unknown) => String(name || '').trim()).filter(Boolean).slice(0, 6) : [],
    detailLines: Array.isArray(item.detailLines) ? item.detailLines.map((line: unknown) => String(line || '').trim()).filter(Boolean).slice(0, 6) : [],
    pendingSync: Boolean(item.pendingSync),
  }
}

function readLocalActionHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(ACTION_HISTORY_STORAGE_KEY) || '[]')
    return Array.isArray(raw)
      ? raw.map(normalizeActionHistoryItem).filter((item): item is ActionHistoryItem => !!item)
      : []
  }
  catch {
    return []
  }
}

function persistActionHistory() {
  localStorage.setItem(ACTION_HISTORY_STORAGE_KEY, JSON.stringify(actionHistory.value))
}

function mergeActionHistoryItems(...groups: ActionHistoryItem[][]) {
  const map = new Map<string, ActionHistoryItem>()
  for (const group of groups) {
    for (const item of group) {
      if (!item?.id)
        continue
      const existing = map.get(item.id)
      if (!existing || item.timestamp >= existing.timestamp)
        map.set(item.id, item)
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, ACTION_HISTORY_LIMIT)
}

function markActionHistorySynced(entryId: string) {
  let changed = false
  actionHistory.value = actionHistory.value.map((item) => {
    if (item.id !== entryId || !item.pendingSync)
      return item
    changed = true
    return { ...item, pendingSync: false }
  })
  if (changed)
    persistActionHistory()
}

async function syncActionHistoryEntry(entry: ActionHistoryItem) {
  try {
    await api.post('/api/admin-operation-logs', {
      id: entry.id,
      scope: ACTION_HISTORY_SCOPE,
      actionLabel: entry.actionLabel,
      status: entry.status,
      totalCount: entry.totalCount,
      successCount: entry.successCount,
      failedCount: entry.failedCount,
      affectedNames: entry.affectedNames,
      failedNames: entry.failedNames,
      detailLines: entry.detailLines || [],
    })
    markActionHistorySynced(entry.id)
    return true
  }
  catch {
    return false
  }
}

async function syncPendingActionHistory(items: ActionHistoryItem[]) {
  for (const item of items) {
    if (!item.pendingSync)
      continue
    await syncActionHistoryEntry(item)
  }
}

async function loadActionHistory() {
  const localItems = readLocalActionHistory()
  actionHistory.value = localItems
  try {
    const response = await api.get('/api/admin-operation-logs', {
      params: {
        scope: ACTION_HISTORY_SCOPE,
        limit: ACTION_HISTORY_LIMIT,
      },
    })
    const remoteItems = Array.isArray(response.data?.data?.items)
      ? response.data.data.items.map(normalizeActionHistoryItem).filter((item: ActionHistoryItem | null): item is ActionHistoryItem => !!item)
      : []
    actionHistory.value = mergeActionHistoryItems(remoteItems, localItems.filter(item => item.pendingSync))
    persistActionHistory()
    void syncPendingActionHistory(localItems)
  }
  catch {
    actionHistory.value = localItems
  }
}

function resolveActionHistoryStatus(successCount: number, failedCount: number): ActionHistoryStatus {
  if (successCount > 0 && failedCount === 0)
    return 'success'
  if (successCount > 0)
    return 'warning'
  return 'error'
}

function pushActionHistory(actionLabel: string, affectedNames: string[], failedNames: string[] = [], detailLines: string[] = []) {
  const entry: ActionHistoryItem = {
    id: `${actionLabel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actionLabel,
    status: resolveActionHistoryStatus(affectedNames.length - failedNames.length, failedNames.length),
    timestamp: Date.now(),
    totalCount: affectedNames.length,
    successCount: Math.max(affectedNames.length - failedNames.length, 0),
    failedCount: failedNames.length,
    affectedNames: affectedNames.slice(0, 6),
    failedNames: failedNames.slice(0, 6),
    detailLines: detailLines.filter(Boolean).slice(0, 6),
    pendingSync: true,
  }
  actionHistory.value = mergeActionHistoryItems([entry], actionHistory.value)
  persistActionHistory()
  void syncActionHistoryEntry(entry)
}

async function clearActionHistory() {
  const previous = [...actionHistory.value]
  actionHistory.value = []
  persistActionHistory()
  try {
    await api.delete('/api/admin-operation-logs', {
      params: {
        scope: ACTION_HISTORY_SCOPE,
      },
    })
    toast.success('最近操作记录已清空')
  }
  catch {
    actionHistory.value = previous
    persistActionHistory()
    toast.error('清空失败，请稍后重试')
  }
}

function resetCreateForm() {
  newUsername.value = ''
  newPassword.value = ''
  newCardCode.value = ''
  createError.value = ''
}

function openCreateModal() {
  resetCreateForm()
  showCreateModal.value = true
}

async function createUser() {
  createLoading.value = true
  createError.value = ''
  try {
    const submittedUsername = newUsername.value.trim()
    await api.post('/api/users', {
      username: submittedUsername,
      password: newPassword.value,
      cardCode: newCardCode.value.trim(),
    })
    showCreateModal.value = false
    resetCreateForm()
    await loadUsers()
    const createdUser = users.value.find(user => user.username === submittedUsername)
    pushActionHistory('新增用户', [submittedUsername], [], buildCreatedUserDetailLines(createdUser))
    toast.success('用户已创建')
  }
  catch (e: any) {
    createError.value = localizeRuntimeText(e.response?.data?.error || e.message || '创建失败')
  }
  finally {
    createLoading.value = false
  }
}

function toggleSelectAll() {
  const visibleUsers = users.value.filter(user => matchUserFilters(user))
  if (selectedUsers.value.length === visibleUsers.length) {
    selectedUsers.value = []
  }
  else {
    selectedUsers.value = visibleUsers.map(user => user.username)
  }
}

function openEditModal(user: User) {
  activeUserActionMenu.value = ''
  editingUser.value = user
  editUsername.value = user.username
  newEnabled.value = user.card?.enabled !== false
  editRole.value = user.role === 'admin' ? 'admin' : 'user'
  editPassword.value = ''
  editCardCode.value = ''

  if (user.card?.expiresAt) {
    const date = new Date(user.card.expiresAt)
    newExpiryDate.value = formatDateInputValue(date)
    newExpiryTime.value = date.toTimeString().slice(0, 5)
    isPermanent.value = false
  }
  else {
    isPermanent.value = true
    newExpiryDate.value = ''
    newExpiryTime.value = '23:59'
  }

  showEditModal.value = true
  actionError.value = ''
}

async function saveEdit() {
  if (!editingUser.value)
    return

  actionLoading.value = true
  actionError.value = ''

  try {
    const originalUser = editingUser.value
    const nextUsername = editUsername.value.trim() || editingUser.value.username
    const nextCardCode = editCardCode.value.trim()
    const passwordChanged = !!editPassword.value.trim()

    if (!nextCardCode && !isPermanent.value && !newExpiryDate.value) {
      actionError.value = '请选择到期日期'
      return
    }
    const expiresAt = isPermanent.value
      ? null
      : new Date(`${newExpiryDate.value}T${newExpiryTime.value}:00`).getTime()

    await api.put(`/api/users/${editingUser.value.username}`, {
      nextUsername: editUsername.value.trim(),
      expiresAt: nextCardCode ? undefined : expiresAt,
      enabled: nextCardCode ? undefined : newEnabled.value,
      role: editRole.value,
      password: editPassword.value.trim() || undefined,
    })

    if (nextCardCode) {
      await api.post(`/api/users/${nextUsername}/renew`, {
        cardCode: nextCardCode,
      })
      if (!newEnabled.value) {
        await api.put(`/api/users/${nextUsername}`, {
          enabled: false,
        })
      }
    }

    showEditModal.value = false
    await loadUsers()
    const updatedUser = users.value.find(user => user.username === nextUsername)
    const detailLines = buildUserChangeDetailLines(originalUser, updatedUser, {
      passwordChanged,
      cardChanged: !!nextCardCode,
    })
    pushActionHistory(
      nextCardCode ? '编辑用户并换绑卡密' : '编辑用户',
      [nextUsername],
      [],
      detailLines.length ? detailLines : ['基础配置已重新保存'],
    )
    toast.success(nextCardCode ? '用户信息与卡密已保存' : '用户信息已保存')
  }
  catch (e: any) {
    actionError.value = localizeRuntimeText(e.response?.data?.error || e.message || '保存失败')
  }
  finally {
    actionLoading.value = false
  }
}

function askDeleteUser(username: string) {
  activeUserActionMenu.value = ''
  pendingDeleteUsername.value = username
  showDeleteConfirm.value = true
}

async function confirmDeleteUser() {
  if (!pendingDeleteUsername.value)
    return

  deleteLoading.value = true
  try {
    const username = pendingDeleteUsername.value
    const deletedUser = users.value.find(user => user.username === username)
    await api.delete(`/api/users/${username}`)
    pendingDeleteUsername.value = ''
    showDeleteConfirm.value = false
    selectedUsers.value = selectedUsers.value.filter(item => item !== username)
    await loadUsers()
    pushActionHistory('删除用户', [username], [], buildDeletedUserDetailLines(deletedUser))
    toast.success('用户已删除')
  }
  finally {
    deleteLoading.value = false
  }
}

async function handleTrialRenew(username: string) {
  activeUserActionMenu.value = ''
  const originalUser = users.value.find(user => user.username === username)
  await api.post(`/api/users/${username}/trial-renew`)
  await loadUsers()
  const renewedUser = users.value.find(user => user.username === username)
  const detailLines = buildUserChangeDetailLines(originalUser, renewedUser)
  pushActionHistory('续费体验卡', [username], [], detailLines.length ? detailLines : ['体验卡有效期已顺延'])
  toast.success(`已为 ${username} 续费体验卡`)
}

function openUserAccountsDrawer(user: User) {
  activeUserActionMenu.value = ''
  drawerUser.value = user
  showUserAccountsDrawer.value = true
}

function closeUserAccountsDrawer() {
  showUserAccountsDrawer.value = false
}

type CopyTextOptions = CopyInteractionOptions

async function copyText(text: string, successMessage: string, options: CopyTextOptions = {}) {
  await copyWithFeedback(text, successMessage, options)
}

function exportTextFile(content: string, filename: string, successMessage: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
  toast.success(successMessage)
}

async function openAccountFromDrawer(account: BoundAccountItem) {
  const nextAccountId = String(account.id || '').trim()
  localStorage.setItem('current_account_id', nextAccountId)
  try {
    await api.post('/api/account-selection', {
      currentAccountId: nextAccountId,
    })
  }
  catch {
    // 切页后由账号页继续用本地缓存兜底
  }
  router.push('/accounts')
}

async function unassignDrawerAccount(account: BoundAccountItem) {
  const label = account.name || account.nick || account.id
  const ownerLabel = String(account.username || drawerUser.value?.username || '').trim() || '未归属 / 系统账号'
  await api.post('/api/accounts', {
    id: account.id,
    username: '',
    name: account.name || account.nick || `账号${account.id}`,
  })
  await loadUsers()
  if (drawerUser.value) {
    drawerUser.value = users.value.find(user => user.username === drawerUser.value?.username) || drawerUser.value
  }
  pushActionHistory('取消账号归属', [label], [], [`归属：${ownerLabel} -> 未归属 / 系统账号`])
  toast.success(`已取消 ${label} 的归属`)
}

async function toggleDrawerAccountRuntime(account: BoundAccountItem) {
  const label = account.name || account.nick || account.id
  drawerRuntimeActionId.value = String(account.id)
  try {
    if (account.running || account.connected) {
      await api.post(`/api/accounts/${account.id}/stop`)
      pushActionHistory('停止关联账号', [label], [], [`运行状态：${formatAccountState(account)} -> 已停止`])
      toast.success(`已停止 ${label}`)
    }
    else {
      await api.post(`/api/accounts/${account.id}/start`)
      pushActionHistory('启动关联账号', [label], [], [`运行状态：${formatAccountState(account)} -> 启动中`])
      toast.success(`已启动 ${label}`)
    }
    await loadUsers()
  }
  finally {
    drawerRuntimeActionId.value = ''
  }
}

function toggleUserActionMenu(username: string) {
  activeUserActionMenu.value = activeUserActionMenu.value === username ? '' : username
}

function closeUserActionMenu() {
  activeUserActionMenu.value = ''
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.user-action-menu'))
    closeUserActionMenu()
}

function formatCardType(type: string) {
  const typeMap: Record<string, string> = {
    D: '天卡',
    W: '周卡',
    M: '月卡',
    F: '永久卡',
    T: '体验卡',
  }
  return typeMap[type] || type
}

function formatDateInputValue(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatRoleLabel(role: string) {
  return role === 'admin' ? '管理员' : '普通用户'
}

function formatExpiry(expiresAt: number | null) {
  if (!expiresAt)
    return '永久'
  const date = new Date(expiresAt)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatHistoryDateTime(value: number | null | undefined, fallback = '未设置') {
  if (value === undefined)
    return fallback
  if (!value)
    return '永久'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatUserExpiryForHistory(user?: User | null) {
  if (!user?.card)
    return '未绑定'
  return formatHistoryDateTime(user.card.expiresAt)
}

function pushChangeDetail(lines: string[], label: string, before: string | number | null | undefined, after: string | number | null | undefined) {
  const previousLabel = String(before ?? '').trim() || '未设置'
  const nextLabel = String(after ?? '').trim() || '未设置'
  if (previousLabel !== nextLabel)
    lines.push(`${label}：${previousLabel} -> ${nextLabel}`)
}

function buildCreatedUserDetailLines(user?: User) {
  if (!user)
    return ['新用户已创建']

  const lines = [
    `角色：${formatRoleLabel(user.role)}`,
    `状态：${resolveUserState(user).label}`,
  ]
  if (user.card) {
    lines.push(`卡型：${formatCardType(user.card.type)}`)
    lines.push(`到期时间：${formatUserExpiryForHistory(user)}`)
  }
  if (user.maxAccounts !== undefined)
    lines.push(`账号额度：${user.maxAccounts}`)
  return lines.slice(0, 6)
}

function buildDeletedUserDetailLines(user?: User) {
  if (!user)
    return []
  return [
    `角色：${formatRoleLabel(user.role)}`,
    `删除前状态：${resolveUserState(user).label}`,
  ]
}

function buildUserChangeDetailLines(
  before: User | undefined | null,
  after: User | undefined | null,
  options: {
    passwordChanged?: boolean
    cardChanged?: boolean
  } = {},
) {
  const lines: string[] = []

  if (!before && after)
    return buildCreatedUserDetailLines(after)

  if (!before || !after)
    return lines

  pushChangeDetail(lines, '用户名', before.username, after.username)
  pushChangeDetail(lines, '角色', formatRoleLabel(before.role), formatRoleLabel(after.role))
  pushChangeDetail(lines, '状态', resolveUserState(before).label, resolveUserState(after).label)
  pushChangeDetail(lines, '到期时间', formatUserExpiryForHistory(before), formatUserExpiryForHistory(after))
  pushChangeDetail(
    lines,
    '卡型',
    before.card ? formatCardType(before.card.type) : '未绑卡',
    after.card ? formatCardType(after.card.type) : '未绑卡',
  )
  pushChangeDetail(lines, '账号额度', before.maxAccounts ?? '未设置', after.maxAccounts ?? '未设置')
  if (options.cardChanged)
    lines.push('卡密：已换绑并重新同步权益')
  if (options.passwordChanged)
    lines.push('密码：已重置')
  return lines.slice(0, 6)
}

function formatRemainingDays(expiresAt: number | null) {
  if (!expiresAt)
    return '永久'
  const diff = expiresAt - Date.now()
  if (diff <= 0)
    return '已过期'
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000))
  return `剩余 ${days} 天`
}

function formatAccountPlatform(platform?: string) {
  const raw = String(platform || '').trim().toLowerCase()
  if (raw === 'qq')
    return 'QQ'
  if (raw === 'wx_ipad')
    return 'iPad 微信'
  if (raw === 'wx_car')
    return '车机微信'
  if (raw.startsWith('wx'))
    return '微信'
  return '未知平台'
}

function formatAccountZone(zone?: string, platform?: string) {
  const raw = String(zone || '').trim().toLowerCase()
  if (raw === 'qq_zone')
    return 'QQ区'
  if (raw === 'wechat_zone')
    return '微信区'
  return formatAccountPlatform(platform).includes('QQ') ? 'QQ区' : '微信区'
}

function formatAccountState(account: BoundAccountItem) {
  if (account.connected)
    return '在线'
  if (account.running)
    return '启动中'
  return '已停止'
}

function resolveHistoryType(actionLabel: string): HistoryTypeFilter {
  const label = String(actionLabel || '').trim()
  if (!label)
    return 'edit'
  if (label.includes('批量'))
    return 'batch'
  if (label.includes('新增用户'))
    return 'create'
  if (label.includes('续费') || label.includes('卡密'))
    return 'card'
  if (label.includes('取消账号归属'))
    return 'ownership'
  if (label.includes('启动关联账号') || label.includes('停止关联账号'))
    return 'runtime'
  if (label.includes('删除'))
    return 'delete'
  return 'edit'
}

function matchesHistoryKeyword(item: ActionHistoryItem, keyword: string) {
  if (!keyword)
    return true
  return [
    item.actionLabel,
    ...item.affectedNames,
    ...item.failedNames,
    ...(item.detailLines || []),
  ].join(' ').toLowerCase().includes(keyword)
}

function buildActionResultMessage(item: ActionHistoryItem) {
  const parts = []
  if (item.successCount > 0)
    parts.push(`成功 ${item.successCount} 项`)
  if (item.failedCount > 0)
    parts.push(`失败 ${item.failedCount} 项${item.failedNames.length ? `（${item.failedNames.join('、')}）` : ''}`)
  return `${item.actionLabel}完成${parts.length ? `，${parts.join('，')}` : ''}`
}

function formatActionTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function buildActionCopyText(item: ActionHistoryItem) {
  return [
    `${item.actionLabel} · ${formatActionTime(item.timestamp)}`,
    buildActionResultMessage(item),
    ...(item.detailLines?.length ? ['', ...item.detailLines.map(line => `- ${line}`)] : []),
  ].join('\n')
}

function copyFailureItems() {
  if (!batchFailureItems.value.length) {
    toast.warning('暂无失败清单')
    return
  }
  void copyText(batchFailureItems.value.join('\n'), '失败清单已复制', {
    controlKey: 'failure-items',
    detail: '失败明细已写入剪贴板，可直接粘贴给运维或保存排查。',
  })
}

function exportFailureItems() {
  if (!batchFailureItems.value.length) {
    toast.warning('暂无失败清单')
    return
  }
  exportTextFile(batchFailureItems.value.join('\n'), `users-failures-${Date.now()}.txt`, '失败清单已导出')
}

function clearHistoryFilters() {
  historyKeyword.value = ''
  historyStatusFilter.value = 'all'
  historyTypeFilter.value = 'all'
}

function buildBatchActionDetailLines(action: BatchAction) {
  if (action === 'enable')
    return ['目标状态：正常']
  if (action === 'ban')
    return ['目标状态：已封禁']
  if (action === 'trial-renew')
    return ['目标动作：顺延体验卡有效期']
  if (action === 'delete')
    return ['执行方式：逐条删除并汇总失败原因']
  return []
}

function resolveUserState(user: User) {
  const isBanned = user.status === 'banned' || user.card?.enabled === false
  const isExpired = !!user.card?.expiresAt && user.card.expiresAt < Date.now()
  const permanent = !!user.card && !user.card.expiresAt

  if (isBanned) {
    return { key: 'banned', label: '已封禁', badgeTone: 'danger' as const }
  }
  if (isExpired) {
    return { key: 'expired', label: '已过期', badgeTone: 'warning' as const }
  }
  if (permanent) {
    return { key: 'permanent', label: '永久有效', badgeTone: 'info' as const }
  }
  return { key: 'active', label: '正常', badgeTone: 'success' as const }
}

function resolveCardGroup(user: User): CardFilter {
  if (!user.card)
    return 'none'
  if (user.card.type === 'T')
    return 'trial'
  if (!user.card.expiresAt)
    return 'permanent'
  return 'standard'
}

function getRoleBadgeTone(role: string) {
  return role === 'admin' ? 'owner' : 'brand'
}

function getCardBadgeTone(user: User) {
  if (!user.card)
    return 'neutral'
  if (user.card.type === 'T')
    return 'warning'
  if (!user.card.expiresAt)
    return 'info'
  return 'brand'
}

function matchUserFilters(user: User) {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const matchesKeyword = !keyword
    || user.username.toLowerCase().includes(keyword)
    || formatCardType(user.card?.type || '').toLowerCase().includes(keyword)
  const matchesRole = roleFilter.value === 'all' || user.role === roleFilter.value
  const matchesStatus = statusFilter.value === 'all' || resolveUserState(user).key === statusFilter.value
  const matchesCard = cardFilter.value === 'all' || resolveCardGroup(user) === cardFilter.value
  return matchesKeyword && matchesRole && matchesStatus && matchesCard
}

const filteredUsers = computed(() => {
  return users.value.filter(user => matchUserFilters(user))
})

const selectedUsersData = computed(() => {
  const selectedSet = new Set(selectedUsers.value)
  return filteredUsers.value.filter(user => selectedSet.has(user.username))
})

const relatedAccounts = computed(() => {
  const username = String(drawerUser.value?.username || '').trim()
  if (!username)
    return []
  return boundAccounts.value.filter(account => String(account.username || '').trim() === username)
})

const normalizedHistoryKeyword = computed(() => historyKeyword.value.trim().toLowerCase())
const hasActionHistoryFilters = computed(() =>
  !!normalizedHistoryKeyword.value
  || historyStatusFilter.value !== 'all'
  || historyTypeFilter.value !== 'all',
)
const historyToolbarActions = computed(() => {
  if (!hasActionHistoryFilters.value)
    return []
  return createActionButtons([
    createActionButton({
      key: 'clear-history-filters',
      label: '清空日志筛选',
      variant: 'ghost',
      size: 'sm',
      onClick: () => {
        clearHistoryFilters()
      },
    }),
  ])
})
const filteredActionHistory = computed(() => {
  return actionHistory.value.filter((item) => {
    const matchesStatus = historyStatusFilter.value === 'all' || item.status === historyStatusFilter.value
    const matchesType = historyTypeFilter.value === 'all' || resolveHistoryType(item.actionLabel) === historyTypeFilter.value
    return matchesStatus && matchesType && matchesHistoryKeyword(item, normalizedHistoryKeyword.value)
  })
})
const latestActionHistory = computed(() => filteredActionHistory.value[0] || null)
const recentActionHistory = computed(() => filteredActionHistory.value.slice(1, 5))

function copyLatestActionSummary() {
  const latestHistory = latestActionHistory.value
  if (!latestHistory) {
    toast.warning('暂无最近操作记录可复制')
    return
  }
  void copyText(buildActionCopyText(latestHistory), '最近操作摘要已复制', {
    controlKey: 'latest-summary',
    detail: `${latestHistory.actionLabel} · ${formatActionTime(latestHistory.timestamp)}`,
    historyId: latestHistory.id,
  })
}

function copyHistorySummaryItem(item: ActionHistoryItem) {
  void copyText(buildActionCopyText(item), '操作摘要已复制', {
    detail: `${item.actionLabel} · ${formatActionTime(item.timestamp)}`,
    historyId: item.id,
  })
}

function getHistoryCopyLabel(item: ActionHistoryItem) {
  return copiedHistoryId.value === item.id ? '已复制到剪贴板' : '点击复制本次摘要'
}

const canBatchTrialRenew = computed(() => {
  return selectedUsersData.value.length > 0 && selectedUsersData.value.every(user => user.card?.type === 'T')
})

const summary = computed(() => {
  return filteredUsers.value.reduce((acc, user) => {
    acc.total += 1
    if (user.role === 'admin')
      acc.admins += 1
    else
      acc.normal += 1

    const state = resolveUserState(user).key
    if (state === 'active')
      acc.active += 1
    else if (state === 'expired')
      acc.expired += 1
    else if (state === 'banned')
      acc.banned += 1

    if (resolveCardGroup(user) === 'trial')
      acc.trial += 1
    return acc
  }, {
    total: 0,
    admins: 0,
    normal: 0,
    active: 0,
    expired: 0,
    banned: 0,
    trial: 0,
  })
})

const userFilterInputComponent = markRaw(BaseInput)
const userFilterSelectComponent = markRaw(BaseSelect)
const userFilterButtonComponent = markRaw(BaseButton)
const userSelectionSummaryChipComponent = markRaw(BaseSelectionSummary)

const summaryCards = computed(() => createStatCards([
  createStatCard({
    key: 'total',
    label: '筛选结果',
    value: String(summary.value.total),
    description: '当前匹配用户总数',
  }),
  createStatCard({
    key: 'admins',
    label: '管理员',
    value: String(summary.value.admins),
    description: '保留高权限账户',
  }),
  createStatCard({
    key: 'normal',
    label: '普通用户',
    value: String(summary.value.normal),
    description: '体验卡与正式用户',
  }),
  createStatCard({
    key: 'state',
    label: '正常 / 过期 / 封禁',
    value: `${summary.value.active} / ${summary.value.expired} / ${summary.value.banned}`,
    description: '状态分层清晰',
  }),
  createStatCard({
    key: 'trial',
    label: '体验卡用户',
    value: String(summary.value.trial),
    description: '支持批量续费',
  }),
]))

const filterFields = computed(() => createFilterFields([
  createInputField({
    key: 'search',
    component: userFilterInputComponent,
    modelValue: searchKeyword.value,
    label: '搜索用户',
    placeholder: '搜索用户名、卡型',
    clearable: true,
    onUpdate: (value: unknown) => {
      searchKeyword.value = String(value ?? '')
    },
  }),
  createSelectField({
    key: 'role',
    component: userFilterSelectComponent,
    modelValue: roleFilter.value,
    label: '角色筛选',
    options: roleOptions,
    onUpdate: (value: unknown) => {
      roleFilter.value = value as RoleFilter
    },
  }),
  createSelectField({
    key: 'status',
    component: userFilterSelectComponent,
    modelValue: statusFilter.value,
    label: '状态筛选',
    options: statusOptions,
    onUpdate: (value: unknown) => {
      statusFilter.value = value as StatusFilter
    },
  }),
  createSelectField({
    key: 'card',
    component: userFilterSelectComponent,
    modelValue: cardFilter.value,
    label: '卡型筛选',
    options: cardOptions,
    onUpdate: (value: unknown) => {
      cardFilter.value = value as CardFilter
    },
  }),
  createButtonField({
    key: 'reset',
    component: userFilterButtonComponent,
    text: '重置筛选',
    props: {
      variant: 'ghost',
      class: 'w-full xl:w-auto',
    },
    onClick: () => {
      resetFilters()
    },
  }),
]))

const historyFilterFields = computed(() => createFilterFields([
  createInputField({
    key: 'history-keyword',
    component: userFilterInputComponent,
    modelValue: historyKeyword.value,
    label: '筛选日志',
    placeholder: '搜索动作、用户、字段变化',
    clearable: true,
    onUpdate: (value: unknown) => {
      historyKeyword.value = String(value ?? '')
    },
  }),
  createSelectField({
    key: 'history-status',
    component: userFilterSelectComponent,
    modelValue: historyStatusFilter.value,
    label: '结果状态',
    options: historyStatusOptions,
    onUpdate: (value: unknown) => {
      historyStatusFilter.value = value as HistoryStatusFilter
    },
  }),
  createSelectField({
    key: 'history-type',
    component: userFilterSelectComponent,
    modelValue: historyTypeFilter.value,
    label: '动作类型',
    options: historyTypeOptions,
    onUpdate: (value: unknown) => {
      historyTypeFilter.value = value as HistoryTypeFilter
    },
  }),
]))

const toolbarChips = computed(() => createChips([
  createChip({
    key: 'total-users',
    text: `共 ${users.value.length} 个用户`,
  }),
  createChip({
    key: 'visible-users',
    text: `当前展示 ${filteredUsers.value.length} 项`,
  }),
  createChip({
    key: 'selected-users',
    active: true,
    show: selectedUsers.value.length > 0,
    component: userSelectionSummaryChipComponent,
    props: {
      selectedCount: selectedUsers.value.length,
      variant: 'pill',
      class: 'border-0 bg-transparent px-0 py-0 text-inherit',
    },
  }),
]))

const historyChips = computed(() => createChips([
  createChip({
    key: 'history-loaded',
    text: `已载入 ${actionHistory.value.length} 条`,
  }),
  createChip({
    key: 'history-filtered',
    text: `当前命中 ${filteredActionHistory.value.length} 条`,
    active: hasActionHistoryFilters.value,
  }),
  createChip({
    key: 'history-pending-sync',
    text: '有待同步记录',
    active: true,
    show: Boolean(latestActionHistory.value?.pendingSync),
  }),
]))

const historyPanel = createHistoryPanel({
  key: 'users-history-panel',
  title: '最近操作结果',
  description: '最近操作会同步到服务器，并支持按结果、动作类型和关键词快速回看。',
  filteredEmptyText: '当前筛选条件下没有匹配的操作日志，可以调整关键词、结果状态或动作类型。',
  emptyText: '批量启用、封禁、续费或删除后，结果摘要会显示在这里。',
})

const latestHistoryHighlight = computed(() => {
  const latest = latestActionHistory.value
  if (!latest)
    return null

  return createHistoryHighlight({
    key: `users-history-highlight-${latest.id}`,
    title: latest.actionLabel,
    subtitle: formatActionTime(latest.timestamp),
    description: buildActionResultMessage(latest),
    detailLines: latest.detailLines || [],
  })
})

const latestHistoryMetrics = computed(() => {
  const latest = latestActionHistory.value
  if (!latest)
    return []

  return createHistoryMetrics([
    createHistoryMetric({
      key: 'success',
      label: '成功',
      value: latest.successCount,
      class: 'rounded-2xl bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-700 dark:text-emerald-300',
      labelClass: 'text-xs opacity-80',
      valueClass: 'mt-2 text-xl font-semibold',
    }),
    createHistoryMetric({
      key: 'failed',
      label: '失败',
      value: latest.failedCount,
      class: 'rounded-2xl bg-red-500/10 px-4 py-3 text-center text-sm text-red-700 dark:text-red-300',
      labelClass: 'text-xs opacity-80',
      valueClass: 'mt-2 text-xl font-semibold',
    }),
    createHistoryMetric({
      key: 'total',
      label: '涉及',
      value: latest.totalCount,
      class: 'rounded-2xl bg-primary-500/10 px-4 py-3 text-center text-sm text-primary-700 dark:text-primary-300',
      labelClass: 'text-xs opacity-80',
      valueClass: 'mt-2 text-xl font-semibold',
    }),
  ])
})

const recentHistoryCards = computed(() => createHistoryRecentItems(
  recentActionHistory.value.map(item => createHistoryRecentItem({
    key: item.id,
    title: item.actionLabel,
    subtitle: formatActionTime(item.timestamp),
    description: buildActionResultMessage(item),
    detailLines: item.detailLines || [],
    detailLimit: 2,
    copied: copiedHistoryId.value === item.id,
    iconClass: 'i-carbon-copy text-[var(--ui-text-3)]',
    copiedIconClass: 'i-carbon-checkmark-filled user-history-copy-icon scale-110',
    class: 'user-history-item user-history-item-button user-history-item-surface border border-[var(--ui-border-subtle)] rounded-2xl px-4 py-3 text-left transition hover:-translate-y-0.5',
    titleClass: 'glass-text-main text-sm font-semibold',
    subtitleClass: 'glass-text-muted mt-1 text-xs',
    descriptionClass: 'glass-text-muted mt-3 text-xs leading-5',
    detailsClass: 'user-history-details user-history-details-compact mt-3',
    detailLineClass: 'user-history-detail',
    footerText: getHistoryCopyLabel(item),
    footerClass: 'user-history-copy-hint mt-3 text-[11px]',
    footerActiveClass: 'user-history-copy-hint-active',
    onClick: () => {
      copyHistorySummaryItem(item)
    },
  })),
))

const pageHeaderText = createPageHeaderText({
  key: 'users-page-header',
  title: '用户管理',
  description: '设计语言与账号页对齐，补齐用户的查询、筛选、创建、编辑、删除和批量处理能力，并通过全局主题 token 保证深浅模式和多主题的兼容性。',
  titleClass: 'glass-text-main',
  descriptionClass: 'max-w-3xl',
})

const pageHeaderActions = computed(() => createActionButtons([
  createActionButton({
    key: 'refresh-users',
    label: '刷新列表',
    iconClass: 'i-carbon-renew mr-1 text-base',
    variant: 'secondary',
    size: 'sm',
    loading: loading.value,
    onClick: () => {
      loadUsers()
    },
  }),
  createActionButton({
    key: 'create-user',
    label: '新增用户',
    iconClass: 'i-carbon-add mr-1 text-base',
    variant: 'primary',
    size: 'sm',
    onClick: () => {
      openCreateModal()
    },
  }),
]))

const historyHeaderActions = computed(() => createActionButtons([
  createActionButton({
    key: 'copy-latest-summary',
    label: '复制最近摘要',
    active: copiedControlKey.value === 'latest-summary',
    activeLabel: '最近摘要已复制',
    iconClass: 'i-carbon-copy-file mr-1 text-sm',
    activeIconClass: 'i-carbon-checkmark-filled mr-1 text-sm',
    variant: 'outline',
    size: 'sm',
    class: copiedControlKey.value === 'latest-summary' ? 'user-copy-button-active' : '',
    disabled: !latestActionHistory.value,
    onClick: () => {
      copyLatestActionSummary()
    },
  }),
  createActionButton({
    key: 'clear-history',
    label: '清空记录',
    variant: 'ghost',
    size: 'sm',
    disabled: !actionHistory.value.length,
    onClick: () => {
      clearActionHistory()
    },
  }),
]))

const primaryToolbarActions = computed(() => createActionButtons([
  createActionButton({
    key: 'toggle-select-all',
    label: selectedUsers.value.length === filteredUsers.value.length && filteredUsers.value.length ? '取消全选' : '全选当前结果',
    variant: 'secondary',
    size: 'sm',
    onClick: () => {
      toggleSelectAll()
    },
  }),
  createActionButton({
    key: 'batch-enable',
    label: '批量启用',
    variant: 'outline',
    size: 'sm',
    disabled: !selectedUsers.value.length,
    onClick: () => {
      openBatchConfirm('enable')
    },
  }),
  createActionButton({
    key: 'batch-ban',
    label: '批量封禁',
    variant: 'outline',
    size: 'sm',
    disabled: !selectedUsers.value.length,
    onClick: () => {
      openBatchConfirm('ban')
    },
  }),
  createActionButton({
    key: 'batch-trial-renew',
    label: '批量续费体验卡',
    variant: 'outline',
    size: 'sm',
    disabled: !canBatchTrialRenew.value,
    onClick: () => {
      openBatchConfirm('trial-renew')
    },
  }),
  createActionButton({
    key: 'batch-delete',
    label: '批量删除',
    variant: 'danger',
    size: 'sm',
    disabled: !selectedUsers.value.length,
    onClick: () => {
      openBatchConfirm('delete')
    },
  }),
]))

watch([searchKeyword, roleFilter, statusFilter, cardFilter], () => {
  const visibleSet = new Set(filteredUsers.value.map(user => user.username))
  selectedUsers.value = selectedUsers.value.filter(username => visibleSet.has(username))
  activeUserActionMenu.value = ''
})

function resetFilters() {
  searchKeyword.value = ''
  roleFilter.value = 'all'
  statusFilter.value = 'all'
  cardFilter.value = 'all'
}

function openBatchConfirm(action: BatchAction) {
  if (!selectedUsers.value.length)
    return

  batchAction.value = action
  batchActionLabel.value = action === 'enable'
    ? '批量启用'
    : action === 'ban'
      ? '批量封禁'
      : action === 'trial-renew'
        ? '批量续费体验卡'
        : '批量删除'
  showBatchConfirm.value = true
}

async function submitBatchAction() {
  if (!batchAction.value || !selectedUsers.value.length)
    return

  batchActionLoading.value = true
  batchFailureItems.value = []
  try {
    const affectedNames = [...selectedUsers.value]
    const failures: string[] = []
    if (batchAction.value === 'delete') {
      for (const username of selectedUsers.value) {
        try {
          await api.delete(`/api/users/${username}`)
        }
        catch (e: any) {
          failures.push(`${username}: ${localizeRuntimeText(e.response?.data?.error || e.message || '删除失败')}`)
        }
      }
    }
    else if (batchAction.value === 'trial-renew') {
      for (const username of selectedUsers.value) {
        try {
          await api.post(`/api/users/${username}/trial-renew`)
        }
        catch (e: any) {
          failures.push(`${username}: ${localizeRuntimeText(e.response?.data?.error || e.message || '续费失败')}`)
        }
      }
    }
    else {
      const enabled = batchAction.value === 'enable'
      for (const username of selectedUsers.value) {
        try {
          await api.put(`/api/users/${username}`, {
            enabled,
          })
        }
        catch (e: any) {
          failures.push(`${username}: ${localizeRuntimeText(e.response?.data?.error || e.message || '状态更新失败')}`)
        }
      }
    }
    selectedUsers.value = []
    showBatchConfirm.value = false
    await loadUsers()
    pushActionHistory(
      batchActionLabel.value,
      affectedNames,
      failures.map(item => item.split(':')[0] || item),
      buildBatchActionDetailLines(batchAction.value),
    )
    if (failures.length) {
      batchFailureTitle.value = `${batchActionLabel.value}失败明细`
      batchFailureItems.value = failures
      showBatchFailureModal.value = true
      toast.success(`${batchActionLabel.value}已执行，失败 ${failures.length} 项`)
    }
    else {
      toast.success(`${batchActionLabel.value}已完成`)
    }
  }
  finally {
    batchActionLoading.value = false
  }
}

onMounted(() => {
  loadUsers()
  loadActionHistory()
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<template>
  <BaseManagementPageScaffold
    class="users-page"
    :header-text="pageHeaderText"
    :header-actions="pageHeaderActions"
  >
    <template #summary>
      <BaseStatCardGrid class="md:grid-cols-2 xl:grid-cols-5">
        <BaseStatCard
          v-for="card in summaryCards"
          :key="card.key"
          class="user-summary-card"
          :label="card.label"
          :value="card.value"
          :description="card.description"
        />
      </BaseStatCardGrid>
    </template>

    <template #filters>
      <section class="glass-panel ui-filter-panel user-panel">
        <BaseFilterFields class="xl:grid-cols-[2.1fr_1fr_1fr_1fr_auto]" :fields="filterFields" />

        <BaseTableToolbar class="user-toolbar">
          <template #left>
            <BaseChipList :items="toolbarChips" />
          </template>
          <template #right>
            <BaseBulkActions>
              <BaseActionButtons :actions="primaryToolbarActions" />
            </BaseBulkActions>
          </template>
        </BaseTableToolbar>
      </section>
    </template>

    <template #supporting>
      <BaseHistorySectionLayout
        class="user-panel"
        :title="historyPanel.title"
        :description="historyPanel.description"
        :actions="historyHeaderActions"
        :title-chips="historyPanel.titleChips"
        :title-meta="historyPanel.titleMeta"
        :highlight="latestHistoryHighlight"
        :metrics="latestHistoryMetrics"
        :recent-items="recentHistoryCards"
        :show-filtered-empty="actionHistory.length > 0"
        :filtered-empty-text="historyPanel.filteredEmptyText"
        :empty-text="historyPanel.emptyText"
        highlight-section-class="grid gap-3 lg:grid-cols-[1.3fr_0.9fr]"
        :highlight-card-attrs="{
          class: 'user-history-summary-card border border-[var(--ui-border-subtle)] rounded-3xl p-4',
          titleClass: 'glass-text-main text-base font-semibold',
          subtitleClass: 'glass-text-muted mt-1 text-xs',
          descriptionClass: 'glass-text-muted mt-4 text-sm leading-6',
          detailsClass: 'user-history-details mt-4',
          detailLineClass: 'user-history-detail',
        }"
        metrics-class="grid grid-cols-3 gap-3"
        empty-class="glass-text-muted border border-[var(--ui-border-subtle)] rounded-3xl border-dashed px-4 py-5 text-sm"
        recent-grid-class="grid gap-3 2xl:grid-cols-4 lg:grid-cols-2"
        recent-copied-class="user-history-item-copied"
      >
        <BaseFilterFields class="md:grid-cols-[1.35fr_0.8fr_0.8fr]" :fields="historyFilterFields" />

        <BaseTableToolbar class="mt-3">
          <template #left>
            <BaseChipList :items="historyChips" />
          </template>
          <template #right>
            <BaseBulkActions>
              <BaseActionButtons :actions="historyToolbarActions" />
            </BaseBulkActions>
          </template>
        </BaseTableToolbar>
      </BaseHistorySectionLayout>
    </template>

    <template #table>
      <BaseTableSectionCard
        title="用户列表"
        description="表格与账号页保持同样的清晰结构，方便批量治理和状态审查。"
        class="users-table-section"
        header-class="px-6 py-5"
        title-class="glass-text-main text-lg font-semibold"
        description-class="glass-text-muted mt-1 text-sm"
      >
        <template #mobile>
          <div v-if="loading" class="glass-text-muted px-6 pb-6 text-sm md:hidden">
            正在加载用户列表...
          </div>

          <div v-else-if="filteredUsers.length" class="ui-mobile-record-list px-4 pb-4 md:hidden">
            <article
              v-for="user in filteredUsers"
              :key="`mobile-${user.username}`"
              class="ui-mobile-record-card"
              :class="{ 'ui-mobile-record-card--selected': selectedUsers.includes(user.username) }"
            >
              <div class="ui-mobile-record-head">
                <div class="ui-mobile-record-main">
                  <BaseCheckbox
                    class="ui-mobile-record-check"
                    :model-value="selectedUsers"
                    :value="user.username"
                    @update:model-value="selectedUsers = $event as string[]"
                  />
                  <div class="ui-mobile-record-body">
                    <div class="ui-mobile-record-badges">
                      <BaseBadge surface="meta" :tone="getRoleBadgeTone(user.role)">
                        {{ user.role === 'admin' ? '管理员' : '普通用户' }}
                      </BaseBadge>
                      <BaseBadge surface="meta" :tone="getCardBadgeTone(user)">
                        {{ user.card ? formatCardType(user.card.type) : '-' }}
                      </BaseBadge>
                      <BaseBadge surface="meta" :tone="resolveUserState(user).badgeTone">
                        {{ resolveUserState(user).label }}
                      </BaseBadge>
                    </div>
                    <h3 class="ui-mobile-record-title">
                      {{ user.username }}
                    </h3>
                    <p class="ui-mobile-record-subtitle">
                      {{ user.role === 'admin' ? '系统管理账号' : '业务访问账号' }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="ui-mobile-record-grid">
                <div class="ui-mobile-record-field ui-mobile-record-field--full">
                  <div class="ui-mobile-record-label">
                    卡密详情
                  </div>
                  <div class="ui-mobile-record-value">
                    {{ user.cardCode || '未绑定卡密' }}
                  </div>
                  <div class="ui-mobile-record-value ui-mobile-record-value--muted">
                    {{ formatRemainingDays(user.card?.expiresAt ?? null) }}
                  </div>
                </div>
                <div class="ui-mobile-record-field">
                  <div class="ui-mobile-record-label">
                    账号数
                  </div>
                  <div class="ui-mobile-record-value">
                    {{ user.accountCount || 0 }} / {{ user.maxAccounts && user.maxAccounts > 0 ? user.maxAccounts : '不限' }}
                  </div>
                </div>
                <div class="ui-mobile-record-field">
                  <div class="ui-mobile-record-label">
                    到期时间
                  </div>
                  <div class="ui-mobile-record-value">
                    {{ user.card ? formatExpiry(user.card.expiresAt) : '永久' }}
                  </div>
                </div>
              </div>

              <div class="ui-mobile-record-actions">
                <BaseButton variant="outline" size="sm" @click.stop="openEditModal(user)">
                  编辑
                </BaseButton>
                <BaseButton variant="outline" size="sm" @click.stop="openUserAccountsDrawer(user)">
                  关联账号
                </BaseButton>
                <BaseButton
                  v-if="user.card?.type === 'T'"
                  variant="outline"
                  size="sm"
                  @click.stop="handleTrialRenew(user.username)"
                >
                  续费体验卡
                </BaseButton>
                <BaseButton variant="danger" size="sm" @click.stop="askDeleteUser(user.username)">
                  删除
                </BaseButton>
              </div>
            </article>
          </div>

          <BaseEmptyState v-else class="md:hidden" icon="i-carbon-user-multiple">
            <template #title>
              <p class="ui-empty-state__title glass-text-main mt-3 text-sm">
                当前筛选条件下没有用户
              </p>
            </template>
            <template #description>
              <p class="ui-empty-state__desc glass-text-muted mt-2 text-xs">
                可以调整筛选条件，或者创建新的用户账号。
              </p>
            </template>
          </BaseEmptyState>
        </template>

        <BaseDataTable class="custom-scrollbar hidden overflow-x-auto md:block">
          <BaseDataTableHead class="user-table-head">
            <tr>
              <BaseDataTableSelectionHeader
                :checked="selectedUsers.length === filteredUsers.length && filteredUsers.length > 0"
                cell-class="px-6 py-4 text-left"
                @change="toggleSelectAll"
              />
              <th class="glass-text-main px-6 py-4 text-left text-xs font-bold tracking-[0.18em] uppercase">
                用户名
              </th>
              <th class="glass-text-main px-6 py-4 text-left text-xs font-bold tracking-[0.18em] uppercase">
                角色
              </th>
              <th class="glass-text-main px-6 py-4 text-left text-xs font-bold tracking-[0.18em] uppercase">
                卡密类型
              </th>
              <th class="glass-text-main px-6 py-4 text-left text-xs font-bold tracking-[0.18em] uppercase">
                卡密详情
              </th>
              <th class="glass-text-main px-6 py-4 text-left text-xs font-bold tracking-[0.18em] uppercase">
                到期时间
              </th>
              <th class="glass-text-main px-6 py-4 text-left text-xs font-bold tracking-[0.18em] uppercase">
                状态
              </th>
              <th class="glass-text-main px-6 py-4 text-left text-xs font-bold tracking-[0.18em] uppercase">
                操作
              </th>
            </tr>
          </BaseDataTableHead>
          <tbody>
            <tr
              v-for="user in filteredUsers"
              :key="user.username"
              class="user-table-row ui-row-hover"
              :class="{ 'user-table-row-selected ui-row-selected': selectedUsers.includes(user.username) }"
            >
              <BaseDataTableSelectionCell
                :model-value="selectedUsers"
                :value="user.username"
                cell-class="whitespace-nowrap px-6 py-4"
                @update:model-value="selectedUsers = $event as string[]"
              />
              <td class="whitespace-nowrap px-6 py-4">
                <div class="flex items-center gap-3">
                  <div class="user-avatar">
                    <span>{{ user.username[0]?.toUpperCase() }}</span>
                  </div>
                  <div>
                    <div class="glass-text-main text-sm font-bold tracking-[0.01em]">
                      {{ user.username }}
                    </div>
                    <div class="glass-text-muted mt-1 text-xs">
                      {{ user.role === 'admin' ? '系统管理账号' : '业务访问账号' }}
                    </div>
                  </div>
                </div>
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <BaseBadge surface="meta" :tone="getRoleBadgeTone(user.role)">
                  {{ user.role === 'admin' ? '管理员' : '普通用户' }}
                </BaseBadge>
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <BaseBadge surface="meta" :tone="getCardBadgeTone(user)">
                  {{ user.card ? formatCardType(user.card.type) : '-' }}
                </BaseBadge>
              </td>
              <td class="px-6 py-4">
                <div class="space-y-1">
                  <div class="glass-text-main text-sm font-medium">
                    {{ user.cardCode || '未绑定卡密' }}
                  </div>
                  <div class="glass-text-muted text-xs">
                    {{ formatRemainingDays(user.card?.expiresAt ?? null) }}
                  </div>
                  <div class="glass-text-muted text-xs">
                    账号数 {{ user.accountCount || 0 }} / {{ user.maxAccounts && user.maxAccounts > 0 ? user.maxAccounts : '不限' }}
                  </div>
                </div>
              </td>
              <td class="glass-text-main whitespace-nowrap px-6 py-4 text-sm font-medium">
                {{ user.card ? formatExpiry(user.card.expiresAt) : '永久' }}
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <BaseBadge surface="meta" :tone="resolveUserState(user).badgeTone">
                  {{ resolveUserState(user).label }}
                </BaseBadge>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm font-medium">
                <div class="user-action-menu">
                  <button
                    class="user-action-menu__trigger"
                    :class="{ 'user-action-menu__trigger-active': activeUserActionMenu === user.username }"
                    title="更多操作"
                    @click.stop="toggleUserActionMenu(user.username)"
                  >
                    <span class="i-carbon-overflow-menu-horizontal text-base" />
                    <span>更多</span>
                  </button>
                  <div
                    v-if="activeUserActionMenu === user.username"
                    class="user-action-menu__panel"
                    @click.stop
                  >
                    <button class="user-action-menu__item" @click="openEditModal(user)">
                      <span class="i-carbon-edit text-base text-sky-500" />
                      <span>编辑用户</span>
                    </button>
                    <button class="user-action-menu__item" @click="openUserAccountsDrawer(user)">
                      <span class="i-carbon-link text-base text-primary-500" />
                      <span>查看关联账号</span>
                    </button>
                    <button
                      v-if="user.card?.type === 'T'"
                      class="user-action-menu__item"
                      @click="handleTrialRenew(user.username)"
                    >
                      <span class="i-carbon-renew text-base text-amber-500" />
                      <span>续费体验卡</span>
                    </button>
                    <button
                      v-if="user.role !== 'admin'"
                      class="user-action-menu__item user-action-menu__item-danger"
                      @click="askDeleteUser(user.username)"
                    >
                      <span class="i-carbon-trash-can text-base" />
                      <span>删除用户</span>
                    </button>
                  </div>
                </div>
              </td>
            </tr>
            <BaseDataTableStateRow
              v-if="loading"
              :colspan="8"
              loading
              loading-label="正在加载用户数据..."
              cell-class="px-0"
            />
            <BaseDataTableStateRow
              v-else-if="filteredUsers.length === 0"
              :colspan="8"
              icon="i-carbon-user-multiple"
              cell-class="px-0"
              empty-class="px-6 py-16"
            >
              <template #title>
                <p class="ui-empty-state__title glass-text-main text-base font-semibold">
                  暂无匹配用户
                </p>
              </template>
              <template #description>
                <p class="ui-empty-state__desc glass-text-muted mt-2 text-sm">
                  可尝试重置筛选，或直接创建新的业务用户。
                </p>
              </template>
            </BaseDataTableStateRow>
          </tbody>
        </BaseDataTable>
      </BaseTableSectionCard>
    </template>
  </BaseManagementPageScaffold>

  <ConfirmModal
    :show="showCreateModal"
    title="新增用户"
    confirm-text="创建用户"
    cancel-text="取消"
    :loading="createLoading"
    @confirm="createUser"
    @cancel="showCreateModal = false"
  >
    <div class="text-left space-y-4">
      <BaseInput v-model="newUsername" label="用户名" placeholder="4-20 位字母、数字或下划线" />
      <BaseInput v-model="newPassword" label="登录密码" type="password" placeholder="至少 6 位，需包含字母和数字" />
      <BaseInput v-model="newCardCode" label="卡密" placeholder="输入可用卡密以完成创建" />
      <p class="glass-text-muted text-xs leading-5">
        创建用户直接复用现有注册校验链路，确保卡密、到期时间和角色数据一致。
      </p>
      <p v-if="createError" class="text-sm text-[var(--ui-status-danger)] font-medium">
        {{ createError }}
      </p>
    </div>
  </ConfirmModal>

  <ConfirmModal
    :show="showEditModal"
    title="编辑用户"
    confirm-text="保存"
    cancel-text="取消"
    :loading="actionLoading"
    @confirm="saveEdit"
    @cancel="showEditModal = false"
  >
    <div v-if="editingUser" class="text-left space-y-5">
      <div class="glass-text-muted text-sm">
        编辑用户：<span class="glass-text-main text-base font-bold">{{ editingUser.username }}</span>
      </div>

      <BaseInput
        v-model="editUsername"
        label="用户名"
        placeholder="4-20 位字母、数字或下划线"
        :disabled="editingUser.username === currentUsername"
        hint="当前登录账号不支持直接修改用户名，以避免当前会话失效。"
      />

      <BaseSelect
        v-model="editRole"
        label="用户角色"
        :options="editRoleOptions"
      />

      <div class="flex items-center gap-2">
        <input
          id="permanent"
          v-model="isPermanent"
          type="checkbox"
          class="user-form-checkbox h-4 w-4 rounded text-primary-600 focus:ring-primary-500"
        >
        <label for="permanent" class="glass-text-main text-sm font-medium">
          设置为永久
        </label>
      </div>

      <div v-if="!isPermanent" class="grid grid-cols-2 gap-4">
        <BaseInput
          v-model="newExpiryDate"
          type="date"
          label="到期日期"
          required
        />
        <BaseInput
          v-model="newExpiryTime"
          type="time"
          label="到期时间"
          required
        />
      </div>

      <div class="flex items-center gap-2">
        <input
          id="enabled"
          v-model="newEnabled"
          type="checkbox"
          class="user-form-checkbox h-4 w-4 rounded text-primary-600 focus:ring-primary-500"
        >
        <label for="enabled" class="glass-text-main text-sm font-medium">
          启用账号（未勾选则为封禁）
        </label>
      </div>

      <BaseInput
        v-model="editPassword"
        type="password"
        label="重置密码"
        placeholder="留空表示不修改密码"
        hint="输入新密码后将直接覆盖当前登录密码。"
      />

      <BaseInput
        v-model="editCardCode"
        label="补绑 / 更换卡密"
        placeholder="留空表示不修改卡密"
        hint="填写后将按卡密规则覆盖现有卡型、有效期与绑定额度。"
      />

      <p v-if="editCardCode" class="glass-text-muted border border-[var(--ui-border-subtle)] rounded-2xl px-4 py-3 text-xs leading-5">
        已填写新卡密，本次保存将优先按卡密计算新的有效期；上方“永久 / 到期时间”设置不会覆盖卡密结果。
      </p>

      <div v-if="actionError" class="text-sm text-[var(--ui-status-danger)] font-medium">
        {{ actionError }}
      </div>
    </div>
  </ConfirmModal>

  <ConfirmModal
    :show="showDeleteConfirm"
    title="删除用户"
    type="danger"
    confirm-text="确认删除"
    cancel-text="取消"
    :loading="deleteLoading"
    @confirm="confirmDeleteUser"
    @cancel="showDeleteConfirm = false"
  >
    <p class="glass-text-muted text-sm leading-6">
      删除后无法恢复，目标用户为 <span class="glass-text-main font-semibold">{{ pendingDeleteUsername }}</span>。
    </p>
  </ConfirmModal>

  <ConfirmModal
    :show="showBatchConfirm"
    :title="batchActionLabel"
    :type="batchAction === 'delete' ? 'danger' : 'primary'"
    :confirm-text="batchAction === 'delete' ? '确认执行' : '立即执行'"
    cancel-text="取消"
    :loading="batchActionLoading"
    @confirm="submitBatchAction"
    @cancel="showBatchConfirm = false"
  >
    <div class="text-left">
      <p class="glass-text-muted text-sm leading-6">
        将对 <span class="glass-text-main font-semibold">{{ selectedUsers.length }}</span> 个已选用户执行「{{ batchActionLabel }}」。
      </p>
      <p class="glass-text-muted mt-3 text-xs leading-5">
        {{ batchAction === 'trial-renew' ? '仅体验卡用户支持该操作。' : batchAction === 'delete' ? '删除为不可逆操作，请再次确认。' : '操作完成后将自动刷新列表。' }}
      </p>
    </div>
  </ConfirmModal>

  <ConfirmModal
    :show="showBatchFailureModal"
    :title="batchFailureTitle"
    confirm-text="我知道了"
    is-alert
    @confirm="showBatchFailureModal = false"
    @cancel="showBatchFailureModal = false"
  >
    <div class="text-left">
      <p class="glass-text-muted text-sm leading-6">
        以下项目执行失败，请按原因逐项处理：
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <BaseButton
          variant="outline"
          size="sm"
          :class="{ 'user-copy-button-active': copiedControlKey === 'failure-items' }"
          @click="copyFailureItems"
        >
          <span :class="copiedControlKey === 'failure-items' ? 'i-carbon-checkmark-filled mr-1 text-sm' : 'i-carbon-copy mr-1 text-sm'" />
          {{ copiedControlKey === 'failure-items' ? '失败清单已复制' : '复制失败清单' }}
        </BaseButton>
        <BaseButton variant="ghost" size="sm" @click="exportFailureItems">
          导出失败清单
        </BaseButton>
      </div>
      <div class="mt-4 max-h-72 overflow-y-auto space-y-2">
        <div
          v-for="item in batchFailureItems"
          :key="item"
          class="user-failure-item border border-[var(--ui-border-subtle)] rounded-2xl px-4 py-3 text-sm leading-6"
        >
          {{ item }}
        </div>
      </div>
    </div>
  </ConfirmModal>

  <Teleport to="body">
    <div v-if="showUserAccountsDrawer" class="user-drawer-shell">
      <div class="user-drawer-shell__mask" @click="closeUserAccountsDrawer" />
      <aside class="user-drawer-panel">
        <div class="user-drawer-panel__head">
          <div>
            <div class="glass-text-main text-lg font-bold">
              {{ drawerUser?.username }} 的关联账号
            </div>
            <div class="glass-text-muted mt-1 text-sm">
              共 {{ relatedAccounts.length }} 个账号，支持从用户维度快速排查绑定情况。
            </div>
          </div>
          <button class="user-drawer-panel__close" @click="closeUserAccountsDrawer">
            <span class="i-carbon-close text-xl" />
          </button>
        </div>

        <div v-if="relatedAccounts.length" class="user-drawer-panel__body">
          <article
            v-for="account in relatedAccounts"
            :key="account.id"
            class="user-drawer-account"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="glass-text-main text-sm font-semibold">
                  {{ account.name || account.nick || account.id }}
                </div>
                <div class="glass-text-muted mt-1 text-xs">
                  UIN: {{ account.uin || '未绑定' }}
                </div>
              </div>
              <BaseBadge surface="meta" tone="info">
                {{ formatAccountState(account) }}
              </BaseBadge>
            </div>
            <div class="grid grid-cols-2 mt-4 gap-3 text-xs">
              <div class="user-drawer-account__meta">
                <span class="glass-text-muted">区服</span>
                <strong class="glass-text-main">{{ formatAccountZone(account.accountZone, account.platform) }}</strong>
              </div>
              <div class="user-drawer-account__meta">
                <span class="glass-text-muted">平台</span>
                <strong class="glass-text-main">{{ formatAccountPlatform(account.platform) }}</strong>
              </div>
            </div>
            <div class="mt-4 flex flex-wrap gap-2">
              <BaseButton size="sm" variant="outline" @click="openAccountFromDrawer(account)">
                前往账号页
              </BaseButton>
              <BaseButton
                size="sm"
                variant="secondary"
                :loading="drawerRuntimeActionId === String(account.id)"
                @click="toggleDrawerAccountRuntime(account)"
              >
                {{ account.running || account.connected ? '停止账号' : '启动账号' }}
              </BaseButton>
              <BaseButton size="sm" variant="ghost" @click="unassignDrawerAccount(account)">
                取消归属
              </BaseButton>
            </div>
          </article>
        </div>

        <BaseEmptyState
          v-else
          class="user-drawer-panel__empty"
          icon="i-carbon-user-multiple"
          title="暂无关联账号"
          description="当前用户还没有绑定任何账号，可在账号归属页继续分配。"
        />
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.users-page {
  color: var(--ui-text-1);
}

.user-panel,
.user-summary-card {
  border: 1px solid var(--ui-border-subtle);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent),
    color-mix(in srgb, var(--ui-bg-surface) 78%, transparent)
  );
  box-shadow:
    0 18px 50px color-mix(in srgb, var(--ui-shadow-panel) 16%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 28%, transparent);
}

.user-summary-card {
  min-height: 140px;
  padding: 1.25rem;
  border-radius: 1.5rem;
}

.user-toolbar {
  padding-top: 0.75rem;
  border-top: 1px dashed color-mix(in srgb, var(--ui-border-subtle) 88%, transparent);
}

.user-history-details {
  display: grid;
  gap: 0.55rem;
}

.user-history-summary-card,
.user-history-item-surface,
.user-failure-item {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 84%, transparent);
}

.user-form-checkbox {
  border: 1px solid var(--ui-border-subtle) !important;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 90%, transparent) !important;
}

.user-form-checkbox:checked {
  border-color: var(--ui-brand-500) !important;
  background: var(--ui-brand-500) !important;
}

.user-history-details-compact {
  gap: 0.45rem;
}

.user-history-detail {
  position: relative;
  padding-left: 1rem;
  color: var(--ui-text-2);
  font-size: 0.82rem;
  line-height: 1.55;
}

.user-history-detail::before {
  content: '';
  position: absolute;
  top: 0.45rem;
  left: 0;
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-brand-500) 72%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ui-brand-500) 14%, transparent);
}

.user-action-menu {
  position: relative;
  display: inline-flex;
}

.user-action-menu__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.2rem;
  padding: 0 0.85rem;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
  color: var(--ui-text-2);
  font-size: 0.8rem;
  font-weight: 700;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.user-action-menu__trigger:hover,
.user-action-menu__trigger-active {
  transform: translateY(-1px);
  color: var(--ui-brand-700);
  border-color: color-mix(in srgb, var(--ui-brand-500) 24%, var(--ui-border-subtle) 76%);
  background: color-mix(in srgb, var(--ui-brand-500) 10%, transparent);
}

.user-action-menu__panel {
  position: absolute;
  top: calc(100% + 0.55rem);
  right: 0;
  z-index: 20;
  min-width: 11.5rem;
  padding: 0.5rem;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 96%, transparent);
  box-shadow:
    0 20px 45px color-mix(in srgb, var(--ui-shadow-panel) 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 24%, transparent);
  backdrop-filter: blur(18px);
}

.user-action-menu__item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 2.5rem;
  padding: 0 0.8rem;
  border-radius: 0.85rem;
  color: var(--ui-text-1);
  font-size: 0.85rem;
  font-weight: 600;
  text-align: left;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.user-action-menu__item:hover {
  transform: translateX(1px);
  background: color-mix(in srgb, var(--ui-brand-500) 8%, transparent);
}

.user-action-menu__item-danger {
  color: var(--ui-status-danger);
}

.user-action-menu__item-danger:hover {
  background: color-mix(in srgb, var(--ui-status-danger) 10%, transparent);
}

.user-drawer-shell {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  justify-content: flex-end;
}

.user-drawer-shell__mask {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--ui-shadow-panel) 35%, transparent);
  backdrop-filter: blur(8px);
}

.user-drawer-panel {
  position: relative;
  width: min(28rem, 100%);
  height: 100%;
  padding: 1.25rem;
  border-left: 1px solid var(--ui-border-subtle);
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--ui-bg-surface-raised) 95%, transparent),
    color-mix(in srgb, var(--ui-bg-surface) 88%, transparent)
  );
  box-shadow: -18px 0 48px color-mix(in srgb, var(--ui-shadow-panel) 18%, transparent);
  overflow-y: auto;
}

.user-drawer-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.user-drawer-panel__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  color: var(--ui-text-2);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
}

.user-drawer-panel__body {
  margin-top: 1.25rem;
  display: grid;
  gap: 0.9rem;
}

.user-drawer-account {
  padding: 1rem;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 1.2rem;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 84%, transparent);
}

.user-drawer-account__meta {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.75rem 0.85rem;
  border-radius: 1rem;
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent);
}

.user-drawer-panel__empty {
  margin-top: 1.5rem;
  min-height: 14rem;
}

.user-table-head {
  background: color-mix(in srgb, var(--ui-bg-surface) 82%, transparent);
  color: var(--ui-text-2);
}

.user-table-row {
  transition: background-color 180ms ease;
  border-top: 1px solid var(--ui-border-subtle);
}

.user-table-row:hover {
  background: color-mix(in srgb, var(--ui-brand-500) 4%, var(--ui-bg-surface) 96%);
}

.user-table-row-selected {
  background: color-mix(in srgb, var(--ui-brand-500) 8%, var(--ui-bg-surface) 92%);
}

.user-avatar {
  width: 2.9rem;
  height: 2.9rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 1rem;
  background:
    radial-gradient(circle at 30% 20%, color-mix(in srgb, white 45%, transparent), transparent 45%),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--ui-brand-400) 90%, transparent),
      color-mix(in srgb, var(--ui-brand-700) 92%, transparent)
    );
  color: var(--ui-text-on-brand);
  font-size: 1.15rem;
  box-shadow: 0 16px 34px color-mix(in srgb, var(--ui-shadow-panel) 30%, transparent);
}
</style>
