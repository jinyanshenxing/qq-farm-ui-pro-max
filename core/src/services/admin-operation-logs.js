const { getPool } = require('./mysql-db');

const VALID_SCOPES = new Set(['users', 'account_ownership', 'runtime', 'accounts', 'help_center', 'system_update']);
const VALID_STATUSES = new Set(['success', 'warning', 'error']);

function normalizeText(value, maxLength = 120) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeScope(scope) {
    const raw = normalizeText(scope, 64);
    return VALID_SCOPES.has(raw) ? raw : '';
}

function normalizeStatus(status) {
    const raw = normalizeText(status, 24);
    return VALID_STATUSES.has(raw) ? raw : 'success';
}

function normalizeStatusFilter(status) {
    const raw = normalizeText(status, 24);
    return VALID_STATUSES.has(raw) ? raw : '';
}

function normalizeCount(value, fallback = 0) {
    const num = Number.parseInt(String(value ?? fallback), 10);
    if (!Number.isFinite(num) || num < 0) {
        return fallback;
    }
    return num;
}

function normalizeArray(value, maxLength = 6) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map(item => normalizeText(item, 160))
        .filter(Boolean)
        .slice(0, maxLength);
}

function normalizeDateFilter(value) {
    const text = normalizeText(value, 64);
    if (!text) {
        return null;
    }
    const timestamp = Date.parse(text);
    if (!Number.isFinite(timestamp)) {
        return null;
    }
    return new Date(timestamp);
}

function parseJsonArray(value) {
    if (!value) {
        return [];
    }
    try {
        if (typeof value === 'string') {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.map(item => normalizeText(item, 160)).filter(Boolean) : [];
        }
        if (Array.isArray(value)) {
            return value.map(item => normalizeText(item, 160)).filter(Boolean);
        }
    } catch {
        return [];
    }
    return [];
}

function mapRow(row) {
    const createdAtValue = row.created_at instanceof Date
        ? row.created_at.getTime()
        : Date.parse(String(row.created_at || ''));
    return {
        id: normalizeText(row.client_id || row.id, 120) || String(row.id || ''),
        actorUsername: normalizeText(row.actor_username, 100),
        scope: normalizeScope(row.scope),
        actionLabel: normalizeText(row.action_label, 120),
        status: normalizeStatus(row.status),
        totalCount: normalizeCount(row.total_count, 1),
        successCount: normalizeCount(row.success_count, 0),
        failedCount: normalizeCount(row.failed_count, 0),
        affectedNames: parseJsonArray(row.affected_names),
        failedNames: parseJsonArray(row.failed_names),
        detailLines: parseJsonArray(row.detail_lines),
        timestamp: Number.isFinite(createdAtValue) ? createdAtValue : Date.now(),
    };
}

async function createAdminOperationLog(entry = {}) {
    const pool = getPool();
    if (!pool) {
        return null;
    }

    const actorUsername = normalizeText(entry.actorUsername, 100);
    const scope = normalizeScope(entry.scope);
    const actionLabel = normalizeText(entry.actionLabel, 120);
    if (!actorUsername || !scope || !actionLabel) {
        return null;
    }

    const payload = {
        clientId: normalizeText(entry.id, 120) || null,
        actorUsername,
        scope,
        actionLabel,
        status: normalizeStatus(entry.status),
        totalCount: Math.max(normalizeCount(entry.totalCount, 1), 1),
        successCount: normalizeCount(entry.successCount, 0),
        failedCount: normalizeCount(entry.failedCount, 0),
        affectedNames: normalizeArray(entry.affectedNames),
        failedNames: normalizeArray(entry.failedNames),
        detailLines: normalizeArray(entry.detailLines),
    };

    await pool.execute(
        `INSERT INTO admin_operation_logs
            (client_id, actor_username, scope, action_label, status, total_count, success_count, failed_count, affected_names, failed_names, detail_lines)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            action_label = VALUES(action_label),
            status = VALUES(status),
            total_count = VALUES(total_count),
            success_count = VALUES(success_count),
            failed_count = VALUES(failed_count),
            affected_names = VALUES(affected_names),
            failed_names = VALUES(failed_names),
            detail_lines = VALUES(detail_lines)`,
        [
            payload.clientId,
            payload.actorUsername,
            payload.scope,
            payload.actionLabel,
            payload.status,
            payload.totalCount,
            payload.successCount,
            payload.failedCount,
            JSON.stringify(payload.affectedNames),
            JSON.stringify(payload.failedNames),
            JSON.stringify(payload.detailLines),
        ],
    );

    return payload;
}

async function listAdminOperationLogs(options = {}) {
    const pool = getPool();
    if (!pool) {
        return [];
    }

    const actorUsername = normalizeText(options.actorUsername, 100);
    const scope = normalizeScope(options.scope);
    const status = normalizeStatusFilter(options.status);
    const keyword = normalizeText(options.keyword, 120);
    const dateFrom = normalizeDateFilter(options.dateFrom);
    const dateTo = normalizeDateFilter(options.dateTo);
    const limit = Math.min(Math.max(normalizeCount(options.limit, 24), 1), 100);
    const where = [];
    const params = [];

    if (actorUsername) {
        where.push('actor_username = ?');
        params.push(actorUsername);
    }
    if (scope) {
        where.push('scope = ?');
        params.push(scope);
    }
    if (status) {
        where.push('status = ?');
        params.push(status);
    }
    if (dateFrom) {
        where.push('created_at >= ?');
        params.push(dateFrom);
    }
    if (dateTo) {
        where.push('created_at <= ?');
        params.push(dateTo);
    }
    if (keyword) {
        const likeKeyword = `%${keyword}%`;
        where.push(`(
            actor_username LIKE ?
            OR action_label LIKE ?
            OR affected_names LIKE ?
            OR failed_names LIKE ?
            OR detail_lines LIKE ?
        )`);
        params.push(likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword);
    }

    const [rows] = await pool.query(
        `SELECT id, client_id, actor_username, scope, action_label, status, total_count, success_count, failed_count, affected_names, failed_names, detail_lines, created_at
         FROM admin_operation_logs
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY created_at DESC, id DESC
         LIMIT ${limit}`,
        params,
    );

    return rows.map(mapRow);
}

async function clearAdminOperationLogs(options = {}) {
    const pool = getPool();
    if (!pool) {
        return 0;
    }

    const actorUsername = normalizeText(options.actorUsername, 100);
    const scope = normalizeScope(options.scope);
    const where = [];
    const params = [];

    if (actorUsername) {
        where.push('actor_username = ?');
        params.push(actorUsername);
    }
    if (scope) {
        where.push('scope = ?');
        params.push(scope);
    }

    if (!where.length) {
        return 0;
    }

    const [result] = await pool.execute(
        `DELETE FROM admin_operation_logs WHERE ${where.join(' AND ')}`,
        params,
    );
    return Number(result.affectedRows || 0);
}

module.exports = {
    createAdminOperationLog,
    listAdminOperationLogs,
    clearAdminOperationLogs,
};
