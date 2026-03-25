const { getPool } = require('./mysql-db');

const HELP_CENTER_COPY_EVENT_TYPES = Object.freeze([
    'copy_plain_text',
    'copy_markdown',
    'copy_code_block',
    'copy_command_block',
    'governance_template_copy',
]);

const HELP_CENTER_JUMP_EVENT_TYPES = Object.freeze([
    'context_help_open',
    'outline_jump',
    'related_route_click',
]);

function trimText(value, maxLength = 120) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeLimit(value, fallback = 10, max = 50) {
    const normalized = Number.parseInt(String(value ?? fallback), 10);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        return fallback;
    }
    return Math.min(max, normalized);
}

function normalizeSortBy(value) {
    const normalized = trimText(value, 40);
    if (['opens', 'copies', 'feedbacks', 'jump_failures'].includes(normalized)) {
        return normalized;
    }
    return 'opens';
}

function normalizeDateBoundary(value, endOfDay = false) {
    const text = trimText(value, 32);
    if (!text) {
        return null;
    }

    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text)
        ? `${text}${endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`
        : text;
    const timestamp = Date.parse(normalized);
    if (!Number.isFinite(timestamp)) {
        return null;
    }
    return new Date(timestamp);
}

function appendDateFilters(columnName, filters, where, params) {
    const dateFrom = normalizeDateBoundary(filters.dateFrom, false);
    const dateTo = normalizeDateBoundary(filters.dateTo, true);
    if (dateFrom) {
        where.push(`${columnName} >= ?`);
        params.push(dateFrom);
    }
    if (dateTo) {
        where.push(`${columnName} <= ?`);
        params.push(dateTo);
    }
}

function appendRoleFilter(filters, where, params) {
    const role = trimText(filters.role || filters.userRole, 32).toLowerCase();
    if (role === 'admin' || role === 'user' || role === 'guest') {
        where.push('user_role = ?');
        params.push(role);
    }
}

function appendCategoryFilter(filters, where, params) {
    const category = trimText(filters.category, 80);
    if (category) {
        where.push('article_category = ?');
        params.push(category);
    }
}

function buildWhereClause(where = []) {
    return where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
}

function normalizeKeyword(value) {
    return trimText(value, 120);
}

