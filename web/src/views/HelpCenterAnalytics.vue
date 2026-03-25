<script setup lang="ts">
import type {
  HelpCenterAnalyticsArticleItem,
  HelpCenterAnalyticsEntryPageItem,
  HelpCenterAnalyticsJumpFailureItem,
  HelpCenterAnalyticsOverview,
  HelpCenterAnalyticsSearchKeywordItem,
  HelpCenterObservabilitySettings,
} from '@/types/help-center-observability'
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
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import BaseTableSectionCard from '@/components/ui/BaseTableSectionCard.vue'
import { helpCategories } from '@/data/help-articles'
import {
  getHelpCenterAnalyticsArticles,
  getHelpCenterAnalyticsEntryPages,
  getHelpCenterAnalyticsJumpFailures,
  getHelpCenterAnalyticsOverview,
  getHelpCenterAnalyticsSearchKeywords,
  getHelpCenterObservabilitySettings,
  saveHelpCenterObservabilitySettings,
} from '@/services/help-center-feedback'
import { useToastStore } from '@/stores/toast'
import { createPageHeaderText } from '@/utils/management-schema'

const toast = useToastStore()

const headerText = createPageHeaderText({
  key: 'help-center-analytics',
  title: '帮助中心可观测性',
  description: '管理埋点采集、反馈闭环与跳转失败统计。默认关闭，不影响当前帮助中心和其他业务功能。',
})

const roleOptions = [
  { label: '全部角色', value: 'all' },
  { label: '管理员', value: 'admin' },
  { label: '普通用户', value: 'user' },
]

const articleSortOptions = [
  { label: '按打开量', value: 'opens' },
  { label: '按复制量', value: 'copies' },
  { label: '按反馈量', value: 'feedbacks' },
  { label: '按跳转失败量', value: 'jump_failures' },
]

const limitOptions = [
  { label: 'Top 10', value: 10 },
  { label: 'Top 20', value: 20 },
  { label: 'Top 50', value: 50 },
]

const categoryOptions = computed(() => ([
  { label: '全部分类', value: 'all' },
  ...helpCategories.map(category => ({
    label: category.name,
    value: category.name,
  })),
]))

const loading = ref(false)
const settingsLoading = ref(false)
const settingsSaving = ref(false)
const overview = ref<HelpCenterAnalyticsOverview>({
  articleOpenCount: 0,
  searchCount: 0,
  copyCount: 0,
  contextHelpOpenCount: 0,
  jumpSuccessRate: 0,
  jumpFailureCount: 0,
  feedbackOpenCount: 0,
})
const articleItems = ref<HelpCenterAnalyticsArticleItem[]>([])
const entryPageItems = ref<HelpCenterAnalyticsEntryPageItem[]>([])
const searchKeywordItems = ref<HelpCenterAnalyticsSearchKeywordItem[]>([])
const jumpFailureItems = ref<HelpCenterAnalyticsJumpFailureItem[]>([])
const analyticsError = ref('')

const filters = reactive({
  dateFrom: defaultDateInput(6),
  dateTo: defaultDateInput(0),
  role: 'all',
  category: 'all',
  articleSortBy: 'opens',
  articleLimit: 10,
  listLimit: 10,
})

const settingsDraft = reactive<HelpCenterObservabilitySettings>({
  telemetryEnabled: false,
  feedbackEnabled: false,
  jumpTracingEnabled: false,
  telemetrySamplingRate: 0,
  batchSize: 20,
  flushIntervalMs: 15000,
  retentionDays: 30,
})
const settingsSnapshot = ref('')

const settingsDirty = computed(() => {
  return JSON.stringify(buildSettingsPayload()) !== settingsSnapshot.value
})

function defaultDateInput(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() - offsetDays)
  return date.toISOString().slice(0, 10)
}

function extractApiErrorMessage(error: any, fallback: string) {
  return String(error?.response?.data?.error || error?.message || fallback)
}

function toPositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  const normalized = Number.parseInt(String(value ?? fallback), 10)
  if (!Number.isFinite(normalized))
    return fallback
  return Math.min(max, Math.max(min, normalized))
}

function toSamplingRate(value: unknown, fallback = 0) {
  const normalized = Number.parseFloat(String(value ?? fallback))
  if (!Number.isFinite(normalized))
    return fallback
  return Math.min(1, Math.max(0, Math.round(normalized * 1000) / 1000))
}

function buildAnalyticsParams(limit?: number) {
  return {
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    role: filters.role === 'all' ? undefined : filters.role,
    category: filters.category === 'all' ? undefined : filters.category,
    limit: limit || undefined,
  }
}

function buildSettingsPayload(): HelpCenterObservabilitySettings {
  return {
    telemetryEnabled: !!settingsDraft.telemetryEnabled,
    feedbackEnabled: !!settingsDraft.feedbackEnabled,
    jumpTracingEnabled: !!settingsDraft.jumpTracingEnabled,
    telemetrySamplingRate: toSamplingRate(settingsDraft.telemetrySamplingRate, 0),
    batchSize: toPositiveInteger(settingsDraft.batchSize, 20, 1, 200),
    flushIntervalMs: toPositiveInteger(settingsDraft.flushIntervalMs, 15000, 1000, 600000),
    retentionDays: toPositiveInteger(settingsDraft.retentionDays, 30, 1, 365),
  }
}

function applySettings(settings: HelpCenterObservabilitySettings) {
  settingsDraft.telemetryEnabled = !!settings.telemetryEnabled
  settingsDraft.feedbackEnabled = !!settings.feedbackEnabled
  settingsDraft.jumpTracingEnabled = !!settings.jumpTracingEnabled
  settingsDraft.telemetrySamplingRate = toSamplingRate(settings.telemetrySamplingRate, 0)
  settingsDraft.batchSize = toPositiveInteger(settings.batchSize, 20, 1, 200)
  settingsDraft.flushIntervalMs = toPositiveInteger(settings.flushIntervalMs, 15000, 1000, 600000)
  settingsDraft.retentionDays = toPositiveInteger(settings.retentionDays, 30, 1, 365)
  settingsSnapshot.value = JSON.stringify(buildSettingsPayload())
}

async function loadAnalytics() {
  loading.value = true
  analyticsError.value = ''
  try {
    const articleParams = {
      ...buildAnalyticsParams(filters.articleLimit),
      sortBy: filters.articleSortBy,
    }
    const listParams = buildAnalyticsParams(filters.listLimit)
    const [
      nextOverview,
      nextArticleItems,
      nextEntryPages,
      nextSearchKeywords,
      nextJumpFailures,
    ] = await Promise.all([
      getHelpCenterAnalyticsOverview(buildAnalyticsParams()),
      getHelpCenterAnalyticsArticles(articleParams),
      getHelpCenterAnalyticsEntryPages(listParams),
      getHelpCenterAnalyticsSearchKeywords(listParams),
      getHelpCenterAnalyticsJumpFailures(listParams),
    ])

    overview.value = nextOverview
    articleItems.value = nextArticleItems
    entryPageItems.value = nextEntryPages
    searchKeywordItems.value = nextSearchKeywords
    jumpFailureItems.value = nextJumpFailures
  }
  catch (error: any) {
    analyticsError.value = extractApiErrorMessage(error, '帮助中心统计加载失败')
    toast.error(analyticsError.value)
  }
  finally {
    loading.value = false
  }
}

async function loadSettings() {
  settingsLoading.value = true
  try {
    const settings = await getHelpCenterObservabilitySettings()
    applySettings(settings)
  }
  catch (error: any) {
    toast.error(extractApiErrorMessage(error, '帮助中心配置加载失败'))
  }
  finally {
    settingsLoading.value = false
  }
}

