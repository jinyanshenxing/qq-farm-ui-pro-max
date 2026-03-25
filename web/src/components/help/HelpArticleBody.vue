<script setup lang="ts">
import type { ResolvedHelpArticle } from '@/data/help-center'
import { marked } from 'marked'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useCopyInteraction } from '@/composables/use-copy-interaction'

const props = defineProps<{
  article: ResolvedHelpArticle | null
}>()
const emit = defineEmits<{
  (e: 'ready', articleId: string): void
  (e: 'copy', payload: { kind: 'code_block' | 'command_block', language: string }): void
}>()

const bodyRef = ref<HTMLElement | null>(null)
const { copyText } = useCopyInteraction({
  successTitle: '帮助文档复制成功',
  failureMessage: '复制失败，请手动复制',
})

marked.setOptions({
  gfm: true,
  breaks: true,
  mangle: false,
  headerIds: false,
})

const renderedHtml = computed(() => {
  if (!props.article?.markdown)
    return '<div class="help-article-empty">正在加载文档...</div>'
  return marked.parse(props.article.markdown) as string
})

function isCommandBlock(language: string, text: string) {
  const normalized = language.trim().toLowerCase()
  if (['bash', 'shell', 'sh', 'zsh', 'powershell', 'ps1', 'cmd'].includes(normalized))
    return true

  return /(?:^|\n)\s*(?:\$ )?(?:\.\/|pnpm |npm |docker |bash |curl |cd |tail |chmod |systemctl |launchctl |node )/m.test(text)
}

function getCodeLanguageLabel(language: string, text: string) {
  const normalized = language.trim().toLowerCase()
  if (isCommandBlock(normalized, text))
    return '命令'
  if (!normalized)
    return '代码'
  return normalized.toUpperCase()
}

async function decorateArticleBody() {
  await nextTick()

  const body = bodyRef.value
  if (!body || !props.article?.markdown)
    return

  const headings = [...body.querySelectorAll('h2, h3, h4')]
  headings.forEach((heading, index) => {
    const outlineItem = props.article?.outline?.[index]
    if (!outlineItem)
      return
    heading.id = outlineItem.id
  })

  const tables = [...body.querySelectorAll('table')]
  for (const table of tables) {
    if (table.parentElement?.classList.contains('help-article-table-shell'))
      continue

    const shell = document.createElement('div')
    shell.className = 'help-article-table-shell'

    const parent = table.parentNode
    if (!parent)
      continue

    parent.insertBefore(shell, table)
    shell.appendChild(table)
  }

  const codeBlocks = [...body.querySelectorAll('pre')]
  for (const pre of codeBlocks) {
    if (pre.parentElement?.classList.contains('help-article-code-shell'))
      continue

    const code = pre.querySelector('code')
    const rawText = (code?.textContent || pre.textContent || '').trimEnd()
    const rawClass = [...(code?.classList || [])].find(className => className.startsWith('language-')) || ''
    const language = rawClass.replace('language-', '')
    const languageLabel = getCodeLanguageLabel(language, rawText)
    const copyLabel = isCommandBlock(language, rawText) ? '复制命令' : '复制代码'
    const copyMessage = isCommandBlock(language, rawText) ? '命令已复制' : '代码已复制'

    const shell = document.createElement('div')
    shell.className = 'help-article-code-shell'

    const toolbar = document.createElement('div')
    toolbar.className = 'help-article-code-toolbar'

    const meta = document.createElement('div')
    meta.className = 'help-article-code-meta'

    const badge = document.createElement('span')
    badge.className = 'help-article-code-badge'
    badge.textContent = languageLabel

    const count = document.createElement('span')
    count.className = 'help-article-code-count'
    count.textContent = `${rawText.split('\n').filter(Boolean).length || 1} 行`

    meta.appendChild(badge)
    meta.appendChild(count)

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'help-article-copy-button'
    button.textContent = copyLabel
    button.dataset.helpCopyButton = 'true'
    button.dataset.helpCopyKind = isCommandBlock(language, rawText) ? 'command' : 'code'
    button.addEventListener('click', () => {
      void copyText(rawText, copyMessage, {
        title: '复制成功',
      })
      emit('copy', {
        kind: isCommandBlock(language, rawText) ? 'command_block' : 'code_block',
        language: language.trim().toLowerCase(),
      })
    })

    toolbar.appendChild(meta)
    toolbar.appendChild(button)

    const parent = pre.parentNode
    if (!parent)
      continue

    parent.insertBefore(shell, pre)
    shell.appendChild(toolbar)
    shell.appendChild(pre)
  }

  emit('ready', props.article.id)
}

