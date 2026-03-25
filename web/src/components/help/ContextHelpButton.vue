<script setup lang="ts">
import type { HelpArticleAudience } from '@/data/help-articles'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'
import { buildHelpRoute } from '@/data/help-articles'
import { createHelpCenterTraceId } from '@/services/help-center-jump-tracer'

const props = withDefaults(defineProps<{
  article: string
  audience?: HelpArticleAudience | 'recommended'
  section?: string
  label?: string
  iconClass?: string
  variant?: string
  size?: string
  ghost?: boolean
  sourceContext?: string
}>(), {
  audience: 'recommended',
  label: '查看帮助',
  iconClass: 'i-carbon-help',
  variant: 'secondary',
  size: 'sm',
  ghost: false,
  sourceContext: 'context_help_button',
})

const router = useRouter()
const route = useRoute()
const resolvedVariant = props.ghost ? 'ghost' : props.variant

function openHelpCenter() {
  const sourcePage = String(route.name || '').trim() || trimPath(route.path)
  void router.push(buildHelpRoute({
    article: props.article,
    audience: props.audience,
    section: props.section,
    traceId: createHelpCenterTraceId('hc-context'),
    sourcePage,
    sourceRoute: route.fullPath,
    sourceContext: props.sourceContext,
  }))
}

function trimPath(path: string) {
  return String(path || '').replace(/^\//, '').split(/[?#]/)[0] || 'workspace'
}
</script>

<template>
  <BaseButton
    :variant="resolvedVariant as any"
    :size="size as any"
    @click="openHelpCenter"
  >
    <div class="mr-1.5" :class="iconClass" />
    {{ label }}
  </BaseButton>
</template>
