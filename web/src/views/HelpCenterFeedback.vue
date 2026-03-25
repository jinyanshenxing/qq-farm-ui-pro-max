<script setup lang="ts">
import type { HelpCenterFeedbackItem } from '@/types/help-center-observability'
import { computed, onMounted, reactive, ref } from 'vue'
import ContextHelpButton from '@/components/help/ContextHelpButton.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDataTable from '@/components/ui/BaseDataTable.vue'
import BaseDataTableHead from '@/components/ui/BaseDataTableHead.vue'
import BaseDataTableStateRow from '@/components/ui/BaseDataTableStateRow.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseManagementPageScaffold from '@/components/ui/BaseManagementPageScaffold.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseStatCard from '@/components/ui/BaseStatCard.vue'
import BaseStatCardGrid from '@/components/ui/BaseStatCardGrid.vue'
import BaseTableSectionCard from '@/components/ui/BaseTableSectionCard.vue'
import {
  assignHelpCenterFeedback,
  getHelpCenterFeedback,
  linkHelpCenterFeedbackBugReport,
  listHelpCenterFeedback,
  updateHelpCenterFeedback,
} from '@/services/help-center-feedback'
import { useToastStore } from '@/stores/toast'
import { createPageHeaderText } from '@/utils/management-schema'

type FeedbackStatusFilter = 'all' | HelpCenterFeedbackItem['status']
type FeedbackTypeFilter = 'all' | HelpCenterFeedbackItem['feedbackType']
type FeedbackPriorityFilter = 'all' | HelpCenterFeedbackItem['priority']

const toast = useToastStore()

const headerText = createPageHeaderText({
  key: 'help-center-feedback',
  title: '帮助中心反馈闭环',
  description: '管理帮助文档过期、跳转异常、复制体验和步骤缺失反馈，并支持后续分派与关联 BUG 单。',
})

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '待处理', value: 'open' },
  { label: '已分诊', value: 'triaged' },
  { label: '处理中', value: 'in_progress' },
  { label: '已解决', value: 'resolved' },
  { label: '已驳回', value: 'rejected' },
  { label: '已合并到 BUG', value: 'merged_to_bug_report' },
]

const feedbackTypeOptions = [
  { label: '全部类型', value: 'all' },
  { label: '文档已过期', value: 'outdated' },
  { label: '步骤缺失', value: 'missing_step' },
  { label: '描述不清晰', value: 'unclear' },
  { label: '跳转不正确', value: 'wrong_route' },
  { label: '复制体验问题', value: 'copy_issue' },
  { label: '帮助跳转失败', value: 'jump_failed' },
  { label: '其他建议', value: 'other' },
]

const priorityOptions = [
  { label: '全部优先级', value: 'all' },
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '阻断', value: 'critical' },
]

const limitOptions = [
  { label: '最近 12 条', value: 12 },
  { label: '最近 24 条', value: 24 },
  { label: '最近 50 条', value: 50 },
  { label: '最近 100 条', value: 100 },
]

const loading = ref(false)
const detailLoading = ref(false)
const actionLoading = ref(false)
const featureDisabled = ref(false)
const listError = ref('')
const feedbackItems = ref<HelpCenterFeedbackItem[]>([])
const selectedFeedbackId = ref<number | null>(null)
const selectedFeedback = ref<HelpCenterFeedbackItem | null>(null)

const filters = reactive({
  keyword: '',
  status: 'all' as FeedbackStatusFilter,
  feedbackType: 'all' as FeedbackTypeFilter,
  priority: 'all' as FeedbackPriorityFilter,
  assignedTo: '',
  limit: 24,
})

const detailForm = reactive({
  status: 'open' as HelpCenterFeedbackItem['status'],
  priority: 'medium' as HelpCenterFeedbackItem['priority'],
  assignedTo: '',
  ownerTeam: '',
  linkedBugReportNo: '',
})

