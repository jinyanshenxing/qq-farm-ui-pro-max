export type HelpCenterTelemetryResult = 'success' | 'failed' | 'fallback' | 'cancelled'

export interface HelpCenterObservabilityPublicConfig {
  telemetryEnabled: boolean
  feedbackEnabled: boolean
  jumpTracingEnabled: boolean
  telemetrySamplingRate: number
}

export interface HelpCenterObservabilitySettings extends HelpCenterObservabilityPublicConfig {
  batchSize: number
  flushIntervalMs: number
  retentionDays: number
}

export interface HelpCenterTelemetryEventInput {
  eventNo?: string
  eventType: string
  sessionId?: string
  traceId?: string
  articleId?: string
  articleTitle?: string
  articleCategory?: string
  sectionId?: string
  sectionTitle?: string
  sourcePage?: string
  sourceRoute?: string
  sourceContext?: string
  targetRoute?: string
  audienceFilter?: string
  quickFilter?: string
  result?: HelpCenterTelemetryResult
  errorCode?: string
  latencyMs?: number
  meta?: Record<string, unknown>
}

export interface HelpCenterTelemetryEvent extends HelpCenterTelemetryEventInput {
  eventNo: string
  sessionId: string
}

export interface HelpCenterFeedbackPayload {
  articleId: string
  articleTitle: string
  sectionId?: string
  sectionTitle?: string
  feedbackType?: 'outdated' | 'missing_step' | 'unclear' | 'wrong_route' | 'copy_issue' | 'jump_failed' | 'other'
  priority?: 'low' | 'medium' | 'high' | 'critical'
  sourcePage?: string
  sourceRoute?: string
  sourceContext?: string
  audienceFilter?: string
  quickFilter?: string
  message: string
  expectedBehavior?: string
  actualBehavior?: string
  attachmentMeta?: Record<string, string>
}

export interface HelpCenterFeedbackItem extends HelpCenterFeedbackPayload {
  id: number
  feedbackNo: string
  status: 'open' | 'triaged' | 'in_progress' | 'resolved' | 'rejected' | 'merged_to_bug_report'
  username?: string
  userRole?: string
  assignedTo?: string
  ownerTeam?: string
  linkedBugReportNo?: string
  lastFollowUpAt?: string
  resolvedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface HelpCenterFeedbackListResponse {
  items: HelpCenterFeedbackItem[]
  total: number
}

export interface HelpCenterAnalyticsOverview {
  articleOpenCount: number
  searchCount: number
  copyCount: number
  contextHelpOpenCount: number
  jumpSuccessRate: number
  jumpFailureCount: number
  feedbackOpenCount: number
}

export interface HelpCenterAnalyticsArticleItem {
  articleId: string
  articleTitle: string
  category: string
  openCount: number
  copyCount: number
  feedbackCount: number
  jumpFailureCount: number
}

export interface HelpCenterAnalyticsEntryPageItem {
  sourcePage: string
  sourceContext: string
  openCount: number
  failedCount: number
}

export interface HelpCenterAnalyticsSearchKeywordItem {
  keyword: string
  searchCount: number
}

export interface HelpCenterAnalyticsJumpFailureItem {
  sourcePage: string
  sourceContext: string
  articleId: string
  articleTitle: string
  sectionId: string
  errorCode: string
  failureCount: number
  avgLatencyMs: number
  fallbackCount: number
}
