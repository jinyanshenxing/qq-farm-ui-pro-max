import type { HelpCenterTelemetryEventInput, HelpCenterTelemetryResult } from '@/types/help-center-observability'
import { trackHelpCenterEvent } from './help-center-telemetry'

export interface HelpCenterJumpTrace {
  traceId: string
  finish: (payload?: Partial<HelpCenterTelemetryEventInput> & { result?: HelpCenterTelemetryResult }) => void
}

export function createHelpCenterTraceId(prefix = 'hc-trace') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createHelpCenterJumpTrace(base: HelpCenterTelemetryEventInput): HelpCenterJumpTrace {
  const traceId = base.traceId || createHelpCenterTraceId()
  const startedAt = Date.now()
  let finished = false

  return {
    traceId,
    finish(payload = {}) {
      if (finished)
        return
      finished = true

      trackHelpCenterEvent({
        ...base,
        ...payload,
        traceId,
        latencyMs: payload.latencyMs ?? (Date.now() - startedAt),
        result: payload.result || 'success',
      })
    },
  }
}