function createHelpCenterAnalyticsService(options = {}) {
    const getPoolRef = typeof options.getPool === 'function' ? options.getPool : getPool;

    async function getOverview(filters = {}) {
        const pool = getPoolRef();
        if (!pool) {
            return {
                articleOpenCount: 0,
                searchCount: 0,
                copyCount: 0,
                contextHelpOpenCount: 0,
                jumpSuccessRate: 0,
                jumpFailureCount: 0,
                feedbackOpenCount: 0,
            };
        }

        const eventWhere = [];
        const eventParams = [];
        appendDateFilters('created_at', filters, eventWhere, eventParams);
        appendRoleFilter(filters, eventWhere, eventParams);

        const [eventRows] = await pool.query(
            `SELECT
                SUM(CASE WHEN event_type IN ('article_open', 'article_switch') THEN 1 ELSE 0 END) AS article_open_count,
                SUM(CASE WHEN event_type = 'search_submit' THEN 1 ELSE 0 END) AS search_count,
                SUM(CASE WHEN event_type IN (${HELP_CENTER_COPY_EVENT_TYPES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS copy_count,
                SUM(CASE WHEN event_type = 'context_help_open' THEN 1 ELSE 0 END) AS context_help_open_count,
                SUM(CASE WHEN event_type IN (${HELP_CENTER_JUMP_EVENT_TYPES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS jump_total_count,
                SUM(CASE WHEN event_type IN (${HELP_CENTER_JUMP_EVENT_TYPES.map(() => '?').join(',')}) AND result = 'success' THEN 1 ELSE 0 END) AS jump_success_count,
                SUM(CASE WHEN event_type IN (${HELP_CENTER_JUMP_EVENT_TYPES.map(() => '?').join(',')}) AND result = 'failed' THEN 1 ELSE 0 END) AS jump_failure_count
             FROM help_center_events
             ${buildWhereClause(eventWhere)}`,
            [
                ...HELP_CENTER_COPY_EVENT_TYPES,
                ...HELP_CENTER_JUMP_EVENT_TYPES,
                ...HELP_CENTER_JUMP_EVENT_TYPES,
                ...HELP_CENTER_JUMP_EVENT_TYPES,
                ...eventParams,
            ],
        );

        const feedbackWhere = [];
        const feedbackParams = [];
        appendDateFilters('created_at', filters, feedbackWhere, feedbackParams);
        appendRoleFilter(filters, feedbackWhere, feedbackParams);
        const [feedbackRows] = await pool.query(
            `SELECT COUNT(*) AS feedback_open_count
             FROM help_center_feedback
             ${buildWhereClause(feedbackWhere)}`,
            feedbackParams,
        );

        const row = Array.isArray(eventRows) && eventRows[0] ? eventRows[0] : {};
        const feedbackRow = Array.isArray(feedbackRows) && feedbackRows[0] ? feedbackRows[0] : {};
        const jumpTotalCount = Number(row.jump_total_count || 0);
        const jumpSuccessCount = Number(row.jump_success_count || 0);

        return {
            articleOpenCount: Number(row.article_open_count || 0),
            searchCount: Number(row.search_count || 0),
            copyCount: Number(row.copy_count || 0),
            contextHelpOpenCount: Number(row.context_help_open_count || 0),
            jumpSuccessRate: jumpTotalCount > 0
                ? Math.round((jumpSuccessCount / jumpTotalCount) * 1000) / 10
                : 0,
            jumpFailureCount: Number(row.jump_failure_count || 0),
            feedbackOpenCount: Number(feedbackRow.feedback_open_count || 0),
        };
    }

    async function listArticleMetrics(filters = {}) {
        const pool = getPoolRef();
        if (!pool) {
            return { items: [] };
        }

        const limit = normalizeLimit(filters.limit, 10, 50);
        const sortBy = normalizeSortBy(filters.sortBy);
        const where = [`article_id <> ''`];
        const params = [
            ...HELP_CENTER_COPY_EVENT_TYPES,
            ...HELP_CENTER_JUMP_EVENT_TYPES,
        ];
        appendDateFilters('created_at', filters, where, params);
        appendRoleFilter(filters, where, params);
        appendCategoryFilter(filters, where, params);

        const [eventRows] = await pool.query(
            `SELECT
                article_id AS articleId,
                MAX(article_title) AS articleTitle,
                MAX(article_category) AS category,
                SUM(CASE WHEN event_type IN ('article_open', 'article_switch') THEN 1 ELSE 0 END) AS openCount,
                SUM(CASE WHEN event_type IN (${HELP_CENTER_COPY_EVENT_TYPES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS copyCount,
                SUM(CASE WHEN event_type IN (${HELP_CENTER_JUMP_EVENT_TYPES.map(() => '?').join(',')}) AND result = 'failed' THEN 1 ELSE 0 END) AS jumpFailureCount
             FROM help_center_events
             ${buildWhereClause(where)}
             GROUP BY article_id
             ORDER BY articleId ASC`,
            params,
        );

        const feedbackWhere = [];
        const feedbackParams = [];
        appendDateFilters('created_at', filters, feedbackWhere, feedbackParams);
        appendRoleFilter(filters, feedbackWhere, feedbackParams);
        appendCategoryFilter({ category: filters.category && trimText(filters.category, 80) }, feedbackWhere, feedbackParams);
        const [feedbackRows] = await pool.query(
            `SELECT article_id AS articleId, COUNT(*) AS feedbackCount
             FROM help_center_feedback
             WHERE article_id <> '' ${feedbackWhere.length ? `AND ${feedbackWhere.join(' AND ')}` : ''}
             GROUP BY article_id`,
            feedbackParams,
        );
        const feedbackCountMap = new Map(
            (feedbackRows || []).map(row => [String(row.articleId || '').trim(), Number(row.feedbackCount || 0)]),
        );

        const items = (eventRows || []).map((row) => {
            const articleId = trimText(row.articleId, 80);
            return {
                articleId,
                articleTitle: trimText(row.articleTitle, 160),
                category: trimText(row.category, 80),
                openCount: Number(row.openCount || 0),
                copyCount: Number(row.copyCount || 0),
                feedbackCount: feedbackCountMap.get(articleId) || 0,
                jumpFailureCount: Number(row.jumpFailureCount || 0),
            };
        });

        const sorters = {
            opens: (a, b) => b.openCount - a.openCount || b.copyCount - a.copyCount,
            copies: (a, b) => b.copyCount - a.copyCount || b.openCount - a.openCount,
            feedbacks: (a, b) => b.feedbackCount - a.feedbackCount || b.openCount - a.openCount,
            jump_failures: (a, b) => b.jumpFailureCount - a.jumpFailureCount || b.openCount - a.openCount,
        };
        items.sort((a, b) => sorters[sortBy](a, b) || a.articleTitle.localeCompare(b.articleTitle, 'zh-CN'));

        return {
            items: items.slice(0, limit),
        };
    }

    async function listEntryPages(filters = {}) {
        const pool = getPoolRef();
        if (!pool) {
            return { items: [] };
        }

        const limit = normalizeLimit(filters.limit, 10, 50);
        const where = [`source_page <> ''`];
        const params = [];
        appendDateFilters('created_at', filters, where, params);
        appendRoleFilter(filters, where, params);

        const [rows] = await pool.query(
            `SELECT
                source_page AS sourcePage,
                source_context AS sourceContext,
                COUNT(*) AS openCount,
                SUM(CASE WHEN result = 'failed' THEN 1 ELSE 0 END) AS failedCount
             FROM help_center_events
             ${buildWhereClause(where)}
             GROUP BY source_page, source_context
             ORDER BY openCount DESC, failedCount DESC
             LIMIT ${limit}`,
            params,
        );

        return {
            items: (rows || []).map(row => ({
                sourcePage: trimText(row.sourcePage, 80),
                sourceContext: trimText(row.sourceContext, 120),
                openCount: Number(row.openCount || 0),
                failedCount: Number(row.failedCount || 0),
            })),
        };
    }

    async function listSearchKeywords(filters = {}) {
        const pool = getPoolRef();
        if (!pool) {
            return { items: [] };
        }

        const limit = normalizeLimit(filters.limit, 10, 50);
        const where = [`event_type = 'search_submit'`];
        const params = [];
        appendDateFilters('created_at', filters, where, params);
        appendRoleFilter(filters, where, params);

        const [rows] = await pool.query(
            `SELECT
                JSON_UNQUOTE(JSON_EXTRACT(meta_json, '$.searchKeyword')) AS keyword,
                COUNT(*) AS searchCount
             FROM help_center_events
             ${buildWhereClause(where)}
             GROUP BY keyword
             HAVING keyword IS NOT NULL AND keyword <> ''
             ORDER BY searchCount DESC, keyword ASC
             LIMIT ${limit}`,
            params,
        );

        return {
            items: (rows || []).map(row => ({
                keyword: normalizeKeyword(row.keyword),
                searchCount: Number(row.searchCount || 0),
            })).filter(item => item.keyword),
        };
    }

    async function listJumpFailures(filters = {}) {
        const pool = getPoolRef();
        if (!pool) {
            return { items: [] };
        }

        const limit = normalizeLimit(filters.limit, 10, 50);
        const where = [
            `event_type IN (${HELP_CENTER_JUMP_EVENT_TYPES.map(() => '?').join(',')})`,
            `(result = 'failed' OR result = 'fallback')`,
        ];
        const params = [...HELP_CENTER_JUMP_EVENT_TYPES];
        appendDateFilters('created_at', filters, where, params);
        appendRoleFilter(filters, where, params);

        const [rows] = await pool.query(
            `SELECT
                source_page AS sourcePage,
                source_context AS sourceContext,
                article_id AS articleId,
                MAX(article_title) AS articleTitle,
                section_id AS sectionId,
                error_code AS errorCode,
                COUNT(*) AS failureCount,
                ROUND(AVG(latency_ms)) AS avgLatencyMs,
                SUM(CASE WHEN result = 'fallback' THEN 1 ELSE 0 END) AS fallbackCount
             FROM help_center_events
             ${buildWhereClause(where)}
             GROUP BY source_page, source_context, article_id, section_id, error_code
             ORDER BY failureCount DESC, avgLatencyMs DESC
             LIMIT ${limit}`,
            params,
        );

        return {
            items: (rows || []).map(row => ({
                sourcePage: trimText(row.sourcePage, 80),
                sourceContext: trimText(row.sourceContext, 120),
                articleId: trimText(row.articleId, 80),
                articleTitle: trimText(row.articleTitle, 160),
                sectionId: trimText(row.sectionId, 120),
                errorCode: trimText(row.errorCode, 64),
                failureCount: Number(row.failureCount || 0),
                avgLatencyMs: Number(row.avgLatencyMs || 0),
                fallbackCount: Number(row.fallbackCount || 0),
            })),
        };
    }

    return {
        getOverview,
        listArticleMetrics,
        listEntryPages,
        listSearchKeywords,
        listJumpFailures,
    };
}

module.exports = {
    HELP_CENTER_COPY_EVENT_TYPES,
    HELP_CENTER_JUMP_EVENT_TYPES,
    createHelpCenterAnalyticsService,
};