const summary = computed(() => {
  const items = feedbackItems.value
  return {
    total: items.length,
    open: items.filter(item => item.status === 'open').length,
    inProgress: items.filter(item => item.status === 'in_progress').length,
    resolved: items.filter(item => item.status === 'resolved').length,
    critical: items.filter(item => item.priority === 'critical').length,
    jumpFailed: items.filter(item => item.feedbackType === 'jump_failed').length,
  }
})

const canEditSelectedFeedback = computed(() => !!selectedFeedback.value && !featureDisabled.value)

function extractApiErrorMessage(error: any, fallback: string) {
  return String(error?.response?.data?.error || error?.message || fallback)
}

function syncDetailForm(item: HelpCenterFeedbackItem | null) {
  detailForm.status = item?.status || 'open'
  detailForm.priority = item?.priority || 'medium'
  detailForm.assignedTo = item?.assignedTo || ''
  detailForm.ownerTeam = item?.ownerTeam || ''
  detailForm.linkedBugReportNo = item?.linkedBugReportNo || ''
}

function getStatusLabel(status: HelpCenterFeedbackItem['status']) {
  if (status === 'triaged')
    return '已分诊'
  if (status === 'in_progress')
    return '处理中'
  if (status === 'resolved')
    return '已解决'
  if (status === 'rejected')
    return '已驳回'
  if (status === 'merged_to_bug_report')
    return '已合并到 BUG'
  return '待处理'
}

function getStatusTone(status: HelpCenterFeedbackItem['status']) {
  if (status === 'resolved')
    return 'success'
  if (status === 'rejected')
    return 'danger'
  if (status === 'merged_to_bug_report')
    return 'info'
  if (status === 'triaged' || status === 'in_progress')
    return 'warning'
  return 'neutral'
}

function getPriorityLabel(priority: HelpCenterFeedbackItem['priority']) {
  if (priority === 'critical')
    return '阻断'
  if (priority === 'high')
    return '高'
  if (priority === 'low')
    return '低'
  return '中'
}

function getPriorityTone(priority: HelpCenterFeedbackItem['priority']) {
  if (priority === 'critical' || priority === 'high')
    return 'danger'
  if (priority === 'medium')
    return 'warning'
  return 'neutral'
}

function getFeedbackTypeLabel(type: HelpCenterFeedbackItem['feedbackType']) {
  const matched = feedbackTypeOptions.find(option => option.value === type)
  return matched?.label || '其他建议'
}

function formatDateTime(value?: string) {
  if (!value)
    return '-'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp))
    return value
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(timestamp)
}

function buildListParams() {
  return {
    keyword: filters.keyword.trim() || undefined,
    status: filters.status === 'all' ? undefined : filters.status,
    feedbackType: filters.feedbackType === 'all' ? undefined : filters.feedbackType,
    priority: filters.priority === 'all' ? undefined : filters.priority,
    assignedTo: filters.assignedTo.trim() || undefined,
    limit: filters.limit,
  }
}

async function loadFeedbackList(options: { preserveSelection?: boolean } = {}) {
  loading.value = true
  listError.value = ''
  try {
    const response = await listHelpCenterFeedback(buildListParams())
    featureDisabled.value = false
    feedbackItems.value = response.items || []

    const keepCurrent = options.preserveSelection !== false && selectedFeedbackId.value
      ? feedbackItems.value.find(item => item.id === selectedFeedbackId.value)
      : null
    const nextSelected = keepCurrent || feedbackItems.value[0] || null

    if (nextSelected) {
      await loadFeedbackDetail(nextSelected.id, { silent: true })
    }
    else {
      selectedFeedbackId.value = null
      selectedFeedback.value = null
      syncDetailForm(null)
    }
  }
  catch (error: any) {
    const code = String(error?.response?.data?.code || '')
    if (code === 'help_center_feature_disabled') {
      featureDisabled.value = true
      feedbackItems.value = []
      selectedFeedbackId.value = null
      selectedFeedback.value = null
      syncDetailForm(null)
      return
    }

    listError.value = extractApiErrorMessage(error, '帮助中心反馈加载失败')
    toast.error(listError.value)
  }
  finally {
    loading.value = false
  }
}

