import type { HelpCenterObservabilityPublicConfig, HelpCenterTelemetryEvent, HelpCenterTelemetryEventInput } from '@/types/help-center-observability'

const TELEMETRY_CONFIG_TTL_MS = 60_000
const TELEMETRY_SESSION_KEY = 'help_center_telemetry_session_id'
const TELEMETRY_SAMPLING_KEY = 'help_center_telemetry_sampling_v1'
const DEFAULT_BATCH_SIZE = 20
const DEFAULT_FLUSH_INTERVAL_MS = 15_000

const defaultConfig: HelpCenterObservabilityPublicConfig = {
  telemetryEnabled: false,
  feedbackEnabled: false,
  jumpTracingEnabled: false,
  telemetrySamplingRate: 0,
}

let cachedConfig: HelpCenterObservabilityPublicConfig = { ...defaultConfig }
let configLoadedAt = 0
let configPromise: Promise<HelpCenterObservabilityPublicConfig> | null = null
let pagehideBound = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let telemetryQueue: HelpCenterTelemetryEvent[] = []
let pendingConfigQueue: HelpCenterTelemetryEvent[] = []

function trimText(value: unknown, maxLength = 255) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function sanitizeMetaValue(value: unknown): unknown {
  if (value === null || value === undefined)
    return undefined
  if (typeof value === 'string')
    return trimText(value, 240) || undefined
  if (typeof value === 'number')
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : undefined
  if (typeof value === 'boolean')
    return value
  if (Array.isArray(value))
    return value.map(item => sanitizeMetaValue(item)).filter(item => item !== undefined).slice(0, 6)
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, 12)
      .map(([key, nested]) => [trimText(key, 60), sanitizeMetaValue(nested)])
      .filter(([, nested]) => nested !== undefined)
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  return undefined
}

function sanitizeMeta(meta: Record<string, unknown> | undefined) {
  if (!meta || typeof meta !== 'object')
    return undefined
  const entries = Object.entries(meta)
    .slice(0, 12)
    .map(([key, value]) => [trimText(key, 60), sanitizeMetaValue(value)])
    .filter(([key, value]) => key && value !== undefined)
  return entries.length ? Object.fromEntries(entries) : undefined
}

function createEventNo() {
  return `HCE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function getSessionId() {
  if (typeof window === 'undefined')
    return 'help-session-server'

  const current = trimText(window.sessionStorage.getItem(TELEMETRY_SESSION_KEY), 80)
  if (current)
    return current

  const next = `hc-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  window.sessionStorage.setItem(TELEMETRY_SESSION_KEY, next)
  return next
}

function getSamplingDecision(config: HelpCenterObservabilityPublicConfig) {
  if (typeof window === 'undefined')
    return false

  const currentRate = Math.max(0, Math.min(1, Number(config.telemetrySamplingRate) || 0))
  const stored = window.sessionStorage.getItem(TELEMETRY_SAMPLING_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      if (Number(parsed.rate) === currentRate && typeof parsed.sampledIn === 'boolean')
        return parsed.sampledIn
    }
    catch {
    }
  }

  const sampledIn = currentRate >= 1
    ? true
    : currentRate <= 0
      ? false
      : Math.random() < currentRate
  window.sessionStorage.setItem(TELEMETRY_SAMPLING_KEY, JSON.stringify({
    rate: currentRate,
    sampledIn,
  }))
  return sampledIn
}

function buildEvent(input: HelpCenterTelemetryEventInput): HelpCenterTelemetryEvent {
  return {
    eventNo: trimText(input.eventNo, 40) || createEventNo(),
    eventType: trimText(input.eventType, 64),
    sessionId: trimText(input.sessionId, 64) || getSessionId(),
    traceId: trimText(input.traceId, 64),
    articleId: trimText(input.articleId, 80),
    articleTitle: trimText(input.articleTitle, 160),
    articleCategory: trimText(input.articleCategory, 80),
    sectionId: trimText(input.sectionId, 120),
    sectionTitle: trimText(input.sectionTitle, 160),
    sourcePage: trimText(input.sourcePage, 80),
    sourceRoute: trimText(input.sourceRoute, 255),
    sourceContext: trimText(input.sourceContext, 120),
    targetRoute: trimText(input.targetRoute, 255),
    audienceFilter: trimText(input.audienceFilter, 32),
    quickFilter: trimText(input.quickFilter, 32),
    result: (input.result || 'success'),
    errorCode: trimText(input.errorCode, 64),
    latencyMs: Math.max(0, Math.min(10 * 60 * 1000, Math.round(Number(input.latencyMs) || 0))),
    meta: sanitizeMeta(input.meta),
  }
}

