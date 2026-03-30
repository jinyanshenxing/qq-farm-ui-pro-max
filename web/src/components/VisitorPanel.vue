<script setup lang="ts">
import type { MetaBadgeTone } from '@/utils/ui-badge'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()
const { logs } = storeToRefs(statusStore)

function formatTime(input: any) {
  const raw = String(input || '').trim()
  if (raw)
    return raw
  return '--'
}

function getTypeText(result: string) {
  if (result === 'weed')
    return '放草'
  if (result === 'insect')
    return '放虫'
  if (result === 'steal')
    return '偷菜'
  return '访客'
}

function getTypeTone(result: string): MetaBadgeTone {
  if (result === 'weed')
    return 'success'
  if (result === 'insect')
    return 'warning'
  if (result === 'steal')
    return 'danger'
  return 'info'
}

function getSummaryBadgeTone(type: 'total' | 'weed' | 'insect' | 'steal'): MetaBadgeTone {
  if (type === 'weed')
    return 'success'
  if (type === 'insect')
    return 'warning'
  if (type === 'steal')
    return 'danger'
  return 'info'
}

const visitorLogs = computed(() => {
  const src = Array.isArray(logs.value) ? logs.value : []
  return src
    .filter((entry: any) => String(entry?.meta?.event || '') === 'visitor')
    .slice(-80)
    .reverse()
})

const summary = computed(() => {
  const list = visitorLogs.value
  let weed = 0
  let insect = 0
  let steal = 0
  for (const entry of list) {
    const result = String(entry?.meta?.result || '')
    if (result === 'weed')
      weed++
    else if (result === 'insect')
      insect++
    else if (result === 'steal')
      steal++
  }
  return { total: list.length, weed, insect, steal }
})

const summaryChips = computed(() => [
  { key: 'total', label: `最近 ${summary.value.total} 条`, tone: getSummaryBadgeTone('total') },
  { key: 'weed', label: `放草 ${summary.value.weed}`, tone: getSummaryBadgeTone('weed') },
  { key: 'insect', label: `放虫 ${summary.value.insect}`, tone: getSummaryBadgeTone('insect') },
  { key: 'steal', label: `偷菜 ${summary.value.steal}`, tone: getSummaryBadgeTone('steal') },
])
</script>

<template>
  <div class="visitor-panel space-y-4">
    <div class="visitor-shell glass-panel rounded-lg p-4 shadow-sm">
      <div class="visitor-toolbar ui-mobile-sticky-panel">
        <div class="glass-text-main flex items-center gap-2 text-base font-semibold">
          <div class="i-carbon-user-multiple text-lg" />
          <span>访客面板</span>
        </div>
        <p class="visitor-toolbar__desc">
          最近的好友互动、偷菜、放草和放虫事件会按时间倒序展示。
        </p>
        <div class="visitor-toolbar__chips ui-bulk-actions">
          <BaseBadge
            v-for="item in summaryChips"
            :key="item.key"
            surface="meta"
            :tone="item.tone"
            class="visitor-summary-pill"
          >
            {{ item.label }}
          </BaseBadge>
        </div>
      </div>

      <BaseEmptyState
        v-if="visitorLogs.length === 0"
        dashed
        class="visitor-empty-state glass-text-muted min-h-56 rounded-lg py-10 text-sm"
        icon="i-carbon-face-wink"
        title="暂无访客事件"
        description="等好友互动、偷菜、放草或放虫后，这里会自动按时间倒序汇总。"
      />

      <div v-else class="visitor-log-list">
        <div
          v-for="(log, idx) in visitorLogs"
          :key="`${log.ts || idx}_${log.msg || ''}`"
          class="visitor-log-card ui-mobile-record-card glass-panel rounded-lg p-3"
        >
          <div class="ui-mobile-record-head">
            <div class="ui-mobile-record-body">
              <div class="ui-mobile-record-badges">
                <BaseBadge
                  surface="meta"
                  :tone="getTypeTone(String(log?.meta?.result || ''))"
                  class="visitor-type-badge"
                >
                  {{ getTypeText(String(log?.meta?.result || '')) }}
                </BaseBadge>
              </div>
              <h3 class="ui-mobile-record-title mt-3">
                {{ String(log.msg || '').trim() || '访客事件' }}
              </h3>
              <p class="ui-mobile-record-subtitle">
                {{ formatTime(log.time) }}
              </p>
            </div>
          </div>

          <div class="ui-mobile-record-grid visitor-log-grid">
            <div class="ui-mobile-record-field">
              <div class="ui-mobile-record-label">
                事件类型
              </div>
              <div class="ui-mobile-record-value">
                {{ getTypeText(String(log?.meta?.result || '')) }}
              </div>
            </div>
            <div class="ui-mobile-record-field">
              <div class="ui-mobile-record-label">
                地块
              </div>
              <div class="ui-mobile-record-value">
                {{ Number(log?.meta?.landId || 0) > 0 ? `${Number(log?.meta?.landId || 0)}号土地` : '-' }}
              </div>
            </div>
            <div v-if="Number(log?.meta?.gid || 0) > 0" class="ui-mobile-record-field">
              <div class="ui-mobile-record-label">
                GID
              </div>
              <div class="ui-mobile-record-value">
                {{ Number(log?.meta?.gid || 0) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.visitor-panel {
  color: var(--ui-text-1);
}

.visitor-shell,
.visitor-empty-state,
.visitor-log-card {
  border: 1px solid var(--ui-border-subtle) !important;
}

.visitor-shell,
.visitor-log-card {
  background: color-mix(in srgb, var(--ui-bg-surface) 68%, transparent) !important;
}

.visitor-empty-state {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent) !important;
  border-style: dashed !important;
}

.visitor-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 0.9rem;
}

.visitor-toolbar__desc {
  color: var(--ui-text-2);
  font-size: 0.84rem;
  line-height: 1.55;
}

.visitor-toolbar__chips {
  display: flex;
  gap: 0.5rem;
}

.visitor-summary-pill,
.visitor-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 1.85rem;
  border-radius: 999px;
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.visitor-log-list {
  display: grid;
  gap: 0.75rem;
  max-height: 32rem;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.visitor-log-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 767px) {
  .visitor-toolbar {
    z-index: 11;
    padding-bottom: 0.15rem;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent) 0%,
      color-mix(in srgb, var(--ui-bg-surface) 70%, transparent) 100%
    );
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .visitor-log-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