watch(renderedHtml, () => {
  void decorateArticleBody()
})

watch(() => props.article?.id, () => {
  void decorateArticleBody()
})

onMounted(() => {
  void decorateArticleBody()
})
</script>

<template>
  <article ref="bodyRef" class="help-article-rendered" v-html="renderedHtml" />
</template>

<style scoped>
.help-article-rendered {
  color: var(--ui-text-1);
  max-width: min(100%, 78ch);
  font-size: 1rem;
  line-height: 1.9;
}

.help-article-rendered :deep(h1),
.help-article-rendered :deep(h2),
.help-article-rendered :deep(h3),
.help-article-rendered :deep(h4) {
  color: var(--ui-text-1);
  margin: 0;
}

.help-article-rendered :deep(> h1:first-child) {
  display: none;
}

.help-article-rendered :deep(> h1:first-child + p) {
  margin: 0 0 1.4rem;
  color: color-mix(in srgb, var(--ui-text-1) 88%, var(--ui-text-2) 12%);
  font-size: 1.08rem;
  line-height: 1.9;
}

.help-article-rendered :deep(h1) {
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.help-article-rendered :deep(h2) {
  margin-top: 2rem;
  margin-bottom: 0.95rem;
  padding-top: 1rem;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-subtle) 88%, transparent);
  font-size: 1.28rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  scroll-margin-top: 6.5rem;
}

.help-article-rendered :deep(h2::before) {
  content: '';
  display: block;
  width: 2.6rem;
  height: 0.2rem;
  margin-bottom: 0.8rem;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    var(--ui-brand-500),
    color-mix(in srgb, var(--ui-status-success) 72%, var(--ui-brand-500) 28%)
  );
}

.help-article-rendered :deep(h3) {
  margin-top: 1.4rem;
  margin-bottom: 0.7rem;
  font-size: 1.06rem;
  font-weight: 800;
  scroll-margin-top: 6.5rem;
}

.help-article-rendered :deep(h4) {
  margin-top: 1rem;
  margin-bottom: 0.55rem;
  color: color-mix(in srgb, var(--ui-text-1) 90%, var(--ui-brand-600) 10%);
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  scroll-margin-top: 6.5rem;
}

.help-article-rendered :deep(p) {
  margin: 0.85rem 0;
  color: var(--ui-text-1);
}

.help-article-rendered :deep(ul),
.help-article-rendered :deep(ol) {
  margin: 1rem 0;
  padding-left: 1.3rem;
}

.help-article-rendered :deep(li) {
  margin: 0.42rem 0;
}

.help-article-rendered :deep(li::marker) {
  color: color-mix(in srgb, var(--ui-brand-500) 76%, var(--ui-text-2) 24%);
}

.help-article-rendered :deep(hr) {
  margin: 1.8rem 0;
  border: 0;
  border-top: 1px solid var(--ui-border-subtle);
}

.help-article-rendered :deep(blockquote) {
  position: relative;
  margin: 1.2rem 0;
  padding: 1rem 1.05rem 1rem 1.2rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 92%, transparent);
  border-radius: 1rem;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--ui-brand-soft-12) 72%, var(--ui-bg-surface) 28%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent)
  );
  color: var(--ui-text-2);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 8%, transparent);
}

.help-article-rendered :deep(blockquote::before) {
  content: '';
  position: absolute;
  top: 1rem;
  left: 0;
  width: 0.24rem;
  height: calc(100% - 2rem);
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    var(--ui-brand-500),
    color-mix(in srgb, var(--ui-status-success) 70%, var(--ui-brand-500) 30%)
  );
}

.help-article-rendered :deep(blockquote > *:first-child) {
  margin-top: 0;
}

.help-article-rendered :deep(blockquote > *:last-child) {
  margin-bottom: 0;
}

.help-article-rendered :deep(a) {
  color: color-mix(in srgb, var(--ui-brand-600) 82%, var(--ui-text-1) 18%);
  text-decoration: none;
  text-underline-offset: 0.18em;
  text-decoration-thickness: 0.08em;
}

.help-article-rendered :deep(a:hover) {
  text-decoration: underline;
}

