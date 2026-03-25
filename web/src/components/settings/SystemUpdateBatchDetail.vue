<script setup lang="ts">
import type { SystemUpdateBatchSummary, SystemUpdateJob } from '@/stores/setting'
import { computed } from 'vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'

const props = defineProps<{
  batch: SystemUpdateBatchSummary | null
}>()

function getPhaseLabel(phase?: string) {
  switch (String(phase || '').trim()) {
    case 'preflight':
      return '预检'
    case 'backup':
      return '备份'
    case 'pull_image':
      return '拉取镜像'
    case 'stop_stack':
      return '停栈'
    case 'apply_update':
      return '应用更新'
    case 'start_stack':
      return '启动服务'
    case 'verify':
      return '更新核验'
    case 'sync_announcements':
      return '同步公告'
    case 'rollback':
      return '回滚'
    case 'done':
      return '完成'
    default:
      return phase || '待开始'
  }
}

function getFailureCategoryLabel(category?: string) {
  switch (String(category || '').trim()) {
    case 'preflight_blocked':
      return '预检阻断'
    case 'drain_timeout':
      return '排空超时'
    case 'pull_failed':
      return '拉取失败'
    case 'verification_failed':
      return '核验失败'
    case 'rollback_failed':
      return '回滚失败'
    case 'manual_cancelled':
      return '人工取消'
    case 'health_check_failed':
      return '健康检查失败'
    case 'script_error':
      return '脚本执行失败'
    default:
      return category || '未分类'
  }
}

const groupedAgents = computed(() => {
  const batch = props.batch
  if (!batch?.childJobsByAgent)
    return []
  return Object.entries(batch.childJobsByAgent).map(([agentId, jobs]) => ({
    agentId,
    jobs: jobs as SystemUpdateJob[],
  }))
})
</script>

<template>
  <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div class="glass-text-main text-sm font-bold">
        集群批次详情
      </div>
      <div v-if="batch" class="glass-text-muted text-[11px]">
        运行节点 {{ batch.runningNodeCount || 0 }} · 阻断节点 {{ batch.blockedNodeCount || 0 }} · 失败节点 {{ batch.failedNodeCount || 0 }}
      </div>
    </div>

    <div v-if="!batch" class="glass-text-muted text-sm">
      当前没有批次详情。
    </div>

    <template v-else>
      <div v-if="batch.failedCategories && Object.keys(batch.failedCategories).length" class="flex flex-wrap gap-2">
        <BaseBadge
          v-for="(count, key) in batch.failedCategories"
          :key="key"
          tone="warning"
        >
          {{ getFailureCategoryLabel(key) }} {{ count }}
        </BaseBadge>
      </div>

      <div v-if="batch.perNodePhase && Object.keys(batch.perNodePhase).length" class="grid grid-cols-1 gap-2 xl:grid-cols-2">
        <div
          v-for="(phase, nodeId) in batch.perNodePhase"
          :key="nodeId"
          class="border border-white/8 rounded-lg bg-black/10 p-2"
        >
          <div class="flex items-center gap-2 flex-wrap">
            <span class="glass-text-main text-xs font-semibold">{{ nodeId }}</span>
            <BaseBadge tone="info">
              {{ getPhaseLabel(phase) }}
            </BaseBadge>
          </div>
          <div class="glass-text-muted mt-1 text-[11px] leading-5">
            {{ batch.perNodeErrorSummary?.[nodeId] || '当前节点暂无错误摘要' }}
          </div>
        </div>
      </div>

      <div v-if="groupedAgents.length" class="space-y-2">
        <div
          v-for="group in groupedAgents"
          :key="group.agentId"
          class="border border-white/8 rounded-lg bg-black/10 p-3 space-y-2"
        >
          <div class="glass-text-main text-xs font-semibold">
            代理 {{ group.agentId }}
          </div>
          <div class="space-y-2">
            <div
              v-for="job in group.jobs"
              :key="job.id"
              class="border border-white/8 rounded-lg bg-black/10 p-2"
            >
              <div class="flex items-center gap-2 flex-wrap">
                <span class="glass-text-main text-xs font-semibold">{{ job.jobKey }}</span>
                <BaseBadge tone="neutral">
                  {{ job.status }}
                </BaseBadge>
                <BaseBadge tone="info">
                  {{ getPhaseLabel(job.executionPhase) }}
                </BaseBadge>
              </div>
              <div class="glass-text-muted mt-1 text-[11px] leading-5">
                {{ job.summaryMessage || '暂无摘要' }}
              </div>
              <div v-if="job.errorMessage" class="glass-text-muted mt-1 text-[11px] leading-5">
                {{ job.errorMessage }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
