const { createModuleLogger } = require('./logger');
const { validateHelpCenterObservabilityConfig } = require('./config-validator');
const { getPool } = require('./mysql-db');
const { getSystemSetting, setSystemSetting, SYSTEM_SETTING_KEYS } = require('./system-settings');

const helpCenterEventLogger = createModuleLogger('help-center-events');

const MAX_BATCH_SIZE = 50;
const MAX_META_KEYS = 12;
const MAX_META_ARRAY_LENGTH = 6;
const ALLOWED_RESULT_VALUES = new Set(['success', 'failed', 'fallback', 'cancelled']);
const ALLOWED_ROLE_VALUES = new Set(['admin', 'user', 'guest']);

const DEFAULT_HELP_CENTER_OBSERVABILITY_CONFIG = Object.freeze({
    telemetryEnabled: false,
    feedbackEnabled: false,
    jumpTracingEnabled: false,
    telemetrySamplingRate: 0,
    batchSize: 20,
    flushIntervalMs: 15000,
    retentionDays: 90,
});

function trimText(value, maxLength = 255) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeInteger(value, fallback = 0, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const normalized = Number.parseInt(String(value ?? fallback), 10);
    if (!Number.isFinite(normalized)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, normalized));
}

function normalizeNumber(value, fallback = 0, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, normalized));
}

function normalizeRole(value) {
    const normalized = trimText(value, 32).toLowerCase();
    return ALLOWED_ROLE_VALUES.has(normalized) ? normalized : 'user';
}

function normalizeResult(value) {
    const normalized = trimText(value, 24).toLowerCase();
    return ALLOWED_RESULT_VALUES.has(normalized) ? normalized : 'success';
}

function sanitizeMetaValue(value) {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return undefined;
        }
        return Math.round(value * 1000) / 1000;
    }
    if (typeof value === 'string') {
        const normalized = trimText(value, 240);
        return normalized || undefined;
    }
    if (Array.isArray(value)) {
        const items = value
            .map(item => sanitizeMetaValue(item))
            .filter(item => item !== undefined)
            .slice(0, MAX_META_ARRAY_LENGTH);
        return items.length > 0 ? items : undefined;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value)
            .slice(0, MAX_META_KEYS)
            .map(([key, nestedValue]) => [trimText(key, 60), sanitizeMetaValue(nestedValue)])
            .filter(([key, nestedValue]) => key && nestedValue !== undefined);
        return entries.length > 0 ? Object.fromEntries(entries) : undefined;
    }
    return undefined;
}

