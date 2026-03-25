const { createModuleLogger } = require('./logger');
const { getPool } = require('./mysql-db');
const {
    DEFAULT_HELP_CENTER_OBSERVABILITY_CONFIG,
    getHelpCenterObservabilityConfig,
} = require('./help-center-event-service');

const helpCenterFeedbackLogger = createModuleLogger('help-center-feedback');

const FEEDBACK_TYPE_SET = new Set(['outdated', 'missing_step', 'unclear', 'wrong_route', 'copy_issue', 'jump_failed', 'other']);
const PRIORITY_SET = new Set(['low', 'medium', 'high', 'critical']);
const STATUS_SET = new Set(['open', 'triaged', 'in_progress', 'resolved', 'rejected', 'merged_to_bug_report']);

function trimText(value, maxLength = 255) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeEnum(value, allowed, fallback) {
    const normalized = trimText(value, 40).toLowerCase();
    return allowed.has(normalized) ? normalized : fallback;
}

function normalizeTimestamp(value) {
    const timestamp = Date.parse(String(value || ''));
    if (!Number.isFinite(timestamp)) {
        return null;
    }
    return new Date(timestamp);
}

function normalizeAttachmentMeta(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return null;
    }
    const entries = Object.entries(input)
        .slice(0, 8)
        .map(([key, value]) => [trimText(key, 60), trimText(value, 240)])
        .filter(([key, value]) => key && value);
    return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function parseJsonValue(value) {
    if (!value) {
        return null;
    }
    try {
        if (typeof value === 'string') {
            return JSON.parse(value);
        }
        if (typeof value === 'object') {
            return value;
        }
    } catch {
        return null;
    }
    return null;
}

function formatDateTime(value) {
    const date = value instanceof Date ? value : normalizeTimestamp(value);
    return date ? date.toISOString() : '';
}

