<script setup lang="ts">
import type { HelpCenterFeedbackPayload } from '@/types/help-center-observability'
import { computed, ref, watch } from 'vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import { submitHelpCenterFeedback } from '@/services/help-center-feedback'

const props = defineProps<{
  show: boolean
  articleId: string
  articleTitle: string
  sectionId?: string
  sectionTitle?: string
  sourcePage?: string
  sourceRoute?: string
  sourceContext?: string
  audienceFilter?: string
  quickFilter?: string
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'submitted', payload: { id: number, feedbackNo: string, status: string }): void
}>()

const feedbackType = ref<HelpCenterFeedbackPayload['feedbackType']>('outdated')
const priority = ref<HelpCenterFeedbackPayload['priority']>('medium')
const message = ref('')
const expectedBehavior = ref('')
const actualBehavior = ref('')
const loading = ref(false)
const errorMessage = ref('')

const feedbackTypeOptions = [
  { label: '文档已过期', value: 'outdated' },
  { label: '步骤缺失', value: 'missing_step' },
  { label: '描述不清晰', value: 'unclear' },
  { label: '跳转不正确', value: 'wrong_route' },
  { label: '复制体验问题', value: 'copy_issue' },
  { label: '帮助跳转失败', value: 'jump_failed' },
  { label: '其他建议', value: 'other' },
]

const priorityOptions = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '阻断', value: 'critical' },
]

const isReadyToSubmit = computed(() => {
  return !!String(props.articleId || '').trim() && !!String(props.articleTitle || '').trim() && !!message.value.trim()
})

function closeDialog() {
  if (loading.value)
    return
  emit('update:show', false)
}

function resetForm() {
  feedbackType.value = 'outdated'
  priority.value = 'medium'
  message.value = ''
  expectedBehavior.value = ''
  actualBehavior.value = ''
  errorMessage.value = ''
}

async function handleSubmit() {
  if (!isReadyToSubmit.value || loading.value)
    return

  loading.value = true
  errorMessage.value = ''
  try {
    const result = await submitHelpCenterFeedback({
      articleId: props.articleId,
      articleTitle: props.articleTitle,
      sectionId: props.sectionId,
      sectionTitle: props.sectionTitle,
      feedbackType: feedbackType.value,
      priority: priority.value,
      sourcePage: props.sourcePage,
      sourceRoute: props.sourceRoute,
      sourceContext: props.sourceContext,
      audienceFilter: props.audienceFilter,
      quickFilter: props.quickFilter,
      message: message.value.trim(),
      expectedBehavior: expectedBehavior.value.trim(),
      actualBehavior: actualBehavior.value.trim(),
    })
    emit('submitted', result)
    emit('update:show', false)
    resetForm()
  }
  catch (error: any) {
    errorMessage.value = String(error?.response?.data?.error || error?.message || '提交失败，请稍后重试')
  }
  finally {
    loading.value = false
  }
}