function refreshFeedbackList() {
  void loadFeedbackList()
}

async function loadFeedbackDetail(id: number | string, options: { silent?: boolean } = {}) {
  const feedbackId = Number(id) || 0
  if (feedbackId <= 0)
    return

  if (!options.silent)
    detailLoading.value = true

  try {
    const item = await getHelpCenterFeedback(feedbackId)
    selectedFeedbackId.value = item.id
    selectedFeedback.value = item
    syncDetailForm(item)
  }
  catch (error: any) {
    toast.error(extractApiErrorMessage(error, '帮助中心反馈详情加载失败'))
  }
  finally {
    if (!options.silent)
      detailLoading.value = false
  }
}

async function refreshAfterMutation() {
  await loadFeedbackList({ preserveSelection: true })
}

async function saveFeedbackState() {
  if (!selectedFeedbackId.value)
    return

  actionLoading.value = true
  try {
    await updateHelpCenterFeedback(selectedFeedbackId.value, {
      status: detailForm.status,
      priority: detailForm.priority,
      assignedTo: detailForm.assignedTo,
      ownerTeam: detailForm.ownerTeam,
    })
    toast.success('反馈状态已更新')
    await refreshAfterMutation()
  }
  catch (error: any) {
    toast.error(extractApiErrorMessage(error, '反馈状态更新失败'))
  }
  finally {
    actionLoading.value = false
  }
}

async function assignSelectedFeedback() {
  if (!selectedFeedbackId.value)
    return

  actionLoading.value = true
  try {
    await assignHelpCenterFeedback(selectedFeedbackId.value, {
      assignedTo: detailForm.assignedTo,
      ownerTeam: detailForm.ownerTeam,
      status: detailForm.status === 'in_progress' ? 'in_progress' : 'triaged',
    })
    toast.success('反馈已分派')
    await refreshAfterMutation()
  }
  catch (error: any) {
    toast.error(extractApiErrorMessage(error, '反馈分派失败'))
  }
  finally {
    actionLoading.value = false
  }
}

async function linkSelectedBugReport() {
  if (!selectedFeedbackId.value || !detailForm.linkedBugReportNo.trim())
    return

  actionLoading.value = true
  try {
    await linkHelpCenterFeedbackBugReport(selectedFeedbackId.value, {
      linkedBugReportNo: detailForm.linkedBugReportNo.trim(),
      status: 'merged_to_bug_report',
    })
    toast.success('已关联 BUG 单')
    await refreshAfterMutation()
  }
  catch (error: any) {
    toast.error(extractApiErrorMessage(error, '关联 BUG 单失败'))
  }
  finally {
    actionLoading.value = false
  }
}