.help-article-rendered :deep(code) {
  font-family: var(--ui-font-mono);
  font-size: 0.87em;
}

.help-article-rendered :deep(:not(pre) > code) {
  padding: 0.16rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 92%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-brand-soft-12) 56%, var(--ui-bg-surface-raised) 44%);
  color: var(--ui-text-1);
}

.help-article-rendered :deep(.help-article-table-shell) {
  margin: 1.2rem 0;
  overflow-x: auto;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 92%, transparent);
  border-radius: 1.1rem;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--ui-bg-surface-raised) 92%, transparent),
    color-mix(in srgb, var(--ui-bg-surface) 95%, transparent)
  );
  box-shadow:
    0 14px 28px color-mix(in srgb, var(--ui-shadow-panel) 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 8%, transparent);
}

.help-article-rendered :deep(table) {
  width: 100%;
  margin: 0;
  border-collapse: separate;
  border-spacing: 0;
  border: 0;
}

.help-article-rendered :deep(th),
.help-article-rendered :deep(td) {
  padding: 0.85rem 0.95rem;
  border-bottom: 1px solid var(--ui-border-subtle);
  text-align: left;
}

.help-article-rendered :deep(th) {
  background: color-mix(in srgb, var(--ui-brand-soft-12) 46%, var(--ui-bg-surface-raised) 54%);
  font-weight: 800;
}

.help-article-rendered :deep(tr:last-child td) {
  border-bottom: 0;
}

.help-article-rendered :deep(tbody tr:nth-child(even) td) {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 72%, transparent);
}

.help-article-rendered :deep(.help-article-empty) {
  display: grid;
  place-items: center;
  min-height: 12rem;
  color: var(--ui-text-2);
}

.help-article-rendered :deep(.help-article-code-shell) {
  margin: 1.2rem 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 92%, transparent);
  border-radius: 1.2rem;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent),
    color-mix(in srgb, var(--ui-bg-surface) 96%, transparent)
  );
  box-shadow:
    0 16px 30px color-mix(in srgb, var(--ui-shadow-panel) 20%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-on-brand) 8%, transparent);
}

.help-article-rendered :deep(.help-article-code-toolbar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.8rem 0.95rem;
  border-bottom: 1px solid var(--ui-border-subtle);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ui-brand-soft-12) 52%, var(--ui-bg-surface-raised) 48%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 92%, transparent)
  );
}

.help-article-rendered :deep(.help-article-code-meta) {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.help-article-rendered :deep(.help-article-code-badge) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.22rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--ui-brand-500) 28%, var(--ui-border-subtle) 72%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-brand-soft-12) 80%, transparent);
  color: color-mix(in srgb, var(--ui-brand-700) 72%, var(--ui-text-1) 28%);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.help-article-rendered :deep(.help-article-code-count) {
  color: var(--ui-text-2);
  font-size: 0.76rem;
  white-space: nowrap;
}

.help-article-rendered :deep(.help-article-copy-button) {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 92%, transparent);
  border-radius: 999px;
  padding: 0.44rem 0.82rem;
  background: color-mix(in srgb, var(--ui-bg-surface) 92%, transparent);
  color: var(--ui-text-1);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform var(--ui-motion-fast) ease,
    border-color var(--ui-motion-fast) ease,
    background-color var(--ui-motion-fast) ease;
}

.help-article-rendered :deep(.help-article-copy-button:hover) {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--ui-brand-500) 34%, var(--ui-border-subtle) 66%);
  background: color-mix(in srgb, var(--ui-brand-soft-12) 72%, var(--ui-bg-surface) 28%);
}

.help-article-rendered :deep(pre) {
  margin: 0;
  padding: 1rem 1.05rem 1.1rem;
  overflow-x: auto;
  background: transparent;
  color: var(--ui-text-1);
  font-size: 0.91rem;
  line-height: 1.72;
}

.help-article-rendered :deep(img) {
  width: 100%;
  margin: 1.2rem 0;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 92%, transparent);
  border-radius: 1.1rem;
  box-shadow: 0 14px 28px color-mix(in srgb, var(--ui-shadow-panel) 18%, transparent);
}

@media (max-width: 767px) {
  .help-article-rendered {
    max-width: 100%;
  }

  .help-article-rendered :deep(.help-article-code-toolbar) {
    align-items: flex-start;
    flex-direction: column;
  }

  .help-article-rendered :deep(.help-article-copy-button) {
    width: 100%;
  }
}
</style>