watch(() => props.show, (nextShow) => {
  if (nextShow)
    resetForm()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="help-feedback-dialog fixed inset-0 z-60 flex items-center justify-center p-4">
      <div class="help-feedback-dialog__backdrop absolute inset-0" @click="closeDialog" />

      <div class="help-feedback-dialog__panel glass-panel relative z-10 max-h-[90vh] max-w-2xl w-full flex flex-col overflow-hidden rounded-[1.75rem]" @click.stop>
        <div class="help-feedback-dialog__header">
          <div class="help-feedback-dialog__title-wrap">
            <div class="help-feedback-dialog__title">
              提交文档反馈
            </div>
            <p class="help-feedback-dialog__copy">
              反馈会自动关联当前帮助文档，管理员后续可以继续分派、跟踪和关联 BUG 单。
            </p>
          </div>
          <button type="button" class="help-feedback-dialog__close" @click="closeDialog">
            <div class="i-carbon-close text-lg" />
          </button>
        </div>

        <div class="help-feedback-dialog__body custom-scrollbar">
          <div class="help-feedback-dialog__article">
            <div class="help-feedback-dialog__article-main">
              <div class="help-feedback-dialog__article-title">
                {{ articleTitle }}
              </div>
              <div class="help-feedback-dialog__article-meta">
                <BaseBadge surface="meta" tone="brand" class="rounded-full px-2 py-0.5 text-[10px] font-bold">
                  {{ articleId }}
                </BaseBadge>
                <span v-if="sectionTitle">
                  {{ sectionTitle }}
                </span>
                <span v-if="audienceFilter">视角 {{ audienceFilter }}</span>
                <span v-if="quickFilter">筛选 {{ quickFilter }}</span>
              </div>
            </div>
            <div class="help-feedback-dialog__article-side">
              <BaseSelect v-model="feedbackType" label="反馈类型" :options="feedbackTypeOptions as any" />
              <BaseSelect v-model="priority" label="优先级" :options="priorityOptions as any" />
            </div>
          </div>

          <BaseTextarea
            v-model="message"
            label="问题描述"
            placeholder="请描述哪里过期、哪里不清楚，或者哪个跳转/复制行为和实际不一致。"
            :rows="5"
          />

          <div class="help-feedback-dialog__grid">
            <BaseTextarea
              v-model="expectedBehavior"
              label="期望行为"
              placeholder="你期望文档或跳转应该怎样表现。"
              :rows="3"
            />
            <BaseTextarea
              v-model="actualBehavior"
              label="实际情况"
              placeholder="实际看到的行为、当前差异或错误提示。"
              :rows="3"
            />
          </div>

          <BaseInput
            v-if="sourceRoute"
            :model-value="sourceRoute"
            label="来源页面"
            disabled
          />

          <p v-if="errorMessage" class="help-feedback-dialog__error">
            {{ errorMessage }}
          </p>
        </div>

        <div class="help-feedback-dialog__footer">
          <BaseButton variant="ghost" @click="closeDialog">
            取消
          </BaseButton>
          <BaseButton variant="primary" :loading="loading" :disabled="!isReadyToSubmit" @click="handleSubmit">
            提交反馈
          </BaseButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.help-feedback-dialog__backdrop {
  background: color-mix(in srgb, var(--ui-overlay-backdrop) 82%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.help-feedback-dialog__panel {
  border: 1px solid var(--ui-border-subtle);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--ui-bg-surface) 94%, transparent),
    color-mix(in srgb, var(--ui-bg-surface-2) 88%, transparent)
  );
}

.help-feedback-dialog__header,
.help-feedback-dialog__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.2rem 1.35rem;
  border-bottom: 1px solid var(--ui-border-subtle);
}

.help-feedback-dialog__footer {
  align-items: center;
  border-top: 1px solid var(--ui-border-subtle);
  border-bottom: 0;
  justify-content: flex-end;
}

.help-feedback-dialog__title {
  font-size: 1.08rem;
  font-weight: 800;
  color: var(--ui-text-1);
}

.help-feedback-dialog__copy,
.help-feedback-dialog__article-meta {
  margin-top: 0.35rem;
  color: var(--ui-text-2);
  font-size: 0.82rem;
  line-height: 1.7;
}

.help-feedback-dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 999px;
  border: 1px solid var(--ui-border-subtle);
  color: var(--ui-text-2);
}

.help-feedback-dialog__close:hover {
  background: var(--ui-bg-surface);
  color: var(--ui-text-1);
}

.help-feedback-dialog__body {
  overflow-y: auto;
  padding: 1.35rem;
  display: grid;
  gap: 1rem;
}

.help-feedback-dialog__article {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.8fr);
  gap: 1rem;
  padding: 1rem;
  border-radius: 1.15rem;
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 64%, transparent);
}

.help-feedback-dialog__article-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--ui-text-1);
}

.help-feedback-dialog__article-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.help-feedback-dialog__article-side,
.help-feedback-dialog__grid {
  display: grid;
  gap: 0.9rem;
}

.help-feedback-dialog__grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.help-feedback-dialog__error {
  margin: 0;
  color: var(--ui-status-danger);
  font-size: 0.82rem;
  line-height: 1.7;
}

@media (max-width: 900px) {
  .help-feedback-dialog__article,
  .help-feedback-dialog__grid {
    grid-template-columns: 1fr;
  }
}
</style>