async function requestObservabilityConfig() {
  const response = await window.fetch('/api/help-center/config', {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: 'application/json',
    },
  })
  if (!response.ok)
    throw new Error(`help center config request failed: ${response.status}`)
  const payload = await response.json()
  const data = payload?.data || {}
  return {
    telemetryEnabled: !!data.telemetryEnabled,
    feedbackEnabled: !!data.feedbackEnabled,
    jumpTracingEnabled: !!data.jumpTracingEnabled,
    telemetrySamplingRate: Math.max(0, Math.min(1, Number(data.telemetrySamplingRate) || 0)),
  } satisfies HelpCenterObservabilityPublicConfig
}

async function resolveConfig(force = false) {
  if (typeof window === 'undefined')
    return defaultConfig

  if (!force && configLoadedAt && (Date.now() - configLoadedAt) < TELEMETRY_CONFIG_TTL_MS)
    return cachedConfig

  if (configPromise)
    return configPromise

  configPromise = requestObservabilityConfig()
    .catch(() => ({ ...defaultConfig }))
    .then((nextConfig) => {
      cachedConfig = nextConfig
      configLoadedAt = Date.now()
      configPromise = null
      if (nextConfig.telemetryEnabled && getSamplingDecision(nextConfig) && pendingConfigQueue.length)
        enqueueEvents(pendingConfigQueue.splice(0, pendingConfigQueue.length))
      else
        pendingConfigQueue = []
      return nextConfig
    })

  return configPromise
}

function clearFlushTimer() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

function bindPagehideListener() {
  if (pagehideBound || typeof window === 'undefined')
    return

  pagehideBound = true
  window.addEventListener('pagehide', () => {
    void flushHelpCenterTelemetry({ keepalive: true })
  })
}

function scheduleFlush() {
  clearFlushTimer()
  flushTimer = setTimeout(() => {
    void flushHelpCenterTelemetry()
  }, DEFAULT_FLUSH_INTERVAL_MS)
}

function enqueueEvents(events: HelpCenterTelemetryEvent[]) {
  if (!events.length)
    return

  telemetryQueue.push(...events)
  if (telemetryQueue.length >= DEFAULT_BATCH_SIZE)
    void flushHelpCenterTelemetry()
  else
    scheduleFlush()
}

async function postTelemetryBatch(events: HelpCenterTelemetryEvent[], options: { keepalive?: boolean } = {}) {
  if (typeof window === 'undefined' || !events.length)
    return

  const payload = JSON.stringify({ events })

  if (options.keepalive && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon('/api/help-center/events/batch', blob))
        return
    }
    catch {
    }
  }

  await window.fetch('/api/help-center/events/batch', {
    method: 'POST',
    credentials: 'include',
    keepalive: !!options.keepalive,
    headers: {
      'Content-Type': 'application/json',
      'accept': 'application/json',
    },
    body: payload,
  })
}

export async function flushHelpCenterTelemetry(options: { keepalive?: boolean } = {}) {
  clearFlushTimer()

  if (!telemetryQueue.length)
    return

  const currentBatch = telemetryQueue.splice(0, DEFAULT_BATCH_SIZE)
  try {
    await postTelemetryBatch(currentBatch, options)
  }
  catch {
  }
  finally {
    if (telemetryQueue.length)
      scheduleFlush()
  }
}

export async function getHelpCenterObservabilityConfig(force = false) {
  return await resolveConfig(force)
}

export function initializeHelpCenterTelemetry() {
  bindPagehideListener()
  void resolveConfig(false)
}

export function trackHelpCenterEvent(input: HelpCenterTelemetryEventInput) {
  if (typeof window === 'undefined')
    return

  bindPagehideListener()
  const event = buildEvent(input)
  if (!event.eventType)
    return

  if (!configLoadedAt) {
    pendingConfigQueue.push(event)
    void resolveConfig(false)
    return
  }

  if (!cachedConfig.telemetryEnabled || !getSamplingDecision(cachedConfig))
    return

  enqueueEvents([event])
}

export function resetHelpCenterTelemetryState() {
  cachedConfig = { ...defaultConfig }
  configLoadedAt = 0
  configPromise = null
  telemetryQueue = []
  pendingConfigQueue = []
  clearFlushTimer()
}
