import type {
  HelpCenterAnalyticsArticleItem,
  HelpCenterAnalyticsEntryPageItem,
  HelpCenterAnalyticsJumpFailureItem,
  HelpCenterAnalyticsOverview,
  HelpCenterAnalyticsSearchKeywordItem,
  HelpCenterFeedbackItem,
  HelpCenterFeedbackListResponse,
  HelpCenterFeedbackPayload,
  HelpCenterObservabilitySettings,
} from '@/types/help-center-observability'
import api from '@/api'

export async function submitHelpCenterFeedback(payload: HelpCenterFeedbackPayload) {
  const response = await api.post('/api/help-center/feedback', payload)
  return response.data?.data as { id: number, feedbackNo: string, status: string }
}

export async function listHelpCenterFeedback(params: Record<string, unknown> = {}) {
  const response = await api.get('/api/help-center/feedback', { params })
  return (response.data?.data || { items: [], total: 0 }) as HelpCenterFeedbackListResponse
}

export async function getHelpCenterFeedback(id: number | string) {
  const response = await api.get(`/api/help-center/feedback/${id}`)
  return response.data?.data as HelpCenterFeedbackItem
}

export async function updateHelpCenterFeedback(id: number | string, payload: Record<string, unknown>) {
  const response = await api.patch(`/api/help-center/feedback/${id}`, payload)
  return response.data?.data as HelpCenterFeedbackItem
}

export async function assignHelpCenterFeedback(id: number | string, payload: { assignedTo?: string, ownerTeam?: string, status?: string }) {
  const response = await api.post(`/api/help-center/feedback/${id}/assign`, payload)
  return response.data?.data as HelpCenterFeedbackItem
}

export async function linkHelpCenterFeedbackBugReport(id: number | string, payload: { linkedBugReportNo: string, status?: string }) {
  const response = await api.post(`/api/help-center/feedback/${id}/link-bug-report`, payload)
  return response.data?.data as HelpCenterFeedbackItem
}

export async function getHelpCenterObservabilitySettings() {
  const response = await api.get('/api/settings/help-center-observability')
  return response.data?.data as HelpCenterObservabilitySettings
}

export async function saveHelpCenterObservabilitySettings(payload: Partial<HelpCenterObservabilitySettings>) {
  const response = await api.post('/api/settings/help-center-observability', payload)
  return response.data?.data as HelpCenterObservabilitySettings
}

export async function getHelpCenterAnalyticsOverview(params: Record<string, unknown> = {}) {
  const response = await api.get('/api/help-center/analytics/overview', { params })
  return response.data?.data as HelpCenterAnalyticsOverview
}

export async function getHelpCenterAnalyticsArticles(params: Record<string, unknown> = {}) {
  const response = await api.get('/api/help-center/analytics/articles', { params })
  return (response.data?.data?.items || []) as HelpCenterAnalyticsArticleItem[]
}

export async function getHelpCenterAnalyticsEntryPages(params: Record<string, unknown> = {}) {
  const response = await api.get('/api/help-center/analytics/entry-pages', { params })
  return (response.data?.data?.items || []) as HelpCenterAnalyticsEntryPageItem[]
}

export async function getHelpCenterAnalyticsSearchKeywords(params: Record<string, unknown> = {}) {
  const response = await api.get('/api/help-center/analytics/search-keywords', { params })
  return (response.data?.data?.items || []) as HelpCenterAnalyticsSearchKeywordItem[]
}

export async function getHelpCenterAnalyticsJumpFailures(params: Record<string, unknown> = {}) {
  const response = await api.get('/api/help-center/analytics/jump-failures', { params })
  return (response.data?.data?.items || []) as HelpCenterAnalyticsJumpFailureItem[]
}