async function setSelectedStatus(status: HelpCenterFeedbackItem['status']) {
  if (!selectedFeedbackId.value)
    return

  actionLoading.value = true
  try {
    await updateHelpCenterFeedback(selectedFeedbackId.value, { status })
    toast.success(`反馈已更新为 ${getStatusLabel(status)}`)
    await refreshAfterMutation()
  }
  catch (error: any) {
    toast.error(extractApiErrorMessage(error, '反馈状态更新失败'))
  }
  finally {
    actionLoading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.status = 'all'
  filters.feedbackType = 'all'
  filters.priority = 'all'
  filters.assignedTo = ''
  filters.limit = 24
  void loadFeedbackList({ preserveSelection: false })
}

onMounted(async () => {
  await loadFeedbackList({ preserveSelection: false })
})
</script>

<template>
  <BaseManagementPageScaffold :header-text="headerText">
    <template #header-actions>
      <div class="help-feedback-header-actions">
        <ContextHelpButton
          article="admin-console"
          audience="admin"
          label="查看帮助"
          source-context="help_center_feedback_page"
        />
        <BaseButton variant="primary" :loading="loading" @click="refreshFeedbackList">
          刷新反馈
        </BaseButton>
      </div>
    </template>

    <template #summary>
      <BaseStatCardGrid>
        <BaseStatCard label="当前列表反馈" :value="summary.total" description="当前筛选窗口内已拉取的反馈数量" />
        <BaseStatCard label="待处理" :value="summary.open" description="尚未分派或处理的反馈" />
        <BaseStatCard label="处理中" :value="summary.inProgress" description="已进入修订或排查流程" />
        <BaseStatCard label="已解决" :value="summary.resolved" description="已完成修订或已关闭" />
        <BaseStatCard label="阻断优先级" :value="summary.critical" description="优先级为 critical 的反馈" />
        <BaseStatCard label="跳转失败类" :value="summary.jumpFailed" description="来自上下文帮助链路的失败反馈" />
      </BaseStatCardGrid>
    </template>

    <template #filters>
      <section class="glass-panel help-feedback-filters">
        <div class="help-feedback-filters__grid">
          <BaseInput v-model="filters.keyword" label="关键词" placeholder="搜索文章、段落、提交人、反馈内容" clearable />
          <BaseSelect v-model="filters.status" label="状态" :options="statusOptions" />
          <BaseSelect v-model="filters.feedbackType" label="反馈类型" :options="feedbackTypeOptions" />
          <BaseSelect v-model="filters.priority" label="优先级" :options="priorityOptions" />
          <BaseInput v-model="filters.assignedTo" label="负责人" placeholder="按 assignedTo 过滤" clearable />
          <BaseSelect v-model="filters.limit" label="加载数量" :options="limitOptions" />
        </div>

        <div class="help-feedback-filters__actions">
          <div class="help-feedback-filters__note">
            当前接口默认按最近创建时间倒序返回，便于先处理最新反馈。
          </div>
          <div class="help-feedback-filters__buttons">
            <BaseButton variant="ghost" @click="resetFilters">
              重置筛选
            </BaseButton>
            <BaseButton variant="primary" :loading="loading" @click="refreshFeedbackList">
              应用筛选
            </BaseButton>
          </div>
        </div>
      </section>
    </template>

    <template #supporting>
      <div class="help-feedback-support">
        <BaseTableSectionCard
          title="反馈处理面板"
          :description="featureDisabled ? '帮助中心反馈功能当前处于关闭状态。' : '选中一条反馈后，可直接分派、更新状态，或关联到 BUG 单。'"
        >
          <template v-if="featureDisabled">
            <div class="help-feedback-disabled">
              <p class="glass-text-muted">
                反馈入口已关闭，所以这里暂时不会加载反馈列表。你可以先在“帮助中心可观测性”页打开反馈开关，再回到这里继续处理。
              </p>
              <BaseButton to="/help-center-analytics" variant="primary">
                前往打开反馈开关
              </BaseButton>
            </div>
          </template>

          <template v-else-if="detailLoading">
            <div class="help-feedback-detail-loading">
              正在加载反馈详情...
            </div>
          </template>

          <template v-else-if="selectedFeedback">
            <div class="help-feedback-detail">
              <div class="help-feedback-detail__meta">
                <div>
                  <div class="help-feedback-detail__title">
                    {{ selectedFeedback.articleTitle }}
                  </div>
                  <div class="glass-text-muted text-sm">
                    {{ selectedFeedback.feedbackNo }} · {{ selectedFeedback.articleId }}
                  </div>
                </div>
                <div class="help-feedback-detail__meta-badges">
                  <BaseBadge surface="meta" :tone="getStatusTone(selectedFeedback.status) as any">
                    {{ getStatusLabel(selectedFeedback.status) }}
                  </BaseBadge>
                  <BaseBadge surface="meta" :tone="getPriorityTone(selectedFeedback.priority) as any">
                    {{ getPriorityLabel(selectedFeedback.priority) }}
                  </BaseBadge>
                  <BaseBadge surface="meta" tone="brand">
                    {{ getFeedbackTypeLabel(selectedFeedback.feedbackType) }}
                  </BaseBadge>
                </div>
              </div>

              <div class="help-feedback-detail__grid">
                <BaseSelect v-model="detailForm.status" label="状态" :options="statusOptions.slice(1) as any" />
                <BaseSelect v-model="detailForm.priority" label="优先级" :options="priorityOptions.slice(1) as any" />
                <BaseInput v-model="detailForm.assignedTo" label="负责人" placeholder="例如：产品运营文档负责人" />
                <BaseInput v-model="detailForm.ownerTeam" label="责任组" placeholder="例如：文档治理 / 前端 / 运维" />
                <BaseInput v-model="detailForm.linkedBugReportNo" label="关联 BUG 单号" placeholder="例如：BUG-20260325-001" class="md:col-span-2" />
              </div>

              <div class="help-feedback-detail__content-grid">
                <div class="help-feedback-detail__content-card">
                  <div class="help-feedback-detail__content-title">
                    问题描述
                  </div>
                  <p>{{ selectedFeedback.message || '未填写' }}</p>
                </div>
                <div class="help-feedback-detail__content-card">
                  <div class="help-feedback-detail__content-title">
                    期望行为
                  </div>
                  <p>{{ selectedFeedback.expectedBehavior || '未填写' }}</p>
                </div>
                <div class="help-feedback-detail__content-card">
                  <div class="help-feedback-detail__content-title">
                    实际情况
                  </div>
                  <p>{{ selectedFeedback.actualBehavior || '未填写' }}</p>
                </div>
                <div class="help-feedback-detail__content-card">
                  <div class="help-feedback-detail__content-title">
                    来源信息
                  </div>
                  <p>来源页面：{{ selectedFeedback.sourceRoute || selectedFeedback.sourcePage || '-' }}</p>
                  <p>来源上下文：{{ selectedFeedback.sourceContext || '-' }}</p>
                  <p>提交人：{{ selectedFeedback.username || '未知用户' }} / {{ selectedFeedback.userRole || 'unknown' }}</p>
                  <p>创建时间：{{ formatDateTime(selectedFeedback.createdAt) }}</p>
                  <p>最近跟进：{{ formatDateTime(selectedFeedback.lastFollowUpAt) }}</p>
                </div>
              </div>

              <div class="help-feedback-detail__actions">
                <BaseButton variant="ghost" :loading="actionLoading" :disabled="!canEditSelectedFeedback" @click="setSelectedStatus('resolved')">
                  标记解决
                </BaseButton>
                <BaseButton variant="ghost" :loading="actionLoading" :disabled="!canEditSelectedFeedback" @click="setSelectedStatus('rejected')">
                  驳回
                </BaseButton>
                <BaseButton variant="secondary" :loading="actionLoading" :disabled="!canEditSelectedFeedback" @click="assignSelectedFeedback">
                  分派 / 分诊
                </BaseButton>
                <BaseButton variant="outline" :loading="actionLoading" :disabled="!detailForm.linkedBugReportNo.trim()" @click="linkSelectedBugReport">
                  关联 BUG 单
                </BaseButton>
                <BaseButton variant="primary" :loading="actionLoading" :disabled="!canEditSelectedFeedback" @click="saveFeedbackState">
                  保存变更
                </BaseButton>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="help-feedback-detail-loading">
              当前筛选下还没有可处理的反馈。
            </div>
          </template>
        </BaseTableSectionCard>
      </div>
    </template>

    <template #table>
      <BaseTableSectionCard
        title="反馈列表"
        description="点选任意一条反馈后，右侧处理面板会加载完整上下文。"
      >
        <BaseDataTable table-class="min-w-[1180px]">
          <BaseDataTableHead>
            <tr>
              <th>反馈单</th>
              <th>文档 / 段落</th>
              <th>类型</th>
              <th>状态</th>
              <th>优先级</th>
              <th>负责人</th>
              <th>提交人</th>
              <th>创建时间</th>
            </tr>
          </BaseDataTableHead>
          <tbody>
            <BaseDataTableStateRow v-if="loading && !feedbackItems.length" :colspan="8" loading loading-label="正在加载帮助中心反馈..." />
            <BaseDataTableStateRow v-else-if="listError" :colspan="8" icon="i-carbon-warning">
              {{ listError }}
            </BaseDataTableStateRow>
            <BaseDataTableStateRow v-else-if="!feedbackItems.length" :colspan="8" icon="i-carbon-document-blank">
              当前筛选窗口内还没有帮助中心反馈。
            </BaseDataTableStateRow>
            <tr
              v-for="item in feedbackItems"
              v-else
              :key="item.id"
              class="help-feedback-row"
              :class="{ 'help-feedback-row--active': item.id === selectedFeedbackId }"
              @click="loadFeedbackDetail(item.id)"
            >
              <td>
                <div class="font-semibold">
                  {{ item.feedbackNo }}
                </div>
                <div class="glass-text-muted text-xs">
                  {{ item.message.slice(0, 42) || '无描述' }}
                </div>
              </td>
              <td>
                <div class="font-semibold">
                  {{ item.articleTitle }}
                </div>
                <div class="glass-text-muted text-xs">
                  {{ item.sectionTitle || item.articleId }}
                </div>
              </td>
              <td>
                <BaseBadge surface="meta" tone="brand">
                  {{ getFeedbackTypeLabel(item.feedbackType) }}
                </BaseBadge>
              </td>
              <td>
                <BaseBadge surface="meta" :tone="getStatusTone(item.status) as any">
                  {{ getStatusLabel(item.status) }}
                </BaseBadge>
              </td>
              <td>
                <BaseBadge surface="meta" :tone="getPriorityTone(item.priority) as any">
                  {{ getPriorityLabel(item.priority) }}
                </BaseBadge>
              </td>
              <td>{{ item.assignedTo || '-' }}</td>
              <td>
                <div>{{ item.username || '未知用户' }}</div>
                <div class="glass-text-muted text-xs">
                  {{ item.userRole || '-' }}
                </div>
              </td>
              <td>{{ formatDateTime(item.createdAt) }}</td>
            </tr>
          </tbody>
        </BaseDataTable>
      </BaseTableSectionCard>
    </template>
  </BaseManagementPageScaffold>
</template>

<style scoped>
.help-feedback-header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
}

