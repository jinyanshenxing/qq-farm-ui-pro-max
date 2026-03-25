<script setup lang="ts">
import type { SystemUpdateJobDetail, SystemUpdatePreflightCheck } from '@/stores/setting'
import { computed } from 'vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'

const props = defineProps<{
  detail: SystemUpdateJobDetail | null
  loading?: boolean
}>()

function formatTimestamp(value?: number | string | null) {
  if (!value)
    return '未获取'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

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

function getCheckTone(check: SystemUpdatePreflightCheck) {
  if (check.blocker)
    return 'danger'
  if (check.warning)
    return 'warning'
  return 'success'
}

const preflightChecks = computed(() => props.detail?.preflight?.checks || [])
const logs = computed(() => props.detail?.logs || [])
</script>

<template>
  <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div class="glass-text-main text-sm font-bold">
        单机任务详情
      </div>
      <div v-if="detail?.job" class="flex items-center gap-2">
        <BaseBadge tone="info">
          {{ getPhaseLabel(detail.currentPhase) }}
        </BaseBadge>
        <BaseBadge tone="neutral">
          {{ detail.job.status }}
        </BaseBadge>
      </div>
    </div>

    <div v-if="loading" class="glass-text-muted text-sm">
      正在加载任务详情...
    </div>

    <div v-else-if="!detail?.job" class="glass-text-muted text-sm">
      当前没有可展示的任务详情。
    </div>

    <template v-else>
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div class="border border-white/8 rounded-lg bg-black/10 p-3 space-y-2">
          <div class="glass-text-main text-xs font-semibold">
            当前任务
          </div>
          <div class="glass-text-muted text-[12px] leading-6">
            <p>任务号：{{ detail.job.jobKey }}</p>
            <p>目标版本：{{ detail.job.targetVersion || '-' }}</p>
            <p>执行阶段：{{ getPhaseLabel(detail.currentPhase) }}</p>
            <p>最近摘要：{{ detail.job.summaryMessage || '暂无' }}</p>
            <p v-if="detail.logFilePath">日志文件：{{ detail.logFilePath }}</p>
          </div>
        </div>

        <div class="border border-white/8 rounded-lg bg-black/10 p-3 space-y-2">
          <div class="glass-text-main text-xs font-semibold">
            核验与回退
          </div>
          <div class="glass-text-muted text-[12px] leading-6">
            <p>核验结果：{{ detail.verification?.ok === false ? '失败' : (detail.verification?.ok ? '通过' : '未执行') }}</p>
            <p v-if="detail.verification?.verifyLogFile">核验日志：{{ detail.verification.verifyLogFile }}</p>
            <p>回退目标版本：{{ detail.rollbackPayload?.previousVersion || '-' }}</p>
            <p v-if="detail.rollbackPayload?.rollbackCommandSummary">回退命令摘要：{{ detail.rollbackPayload.rollbackCommandSummary }}</p>
          </div>
        </div>
      </div>

      <div class="border border-white/8 rounded-lg bg-black/10 p-3 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div class="glass-text-main text-xs font-semibold">
            预检摘要
          </div>
          <div class="glass-text-muted text-[11px]">
            {{ detail.preflight?.ok ? '通过' : '存在阻断' }} · 阻断 {{ detail.preflight?.blockerCount || 0 }} · 提醒 {{ detail.preflight?.warningCount || 0 }}
          </div>
        </div>
        <div v-if="!preflightChecks.length" class="glass-text-muted text-[12px]">
          当前没有预检快照。
        </div>
        <div v-else class="grid grid-cols-1 gap-2 xl:grid-cols-2">
          <div
            v-for="check in preflightChecks"
            :key="check.key"
            class="border border-white/8 rounded-lg bg-black/10 p-2"
          >
            <div class="flex items-center gap-2">
              <span class="glass-text-main text-xs font-semibold">{{ check.label }}</span>
              <BaseBadge :tone="getCheckTone(check)">
                {{ check.blocker ? '阻断' : (check.warning ? '提醒' : '通过') }}
              </BaseBadge>
            </div>
            <div class="glass-text-muted mt-1 text-[11px] leading-5">
              {{ check.message || '暂无说明' }}
            </div>
          </div>
        </div>
      </div>

      <div class="border border-white/8 rounded-lg bg-black/10 p-3 space-y-2">
        <div class="glass-text-main text-xs font-semibold">
          最近阶段日志
        </div>
        <div v-if="!logs.length" class="glass-text-muted text-[12px]">
          暂无阶段日志。
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="item in logs"
            :key="item.id"
            class="border border-white/8 rounded-lg bg-black/10 p-2"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="glass-text-main text-xs font-semibold">
                {{ getPhaseLabel(item.phase) }} · {{ item.level }}
              </div>
              <div class="glass-text-muted text-[11px]">
                {{ formatTimestamp(item.createdAt) }}
              </div>
            </div>
            <div class="glass-text-muted mt-1 text-[11px] leading-5 break-all">
              {{ item.message || '无文本日志' }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