function createFeedbackNo(date = new Date()) {
    const pad = item => String(item).padStart(2, '0');
    const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    return `HCF${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function normalizeFeedbackPayload(payload = {}, currentUser = null) {
    const input = payload && typeof payload === 'object' ? payload : {};
    const user = currentUser && typeof currentUser === 'object' ? currentUser : {};
    const message = trimText(input.message, 5000);
    const articleId = trimText(input.articleId, 80);
    const articleTitle = trimText(input.articleTitle, 160);

    if (!message) {
        const error = new Error('反馈内容不能为空');
        error.statusCode = 400;
        error.code = 'help_center_invalid_payload';
        throw error;
    }
    if (!articleId || !articleTitle) {
        const error = new Error('反馈必须关联具体帮助文档');
        error.statusCode = 400;
        error.code = 'help_center_invalid_payload';
        throw error;
    }

    return {
        feedbackNo: trimText(input.feedbackNo, 40) || createFeedbackNo(),
        articleId,
        articleTitle,
        sectionId: trimText(input.sectionId, 120),
        sectionTitle: trimText(input.sectionTitle, 160),
        feedbackType: normalizeEnum(input.feedbackType, FEEDBACK_TYPE_SET, 'other'),
        priority: normalizeEnum(input.priority, PRIORITY_SET, 'medium'),
        status: 'open',
        username: trimText(user.username, 64),
        userRole: trimText(user.role, 32) || 'user',
        sourcePage: trimText(input.sourcePage, 80),
        sourceRoute: trimText(input.sourceRoute, 255),
        sourceContext: trimText(input.sourceContext, 120),
        audienceFilter: trimText(input.audienceFilter, 32),
        quickFilter: trimText(input.quickFilter, 32),
        message,
        expectedBehavior: trimText(input.expectedBehavior, 5000),
        actualBehavior: trimText(input.actualBehavior, 5000),
        attachmentMeta: normalizeAttachmentMeta(input.attachmentMeta),
        assignedTo: '',
        ownerTeam: '',
        linkedBugReportNo: '',
    };
}

function mapFeedbackRow(row = {}) {
    return {
        id: Number(row.id || 0),
        feedbackNo: trimText(row.feedback_no, 40),
        articleId: trimText(row.article_id, 80),
        articleTitle: trimText(row.article_title, 160),
        sectionId: trimText(row.section_id, 120),
        sectionTitle: trimText(row.section_title, 160),
        feedbackType: normalizeEnum(row.feedback_type, FEEDBACK_TYPE_SET, 'other'),
        priority: normalizeEnum(row.priority, PRIORITY_SET, 'medium'),
        status: normalizeEnum(row.status, STATUS_SET, 'open'),
        username: trimText(row.username, 64),
        userRole: trimText(row.user_role, 32),
        sourcePage: trimText(row.source_page, 80),
        sourceRoute: trimText(row.source_route, 255),
        sourceContext: trimText(row.source_context, 120),
        audienceFilter: trimText(row.audience_filter, 32),
        quickFilter: trimText(row.quick_filter, 32),
        message: trimText(row.message, 5000),
        expectedBehavior: trimText(row.expected_behavior, 5000),
        actualBehavior: trimText(row.actual_behavior, 5000),
        attachmentMeta: parseJsonValue(row.attachment_meta),
        assignedTo: trimText(row.assigned_to, 64),
        ownerTeam: trimText(row.owner_team, 64),
        linkedBugReportNo: trimText(row.linked_bug_report_no, 40),
        lastFollowUpAt: formatDateTime(row.last_follow_up_at),
        resolvedAt: formatDateTime(row.resolved_at),
        createdAt: formatDateTime(row.created_at),
        updatedAt: formatDateTime(row.updated_at),
    };
}

function buildFeatureDisabledError(message = '帮助中心反馈功能未开启') {
    const error = new Error(message);
    error.statusCode = 403;
    error.code = 'help_center_feature_disabled';
    return error;
}

function createHelpCenterFeedbackService(options = {}) {
    const getPoolRef = typeof options.getPool === 'function' ? options.getPool : getPool;
    const getConfigRef = typeof options.getConfig === 'function'
        ? options.getConfig
        : getHelpCenterObservabilityConfig;
    const adminOperationLogService = options.adminOperationLogService || null;
    const logger = options.logger || helpCenterFeedbackLogger;

    async function ensureFeedbackEnabled() {
        const config = await getConfigRef().catch(() => DEFAULT_HELP_CENTER_OBSERVABILITY_CONFIG);
        if (!config.feedbackEnabled) {
            throw buildFeatureDisabledError();
        }
        return config;
    }

    async function submitFeedback({ currentUser = null, payload = {} } = {}) {
        await ensureFeedbackEnabled();

        const entry = normalizeFeedbackPayload(payload, currentUser);
        const pool = getPoolRef();
        if (!pool) {
            const error = new Error('帮助中心反馈存储不可用');
            error.statusCode = 503;
            error.code = 'help_center_internal_error';
            throw error;
        }

        const [result] = await pool.query(
            `INSERT INTO help_center_feedback
                (feedback_no, article_id, article_title, section_id, section_title, feedback_type, priority, status, username, user_role, source_page, source_route, source_context, audience_filter, quick_filter, message, expected_behavior, actual_behavior, attachment_meta, assigned_to, owner_team, linked_bug_report_no)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entry.feedbackNo,
                entry.articleId,
                entry.articleTitle,
                entry.sectionId,
                entry.sectionTitle,
                entry.feedbackType,
                entry.priority,
                entry.status,
                entry.username,
                entry.userRole,
                entry.sourcePage,
                entry.sourceRoute,
                entry.sourceContext,
                entry.audienceFilter,
                entry.quickFilter,
                entry.message,
                entry.expectedBehavior,
                entry.actualBehavior,
                entry.attachmentMeta ? JSON.stringify(entry.attachmentMeta) : null,
                entry.assignedTo,
                entry.ownerTeam,
                entry.linkedBugReportNo,
            ],
        );

        return {
            id: Number(result && result.insertId) || 0,
            feedbackNo: entry.feedbackNo,
            status: entry.status,
        };
    }

    async function listFeedback(filters = {}) {
        await ensureFeedbackEnabled();

        const pool = getPoolRef();
        if (!pool) {
            return { items: [], total: 0 };
        }

        const where = [];
        const params = [];
        const status = trimText(filters.status, 24).toLowerCase();
        const type = trimText(filters.feedbackType || filters.type, 32).toLowerCase();
        const priority = trimText(filters.priority, 16).toLowerCase();
        const assignedTo = trimText(filters.assignedTo, 64);
        const keyword = trimText(filters.keyword, 120);
        const limit = Math.min(Math.max(Number.parseInt(String(filters.limit || 24), 10) || 24, 1), 100);

        if (STATUS_SET.has(status)) {
            where.push('status = ?');
            params.push(status);
        }
        if (FEEDBACK_TYPE_SET.has(type)) {
            where.push('feedback_type = ?');
            params.push(type);
        }
        if (PRIORITY_SET.has(priority)) {
            where.push('priority = ?');
            params.push(priority);
        }
        if (assignedTo) {
            where.push('assigned_to = ?');
            params.push(assignedTo);
        }
        if (keyword) {
            const likeKeyword = `%${keyword}%`;
            where.push(`(
                article_id LIKE ?
                OR article_title LIKE ?
                OR section_title LIKE ?
                OR username LIKE ?
                OR message LIKE ?
            )`);
            params.push(likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword);
        }

        const sql = `SELECT
                id, feedback_no, article_id, article_title, section_id, section_title, feedback_type, priority, status, username, user_role,
                source_page, source_route, source_context, audience_filter, quick_filter, message, expected_behavior, actual_behavior,
                attachment_meta, assigned_to, owner_team, linked_bug_report_no, last_follow_up_at, resolved_at, created_at, updated_at
             FROM help_center_feedback
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY created_at DESC, id DESC
             LIMIT ${limit}`;
        const [rows] = await pool.query(sql, params);
        return {
            items: (rows || []).map(mapFeedbackRow),
            total: Array.isArray(rows) ? rows.length : 0,
        };
    }

    async function getFeedbackById(id) {
        await ensureFeedbackEnabled();

        const pool = getPoolRef();
        if (!pool) {
            return null;
        }

        const feedbackId = Number(id) || 0;
        if (feedbackId <= 0) {
            return null;
        }

        const [rows] = await pool.query(
            `SELECT
                id, feedback_no, article_id, article_title, section_id, section_title, feedback_type, priority, status, username, user_role,
                source_page, source_route, source_context, audience_filter, quick_filter, message, expected_behavior, actual_behavior,
                attachment_meta, assigned_to, owner_team, linked_bug_report_no, last_follow_up_at, resolved_at, created_at, updated_at
             FROM help_center_feedback
             WHERE id = ?
             LIMIT 1`,
            [feedbackId],
        );
        return rows && rows[0] ? mapFeedbackRow(rows[0]) : null;
    }

    async function writeAuditLog(actor, actionLabel, detailLines = []) {
        if (!adminOperationLogService || typeof adminOperationLogService.createAdminOperationLog !== 'function') {
            return;
        }
        try {
            await adminOperationLogService.createAdminOperationLog({
                actorUsername: trimText(actor && actor.username, 64) || 'admin',
                scope: 'help_center',
                actionLabel,
                status: 'success',
                totalCount: 1,
                successCount: 1,
                failedCount: 0,
                detailLines,
            });
        } catch (error) {
            logger.warn(`帮助中心反馈审计写入失败: ${error && error.message ? error.message : String(error)}`);
        }
    }

    async function updateFeedback(id, changes = {}, actor = null) {
        await ensureFeedbackEnabled();

        const pool = getPoolRef();
        if (!pool) {
            const error = new Error('帮助中心反馈存储不可用');
            error.statusCode = 503;
            error.code = 'help_center_internal_error';
            throw error;
        }

        const feedbackId = Number(id) || 0;
        if (feedbackId <= 0) {
            const error = new Error('帮助中心反馈不存在');
            error.statusCode = 404;
            error.code = 'help_center_not_found';
            throw error;
        }

        const fields = [];
        const params = [];
        const nextStatus = trimText(changes.status, 24).toLowerCase();
        const nextPriority = trimText(changes.priority, 16).toLowerCase();
        const nextAssignedTo = trimText(changes.assignedTo, 64);
        const nextOwnerTeam = trimText(changes.ownerTeam, 64);
        const nextLinkedBugReportNo = trimText(changes.linkedBugReportNo, 40);

        if (STATUS_SET.has(nextStatus)) {
            fields.push('status = ?');
            params.push(nextStatus);
            if (nextStatus === 'resolved' || nextStatus === 'merged_to_bug_report') {
                fields.push('resolved_at = CURRENT_TIMESTAMP');
            } else {
                fields.push('resolved_at = NULL');
            }
        }
        if (PRIORITY_SET.has(nextPriority)) {
            fields.push('priority = ?');
            params.push(nextPriority);
        }
        if (changes.assignedTo !== undefined) {
            fields.push('assigned_to = ?');
            params.push(nextAssignedTo);
        }
        if (changes.ownerTeam !== undefined) {
            fields.push('owner_team = ?');
            params.push(nextOwnerTeam);
        }
        if (changes.linkedBugReportNo !== undefined) {
            fields.push('linked_bug_report_no = ?');
            params.push(nextLinkedBugReportNo);
        }
        fields.push('last_follow_up_at = CURRENT_TIMESTAMP');

        if (fields.length === 1) {
            const current = await getFeedbackById(feedbackId);
            if (!current) {
                const error = new Error('帮助中心反馈不存在');
                error.statusCode = 404;
                error.code = 'help_center_not_found';
                throw error;
            }
            return current;
        }

        params.push(feedbackId);
        const [result] = await pool.query(
            `UPDATE help_center_feedback
             SET ${fields.join(', ')}
             WHERE id = ?`,
            params,
        );

        if (!Number(result && result.affectedRows)) {
            const error = new Error('帮助中心反馈不存在');
            error.statusCode = 404;
            error.code = 'help_center_not_found';
            throw error;
        }

        await writeAuditLog(actor, '更新帮助中心反馈', [
            `反馈 ID: ${feedbackId}`,
            nextStatus ? `状态: ${nextStatus}` : '',
            nextAssignedTo ? `指派: ${nextAssignedTo}` : '',
            nextLinkedBugReportNo ? `关联 BUG: ${nextLinkedBugReportNo}` : '',
        ].filter(Boolean));

        return await getFeedbackById(feedbackId);
    }

    async function assignFeedback(id, payload = {}, actor = null) {
        return await updateFeedback(id, {
            assignedTo: payload.assignedTo,
            ownerTeam: payload.ownerTeam,
            status: payload.status || 'triaged',
        }, actor);
    }

    async function linkBugReport(id, payload = {}, actor = null) {
        const linkedBugReportNo = trimText(payload.linkedBugReportNo || payload.bugReportNo, 40);
        if (!linkedBugReportNo) {
            const error = new Error('缺少关联的 BUG 单号');
            error.statusCode = 400;
            error.code = 'help_center_invalid_payload';
            throw error;
        }
        return await updateFeedback(id, {
            linkedBugReportNo,
            status: payload.status || 'merged_to_bug_report',
        }, actor);
    }

    return {
        submitFeedback,
        listFeedback,
        getFeedbackById,
        updateFeedback,
        assignFeedback,
        linkBugReport,
    };
}

module.exports = {
    FEEDBACK_TYPE_SET,
    PRIORITY_SET,
    STATUS_SET,
    normalizeFeedbackPayload,
    mapFeedbackRow,
    createHelpCenterFeedbackService,
};