async function saveSettings() {
  settingsSaving.value = true
  try {
    const nextSettings = await saveHelpCenterObservabilitySettings(buildSettingsPayload())
    applySettings(nextSettings)
    toast.success('帮助中心可观测性配置已保存')
  }
  catch (error: any) {
    toast.error(extractApiErrorMessage(error, '帮助中心配置保存失败'))
  }
  finally {
    settingsSaving.value = false
  }
}

function resetFilters() {
  filters.dateFrom = defaultDateInput(6)
  filters.dateTo = defaultDateInput(0)
  filters.role = 'all'
  filters.category = 'all'
  filters.articleSortBy = 'opens'
  filters.articleLimit = 10
  filters.listLimit = 10
  void loadAnalytics()
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatLatency(value: number) {
  return `${Math.max(0, Math.round(Number(value || 0)))} ms`
}

function formatBooleanLabel(value: boolean) {
  return value ? '已开启' : '已关闭'
}

onMounted(async () => {
  await Promise.all([
    loadAnalytics(),
    loadSettings(),
  ])
})
</script>

<template>
  <BaseManagementPageScaffold :header-text="headerText">
    <template #header-actions>
      <div class="help-observability-header-actions">
        <ContextHelpButton
          article="admin-console"
          audience="admin"
          label="查看帮助"
          source-context="help_center_analytics_page"
        />
        <BaseButton variant="ghost" :loading="settingsLoading" @click="loadSettings">
          刷新配置
        </BaseButton>
        <BaseButton variant="primary" :loading="loading" @click="loadAnalytics">
          刷新统计
        </BaseButton>
      </div>
    </template>

    <template #summary>
      <BaseStatCardGrid>
        <BaseStatCard label="文档打开" :value="overview.articleOpenCount" description="article_open + article_switch 汇总" />
        <BaseStatCard label="搜索次数" :value="overview.searchCount" description="帮助中心全文搜索提交次数" />
        <BaseStatCard label="复制次数" :value="overview.copyCount" description="包含正文、命令、代码块与治理模板复制" />
        <BaseStatCard label="上下文帮助打开" :value="overview.contextHelpOpenCount" description="来自设置、账号、日志等页面的直达入口" />
        <BaseStatCard label="跳转成功率" :value="formatPercent(overview.jumpSuccessRate)" description="上下文跳转、目录跳转、关联页面跳转综合" />
        <BaseStatCard label="反馈单数" :value="overview.feedbackOpenCount" :description="`失败 ${overview.jumpFailureCount} 次`" />
      </BaseStatCardGrid>
    </template>

    <template #filters>
      <section class="glass-panel help-observability-filters">
        <div class="help-observability-filters__grid">
          <BaseInput v-model="filters.dateFrom" type="date" label="开始日期" />
          <BaseInput v-model="filters.dateTo" type="date" label="结束日期" />
          <BaseSelect v-model="filters.role" label="用户角色" :options="roleOptions" />
          <BaseSelect v-model="filters.category" label="文档分类" :options="categoryOptions" />
          <BaseSelect v-model="filters.articleSortBy" label="文档榜单排序" :options="articleSortOptions" />
          <BaseSelect v-model="filters.articleLimit" label="文档榜单数量" :options="limitOptions" />
          <BaseSelect v-model="filters.listLimit" label="其余榜单数量" :options="limitOptions" />
        </div>

        <div class="help-observability-filters__actions">
          <div class="help-observability-filters__note">
            当前统计只读取帮助中心独立埋点表和反馈表，不会回写其他业务数据。
          </div>
          <div class="help-observability-filters__buttons">
            <BaseButton variant="ghost" @click="resetFilters">
              重置筛选
            </BaseButton>
            <BaseButton variant="primary" :loading="loading" @click="loadAnalytics">
              应用筛选
            </BaseButton>
          </div>
        </div>
      </section>
    </template>

    <template #supporting>
      <div class="help-observability-support">
        <BaseTableSectionCard
          title="采集开关与保留策略"
          description="所有改动都通过独立系统设置项控制。关闭后前端仍可正常进入帮助中心，只是不再上报。"
        >
          <div class="help-observability-settings">
            <div class="help-observability-settings__switches">
              <BaseSwitch v-model="settingsDraft.telemetryEnabled" label="启用埋点采集" hint="关闭后不再上报帮助中心使用事件。" recommend="conditional" />
              <BaseSwitch v-model="settingsDraft.feedbackEnabled" label="启用反馈闭环" hint="关闭后普通用户无法提交帮助文档反馈，管理员页也会显示停用状态。" recommend="conditional" />
              <BaseSwitch v-model="settingsDraft.jumpTracingEnabled" label="启用跳转链路追踪" hint="用于定位设置页、账号页等上下文帮助跳转失败原因。" recommend="conditional" />
            </div>

            <div class="help-observability-settings__grid">
              <BaseInput
                v-model="settingsDraft.telemetrySamplingRate"
                type="number"
                label="采样率"
                hint="0 到 1 之间，例如 0.25 表示 25% 会话采样。"
                step="0.05"
                min="0"
                max="1"
              />
              <BaseInput
                v-model="settingsDraft.batchSize"
                type="number"
                label="批量上报条数"
                hint="前端缓存达到该数量后会立即 flush。"
                min="1"
                max="200"
              />
              <BaseInput
                v-model="settingsDraft.flushIntervalMs"
                type="number"
                label="定时 flush 间隔"
                hint="单位毫秒，建议保持 15000 左右。"
                min="1000"
                max="600000"
              />
              <BaseInput
                v-model="settingsDraft.retentionDays"
                type="number"
                label="数据保留天数"
                hint="用于后续清理策略和报表窗口。"
                min="1"
                max="365"
              />
            </div>

            <div class="help-observability-settings__status">
              <BaseBadge surface="meta" :tone="settingsDraft.telemetryEnabled ? 'success' : 'neutral'">
                埋点 {{ formatBooleanLabel(settingsDraft.telemetryEnabled) }}
              </BaseBadge>
              <BaseBadge surface="meta" :tone="settingsDraft.feedbackEnabled ? 'success' : 'neutral'">
                反馈 {{ formatBooleanLabel(settingsDraft.feedbackEnabled) }}
              </BaseBadge>
              <BaseBadge surface="meta" :tone="settingsDraft.jumpTracingEnabled ? 'info' : 'neutral'">
                跳转追踪 {{ formatBooleanLabel(settingsDraft.jumpTracingEnabled) }}
              </BaseBadge>
            </div>

            <div class="help-observability-settings__actions">
              <BaseButton variant="ghost" :disabled="!settingsDirty" @click="loadSettings">
                撤销更改
              </BaseButton>
              <BaseButton variant="primary" :loading="settingsSaving" :disabled="!settingsDirty" @click="saveSettings">
                保存配置
              </BaseButton>
            </div>
          </div>
        </BaseTableSectionCard>

        <BaseTableSectionCard
          title="风险控制说明"
          description="这套能力以“默认关闭、失败不阻断主流程”为原则，尽量把新能力和现有帮助中心隔离开。"
        >
          <ul class="help-observability-notes">
            <li>埋点和反馈都走独立接口，失败时只丢弃本次上报，不影响帮助中心阅读、搜索、复制和跳转。</li>
            <li>上下文帮助跳转会带 trace id，但真实页面跳转仍使用原有路由逻辑，链路采集只做旁路记录。</li>
            <li>这里的设置只作用于帮助中心 observability，不会修改账号、任务、日志等其他业务配置。</li>
            <li v-if="analyticsError" class="help-observability-notes__danger">
              最近一次统计加载异常：{{ analyticsError }}
            </li>
          </ul>
        </BaseTableSectionCard>
      </div>
    </template>

    <template #table>
      <div class="help-observability-section-stack">
        <BaseTableSectionCard
          title="文档指标榜单"
          description="按打开、复制、反馈、跳转失败量聚合到文档级别。"
        >
          <BaseDataTable table-class="min-w-[900px]">
            <BaseDataTableHead>
              <tr>
                <th>文档</th>
                <th>分类</th>
                <th class="text-right">
                  打开
                </th>
                <th class="text-right">
                  复制
                </th>
                <th class="text-right">
                  反馈
                </th>
                <th class="text-right">
                  跳转失败
                </th>
              </tr>
            </BaseDataTableHead>
            <tbody>
              <BaseDataTableStateRow v-if="loading && !articleItems.length" :colspan="6" loading loading-label="正在加载文档指标..." />
              <BaseDataTableStateRow v-else-if="!articleItems.length" :colspan="6" icon="i-carbon-document-blank">
                当前条件下还没有帮助中心文档指标。
              </BaseDataTableStateRow>
              <tr v-for="item in articleItems" v-else :key="item.articleId" class="help-observability-row">
                <td>
                  <div class="help-observability-cell-title">
                    <div class="font-semibold">
                      {{ item.articleTitle || item.articleId }}
                    </div>
                    <div class="glass-text-muted text-xs">
                      {{ item.articleId }}
                    </div>
                  </div>
                </td>
                <td>
                  <BaseBadge surface="meta" tone="brand">
                    {{ item.category || '未分类' }}
                  </BaseBadge>
                </td>
                <td class="text-right font-semibold">
                  {{ item.openCount }}
                </td>
                <td class="text-right">
                  {{ item.copyCount }}
                </td>
                <td class="text-right">
                  {{ item.feedbackCount }}
                </td>
                <td class="text-right">
                  {{ item.jumpFailureCount }}
                </td>
              </tr>
            </tbody>
          </BaseDataTable>
        </BaseTableSectionCard>

        <div class="help-observability-section-grid">
          <BaseTableSectionCard
            title="来源页面榜单"
            description="看哪些页面最常通过上下文帮助进入帮助中心。"
          >
            <BaseDataTable table-class="min-w-[560px]">
              <BaseDataTableHead>
                <tr>
                  <th>来源页面</th>
                  <th>来源上下文</th>
                  <th class="text-right">
                    打开
                  </th>
                  <th class="text-right">
                    失败
                  </th>
                </tr>
              </BaseDataTableHead>
              <tbody>
                <BaseDataTableStateRow v-if="loading && !entryPageItems.length" :colspan="4" loading loading-label="正在加载来源页面..." />
                <BaseDataTableStateRow v-else-if="!entryPageItems.length" :colspan="4" icon="i-carbon-document-blank">
                  暂无来源页面数据。
                </BaseDataTableStateRow>
                <tr v-for="item in entryPageItems" v-else :key="`${item.sourcePage}-${item.sourceContext}`" class="help-observability-row">
                  <td>{{ item.sourcePage || 'unknown' }}</td>
                  <td class="glass-text-muted text-sm">
                    {{ item.sourceContext || 'direct' }}
                  </td>
                  <td class="text-right font-semibold">
                    {{ item.openCount }}
                  </td>
                  <td class="text-right">
                    {{ item.failedCount }}
                  </td>
                </tr>
              </tbody>
            </BaseDataTable>
          </BaseTableSectionCard>

          <BaseTableSectionCard
            title="搜索关键词榜单"
            description="帮助中心正文搜索最常命中的关键词。"
          >
            <BaseDataTable table-class="min-w-[420px]">
              <BaseDataTableHead>
                <tr>
                  <th>关键词</th>
                  <th class="text-right">
                    搜索次数
                  </th>
                </tr>
              </BaseDataTableHead>
              <tbody>
                <BaseDataTableStateRow v-if="loading && !searchKeywordItems.length" :colspan="2" loading loading-label="正在加载搜索关键词..." />
                <BaseDataTableStateRow v-else-if="!searchKeywordItems.length" :colspan="2" icon="i-carbon-document-blank">
                  暂无搜索关键词数据。
                </BaseDataTableStateRow>
                <tr v-for="item in searchKeywordItems" v-else :key="item.keyword" class="help-observability-row">
                  <td>{{ item.keyword }}</td>
                  <td class="text-right font-semibold">
                    {{ item.searchCount }}
                  </td>
                </tr>
              </tbody>
            </BaseDataTable>
          </BaseTableSectionCard>
        </div>

        <BaseTableSectionCard
          title="跳转失败链路"
          description="定位设置页、账号页、正文目录或关联页面跳转失败的主要链路。"
        >
          <BaseDataTable table-class="min-w-[1120px]">
            <BaseDataTableHead>
              <tr>
                <th>来源</th>
                <th>目标文档</th>
                <th>段落</th>
                <th>错误码</th>
                <th class="text-right">
                  失败次数
                </th>
                <th class="text-right">
                  Fallback
                </th>
                <th class="text-right">
                  平均耗时
                </th>
              </tr>
            </BaseDataTableHead>
            <tbody>
              <BaseDataTableStateRow v-if="loading && !jumpFailureItems.length" :colspan="7" loading loading-label="正在加载跳转失败链路..." />
              <BaseDataTableStateRow v-else-if="!jumpFailureItems.length" :colspan="7" icon="i-carbon-checkmark-outline">
                当前筛选窗口内没有跳转失败链路。
              </BaseDataTableStateRow>
              <tr
                v-for="item in jumpFailureItems"
                v-else
                :key="`${item.sourcePage}-${item.sourceContext}-${item.articleId}-${item.sectionId}-${item.errorCode}`"
                class="help-observability-row"
              >
                <td>
                  <div class="font-semibold">
                    {{ item.sourcePage || 'unknown' }}
                  </div>
                  <div class="glass-text-muted text-xs">
                    {{ item.sourceContext || 'direct' }}
                  </div>
                </td>
                <td>
                  <div class="font-semibold">
                    {{ item.articleTitle || item.articleId }}
                  </div>
                  <div class="glass-text-muted text-xs">
                    {{ item.articleId }}
                  </div>
                </td>
                <td>{{ item.sectionId || '-' }}</td>
                <td>
                  <BaseBadge surface="meta" tone="warning">
                    {{ item.errorCode || 'unknown' }}
                  </BaseBadge>
                </td>
                <td class="text-right font-semibold">
                  {{ item.failureCount }}
                </td>
                <td class="text-right">
                  {{ item.fallbackCount }}
                </td>
                <td class="text-right">
                  {{ formatLatency(item.avgLatencyMs) }}
                </td>
              </tr>
            </tbody>
          </BaseDataTable>
        </BaseTableSectionCard>
      </div>
    </template>
  </BaseManagementPageScaffold>
</template>

<style scoped>
.help-observability-header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
}

.help-observability-filters {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.1rem;
}

.help-observability-filters__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.9rem;
}

.help-observability-filters__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
}

.help-observability-filters__note {
  color: var(--ui-text-2);
  font-size: 0.85rem;
}

.help-observability-filters__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.help-observability-support,
.help-observability-section-stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.help-observability-settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.help-observability-settings__switches {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.9rem;
}

.help-observability-settings__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.9rem;
}

.help-observability-settings__status,
.help-observability-settings__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.help-observability-settings__actions {
  justify-content: flex-end;
}

.help-observability-notes {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--ui-text-2);
  display: grid;
  gap: 0.7rem;
  line-height: 1.7;
}

.help-observability-notes__danger {
  color: var(--ui-status-danger);
}

.help-observability-row td {
  border-top: 1px solid var(--ui-border-subtle);
  padding: 0.85rem 0.8rem;
  vertical-align: top;
}

.help-observability-cell-title {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.help-observability-section-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 1rem;
}

@media (max-width: 900px) {
  .help-observability-filters__actions {
    align-items: stretch;
  }

  .help-observability-filters__buttons,
  .help-observability-settings__actions,
  .help-observability-header-actions {
    width: 100%;
    justify-content: stretch;
  }
}
</style>