.help-feedback-filters {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.1rem;
}

.help-feedback-filters__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.9rem;
}

.help-feedback-filters__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
}

.help-feedback-filters__note {
  color: var(--ui-text-2);
  font-size: 0.85rem;
}

.help-feedback-filters__buttons,
.help-feedback-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.help-feedback-support {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.help-feedback-disabled,
.help-feedback-detail-loading {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  color: var(--ui-text-2);
}

.help-feedback-detail {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.help-feedback-detail__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.85rem;
}

.help-feedback-detail__title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--ui-text-1);
}

.help-feedback-detail__meta-badges,
.help-feedback-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.help-feedback-detail__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.9rem;
}

.help-feedback-detail__content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.85rem;
}

.help-feedback-detail__content-card {
  min-height: 0;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--ui-bg-surface) 65%, transparent);
  padding: 0.9rem 1rem;
  color: var(--ui-text-2);
  line-height: 1.7;
}

.help-feedback-detail__content-card p {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.help-feedback-detail__content-title {
  margin-bottom: 0.55rem;
  color: var(--ui-text-1);
  font-size: 0.85rem;
  font-weight: 700;
}

.help-feedback-row {
  cursor: pointer;
  transition:
    background 0.2s ease,
    transform 0.2s ease;
}

.help-feedback-row td {
  border-top: 1px solid var(--ui-border-subtle);
  padding: 0.85rem 0.8rem;
  vertical-align: top;
}

.help-feedback-row:hover {
  background: color-mix(in srgb, var(--ui-brand-500) 7%, transparent);
}

.help-feedback-row--active {
  background: color-mix(in srgb, var(--ui-brand-500) 11%, transparent);
}

@media (max-width: 900px) {
  .help-feedback-filters__actions {
    align-items: stretch;
  }

  .help-feedback-filters__buttons,
  .help-feedback-header-actions,
  .help-feedback-detail__actions {
    width: 100%;
    justify-content: stretch;
  }
}
</style>