function normalizeMeta(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return null;
    }
    const entries = Object.entries(input)
        .slice(0, MAX_META_KEYS)
        .map(([key, value]) => [trimText(key, 60), sanitizeMetaValue(value)])
        .filter(([key, value]) => key && value !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function normalizeHelpCenterObservabilityConfig(input, fallback = DEFAULT_HELP_CENTER_OBSERVABILITY_CONFIG) {
    const validation = validateHelpCenterObservabilityConfig(input || {});
    const next = validation.coerced || {};
    const current = (fallback && typeof fallback === 'object')
        ? fallback
        : DEFAULT_HELP_CENTER_OBSERVABILITY_CONFIG;
    return {
        telemetryEnabled: next.telemetryEnabled !== undefined ? !!next.telemetryEnabled : !!current.telemetryEnabled,
        feedbackEnabled: next.feedbackEnabled !== undefined ? !!next.feedbackEnabled : !!current.feedbackEnabled,
        jumpTracingEnabled: next.jumpTracingEnabled !== undefined ? !!next.jumpTracingEnabled : !!current.jumpTracingEnabled,
        telemetrySamplingRate: normalizeNumber(
            next.telemetrySamplingRate,
            current.telemetrySamplingRate,
            { min: 0, max: 1 },
        ),
        batchSize: normalizeInteger(next.batchSize, current.batchSize, { min: 1, max: MAX_BATCH_SIZE }),
        flushIntervalMs: normalizeInteger(next.flushIntervalMs, current.flushIntervalMs, { min: 1000, max: 60000 }),
        retentionDays: normalizeInteger(next.retentionDays, current.retentionDays, { min: 7, max: 365 }),
    };
}

async function getHelpCenterObservabilityConfig() {
    const stored = await getSystemSetting(
        SYSTEM_SETTING_KEYS.HELP_CENTER_OBSERVABILITY_CONFIG,
        DEFAULT_HELP_CENTER_OBSERVABILITY_CONFIG,
    );
    return normalizeHelpCenterObservabilityConfig(stored, DEFAULT_HELP_CENTER_OBSERVABILITY_CONFIG);
}

async function setHelpCenterObservabilityConfig(input) {
    const current = await getHelpCenterObservabilityConfig();
    const next = normalizeHelpCenterObservabilityConfig(input, current);
    await setSystemSetting(SYSTEM_SETTING_KEYS.HELP_CENTER_OBSERVABILITY_CONFIG, next);
    return next;
}

function buildPublicHelpCenterObservabilityConfig(config = DEFAULT_HELP_CENTER_OBSERVABILITY_CONFIG) {
    const normalized = normalizeHelpCenterObservabilityConfig(config, DEFAULT_HELP_CENTER_OBSERVABILITY_CONFIG);
    return {
        telemetryEnabled: !!normalized.telemetryEnabled,
        feedbackEnabled: !!normalized.feedbackEnabled,
        jumpTracingEnabled: !!normalized.jumpTracingEnabled,
        telemetrySamplingRate: normalized.telemetrySamplingRate,
    };
}

function normalizeHelpCenterEvent(rawEvent = {}, currentUser = null) {
    if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
        return null;
    }

    const eventNo = trimText(rawEvent.eventNo, 40);
    const eventType = trimText(rawEvent.eventType, 64);
    if (!eventNo || !eventType) {
        return null;
    }

    const currentUserObject = currentUser && typeof currentUser === 'object'
        ? currentUser
        : {};
    const userIdCandidate = currentUserObject.id !== undefined
        ? currentUserObject.id
        : rawEvent.userId;
    const userId = Number.isFinite(Number(userIdCandidate)) ? Number(userIdCandidate) : null;
    const username = trimText(currentUserObject.username || rawEvent.username, 64);
    const userRole = normalizeRole(currentUserObject.role || rawEvent.userRole || 'user');

    return {
        eventNo,
        eventType,
        sessionId: trimText(rawEvent.sessionId, 64),
        traceId: trimText(rawEvent.traceId, 64),
        userId,
        username,
        userRole,
        articleId: trimText(rawEvent.articleId, 80),
        articleTitle: trimText(rawEvent.articleTitle, 160),
        articleCategory: trimText(rawEvent.articleCategory, 80),
        sectionId: trimText(rawEvent.sectionId, 120),
        sectionTitle: trimText(rawEvent.sectionTitle, 160),
        sourcePage: trimText(rawEvent.sourcePage, 80),
        sourceRoute: trimText(rawEvent.sourceRoute, 255),
        sourceContext: trimText(rawEvent.sourceContext, 120),
        targetRoute: trimText(rawEvent.targetRoute, 255),
        audienceFilter: trimText(rawEvent.audienceFilter, 32),
        quickFilter: trimText(rawEvent.quickFilter, 32),
        result: normalizeResult(rawEvent.result),
        errorCode: trimText(rawEvent.errorCode, 64),
        latencyMs: normalizeInteger(rawEvent.latencyMs, 0, { min: 0, max: 10 * 60 * 1000 }),
        metaJson: normalizeMeta(rawEvent.meta),
        createdAt: rawEvent.createdAt || null,
    };
}

async function appendDailyEventAggregates(pool, events = []) {
    if (!pool || !Array.isArray(events) || events.length === 0) {
        return;
    }

    const grouped = new Map();

    for (const event of events) {
        const recordDate = new Date(event.createdAt || Date.now()).toISOString().slice(0, 10);
        const groupKey = [
            recordDate,
            event.eventType,
            event.articleId,
            event.sourcePage,
            event.userRole,
            event.result,
        ].join('::');
        const current = grouped.get(groupKey) || {
            recordDate,
            eventType: event.eventType,
            articleId: event.articleId,
            articleCategory: event.articleCategory,
            sourcePage: event.sourcePage,
            userRole: event.userRole,
            result: event.result,
            eventCount: 0,
            successCount: 0,
            failedCount: 0,
            latencyTotal: 0,
        };
        current.eventCount += 1;
        current.successCount += event.result === 'success' ? 1 : 0;
        current.failedCount += event.result === 'failed' ? 1 : 0;
        current.latencyTotal += event.latencyMs;
        grouped.set(groupKey, current);
    }

    for (const item of grouped.values()) {
        const averageLatency = item.eventCount > 0
            ? Math.round(item.latencyTotal / item.eventCount)
            : 0;
        await pool.execute(
            `INSERT INTO help_center_event_daily
                (record_date, event_type, article_id, article_category, source_page, user_role, result, event_count, user_count, success_count, failed_count, avg_latency_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                article_category = VALUES(article_category),
                event_count = event_count + VALUES(event_count),
                success_count = success_count + VALUES(success_count),
                failed_count = failed_count + VALUES(failed_count),
                avg_latency_ms = CASE
                    WHEN event_count + VALUES(event_count) <= 0 THEN VALUES(avg_latency_ms)
                    ELSE ROUND(((avg_latency_ms * event_count) + (VALUES(avg_latency_ms) * VALUES(event_count))) / (event_count + VALUES(event_count)))
                END`,
            [
                item.recordDate,
                item.eventType,
                item.articleId,
                item.articleCategory,
                item.sourcePage,
                item.userRole,
                item.result,
                item.eventCount,
                0,
                item.successCount,
                item.failedCount,
                averageLatency,
            ],
        );
    }
}

function createHelpCenterEventService(options = {}) {
    const getPoolRef = typeof options.getPool === 'function' ? options.getPool : getPool;
    const getConfigRef = typeof options.getConfig === 'function'
        ? options.getConfig
        : getHelpCenterObservabilityConfig;
    const logger = options.logger || helpCenterEventLogger;

    async function acceptEventBatch({ currentUser = null, payload = {} } = {}) {
        const batchPayload = payload && typeof payload === 'object' ? payload : {};
        const rawEvents = Array.isArray(batchPayload.events) ? batchPayload.events.slice(0, MAX_BATCH_SIZE) : [];
        if (rawEvents.length === 0) {
            return { accepted: 0, ignored: 0 };
        }

        const config = await getConfigRef();
        if (!config.telemetryEnabled) {
            return {
                accepted: 0,
                ignored: rawEvents.length,
                disabled: true,
            };
        }

        const events = rawEvents
            .map(event => normalizeHelpCenterEvent(event, currentUser))
            .filter(Boolean);
        const ignored = rawEvents.length - events.length;

        if (events.length === 0) {
            return {
                accepted: 0,
                ignored,
            };
        }

        const pool = getPoolRef();
        if (!pool) {
            return {
                accepted: 0,
                ignored: rawEvents.length,
                unavailable: true,
            };
        }

        try {
            for (const event of events) {
                await pool.execute(
                    `INSERT INTO help_center_events
                        (event_no, event_type, session_id, trace_id, user_id, username, user_role, article_id, article_title, article_category, section_id, section_title, source_page, source_route, source_context, target_route, audience_filter, quick_filter, result, error_code, latency_ms, meta_json, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
                     ON DUPLICATE KEY UPDATE
                        trace_id = VALUES(trace_id),
                        user_id = VALUES(user_id),
                        username = VALUES(username),
                        user_role = VALUES(user_role),
                        article_id = VALUES(article_id),
                        article_title = VALUES(article_title),
                        article_category = VALUES(article_category),
                        section_id = VALUES(section_id),
                        section_title = VALUES(section_title),
                        source_page = VALUES(source_page),
                        source_route = VALUES(source_route),
                        source_context = VALUES(source_context),
                        target_route = VALUES(target_route),
                        audience_filter = VALUES(audience_filter),
                        quick_filter = VALUES(quick_filter),
                        result = VALUES(result),
                        error_code = VALUES(error_code),
                        latency_ms = VALUES(latency_ms),
                        meta_json = VALUES(meta_json)`,
                    [
                        event.eventNo,
                        event.eventType,
                        event.sessionId,
                        event.traceId,
                        event.userId,
                        event.username,
                        event.userRole,
                        event.articleId,
                        event.articleTitle,
                        event.articleCategory,
                        event.sectionId,
                        event.sectionTitle,
                        event.sourcePage,
                        event.sourceRoute,
                        event.sourceContext,
                        event.targetRoute,
                        event.audienceFilter,
                        event.quickFilter,
                        event.result,
                        event.errorCode,
                        event.latencyMs,
                        event.metaJson ? JSON.stringify(event.metaJson) : null,
                        event.createdAt,
                    ],
                );
            }

            await appendDailyEventAggregates(pool, events);

            return {
                accepted: events.length,
                ignored,
            };
        } catch (error) {
            logger.warn(`帮助中心埋点写入失败: ${error && error.message ? error.message : String(error)}`);
            return {
                accepted: 0,
                ignored: rawEvents.length,
                failed: true,
            };
        }
    }

    return {
        acceptEventBatch,
    };
}

module.exports = {
    MAX_BATCH_SIZE,
    DEFAULT_HELP_CENTER_OBSERVABILITY_CONFIG,
    normalizeHelpCenterObservabilityConfig,
    getHelpCenterObservabilityConfig,
    setHelpCenterObservabilityConfig,
    buildPublicHelpCenterObservabilityConfig,
    normalizeHelpCenterEvent,
    createHelpCenterEventService,
};
