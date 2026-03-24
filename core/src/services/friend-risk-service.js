const { getPool, initMysql, isMysqlInitialized } = require('./mysql-db');
const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('friend-risk');
const recentOrganicFertilizerWindows = new Map();
let poolReadyPromise = null;

async function ensurePoolReady() {
    if (isMysqlInitialized()) {
        return getPool();
    }

    if (!poolReadyPromise) {
        poolReadyPromise = Promise.resolve()
            .then(() => initMysql())
            .finally(() => {
                poolReadyPromise = null;
            });
    }

    await poolReadyPromise;
    return getPool();
}

function normalizePositiveInt(value, fallback = 0) {
    const parsed = Number.parseInt(String(value ?? fallback), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeText(value, maxLength = 255) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeJsonArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map(item => normalizeText(item, 64))
        .filter(Boolean)
        .slice(0, 12);
}

function parseJsonArray(value) {
    if (!value) {
        return [];
    }
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return normalizeJsonArray(parsed);
    } catch {
        return [];
    }
}

function buildWindowKey(accountId, landId) {
    return `${String(accountId || '').trim()}:${String(landId || '').trim()}`;
}

function cleanupOrganicFertilizerWindows(now = Date.now()) {
    const maxAgeMs = 24 * 60 * 60 * 1000;
    for (const [key, timestamp] of recentOrganicFertilizerWindows.entries()) {
        if ((now - Number(timestamp || 0)) > maxAgeMs) {
            recentOrganicFertilizerWindows.delete(key);
        }
    }
}

function rememberOrganicFertilizerWindow(accountId, landIds, options = {}) {
    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId) {
        return;
    }
    const timestamp = Math.max(0, Number(options.timestamp) || Date.now());
    cleanupOrganicFertilizerWindows(timestamp);
    const list = Array.isArray(landIds) ? landIds : [landIds];
    for (const landId of list) {
        const resolvedLandId = normalizePositiveInt(landId, 0);
        if (!resolvedLandId) continue;
        recentOrganicFertilizerWindows.set(buildWindowKey(normalizedAccountId, resolvedLandId), timestamp);
    }
}

function getDefaultFriendRiskConfig() {
    return {
        enabled: true,
        passiveDetectEnabled: true,
        passiveWindowSec: 180,
        passiveDailyThreshold: 3,
        markScoreThreshold: 50,
        autoDeprioritize: false,
        eventRetentionDays: 30,
    };
}

function getEffectiveFriendRiskConfig(accountId) {
    const fallback = getDefaultFriendRiskConfig();
    try {
        const store = require('../models/store');
        if (store && typeof store.getFriendRiskConfig === 'function') {
            const resolved = store.getFriendRiskConfig(accountId);
            return {
                ...fallback,
                ...(resolved && typeof resolved === 'object' ? resolved : {}),
            };
        }
    } catch (error) {
        logger.warn(`读取好友风险配置失败: ${error.message}`);
    }
    return fallback;
}

function resolveRiskLevel(score, config = getDefaultFriendRiskConfig()) {
    const normalizedScore = Math.max(0, Number(score) || 0);
    const highThreshold = Math.max(20, Number(config.markScoreThreshold) || 50);
    const mediumThreshold = Math.max(10, Math.floor(highThreshold * 0.6));
    if (normalizedScore >= highThreshold) return 'high';
    if (normalizedScore >= mediumThreshold) return 'medium';
    return 'low';
}

function mapProfileRow(row) {
    const updatedAt = row.updated_at instanceof Date ? row.updated_at.getTime() : Date.parse(String(row.updated_at || ''));
    const lastHitAt = row.last_hit_at instanceof Date ? row.last_hit_at.getTime() : Date.parse(String(row.last_hit_at || ''));
    const lastObservedAt = row.last_observed_at instanceof Date ? row.last_observed_at.getTime() : Date.parse(String(row.last_observed_at || ''));
    return {
        id: Number(row.id || 0),
        accountId: String(row.account_id || '').trim(),
        friendGid: Number(row.friend_gid || 0),
        friendUin: normalizeText(row.friend_uin, 64),
        friendOpenId: normalizeText(row.friend_open_id, 128),
        friendName: normalizeText(row.friend_name, 255) || `GID:${row.friend_gid}`,
        riskScore: Math.max(0, Number(row.risk_score || 0)),
        riskLevel: normalizeText(row.risk_level, 16) || 'low',
        strategyState: normalizeText(row.strategy_state, 32) || 'observe',
        tags: parseJsonArray(row.tags),
        lastHitReason: normalizeText(row.last_hit_reason, 100),
        lastHitAt: Number.isFinite(lastHitAt) ? lastHitAt : 0,
        lastObservedAt: Number.isFinite(lastObservedAt) ? lastObservedAt : 0,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    };
}

function mapEventRow(row) {
    const observedAt = row.observed_at instanceof Date ? row.observed_at.getTime() : Date.parse(String(row.observed_at || ''));
    const createdAt = row.created_at instanceof Date ? row.created_at.getTime() : Date.parse(String(row.created_at || ''));
    let payload = {};
    try {
        payload = typeof row.event_payload === 'string' ? JSON.parse(row.event_payload) : (row.event_payload || {});
    } catch {
        payload = {};
    }
    return {
        id: Number(row.id || 0),
        accountId: String(row.account_id || '').trim(),
        friendGid: Number(row.friend_gid || 0),
        friendUin: normalizeText(row.friend_uin, 64),
        friendOpenId: normalizeText(row.friend_open_id, 128),
        friendName: normalizeText(row.friend_name, 255) || `GID:${row.friend_gid}`,
        eventType: normalizeText(row.event_type, 64),
        scoreDelta: Number(row.score_delta || 0),
        eventPayload: payload && typeof payload === 'object' ? payload : {},
        observedAt: Number.isFinite(observedAt) ? observedAt : 0,
        createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    };
}

async function recordPassiveStealEvent(options = {}) {
    const pool = await ensurePoolReady();

    const accountId = normalizeText(options.accountId, 64);
    const friendGid = normalizePositiveInt(options.friendGid, 0);
    const landId = normalizePositiveInt(options.landId, 0);
    if (!accountId || !friendGid || !landId) {
        return null;
    }

    const config = getEffectiveFriendRiskConfig(accountId);
    if (!config.enabled || !config.passiveDetectEnabled) {
        return null;
    }

    const observedAtMs = Math.max(0, Number(options.observedAt) || Date.now());
    cleanupOrganicFertilizerWindows(observedAtMs);

    const friendName = normalizeText(options.friendName, 255) || `GID:${friendGid}`;
    const friendUin = normalizeText(options.friendUin, 64);
    const friendOpenId = normalizeText(options.friendOpenId, 128);
    const recentFertilizerAt = recentOrganicFertilizerWindows.get(buildWindowKey(accountId, landId)) || 0;
    const withinOrganicWindow = recentFertilizerAt > 0
        && (observedAtMs - recentFertilizerAt) <= (Math.max(30, Number(config.passiveWindowSec) || 180) * 1000);

    const [dailyRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM friend_risk_events
         WHERE account_id = ?
           AND friend_gid = ?
           AND observed_at >= DATE_SUB(?, INTERVAL 1 DAY)`,
        [accountId, friendGid, new Date(observedAtMs)],
    );
    const dailyCount = Math.max(0, Number(dailyRows?.[0]?.total || 0)) + 1;

    let scoreDelta = 10;
    const tags = ['passive_steal'];
    let lastHitReason = 'passive_steal';
    if (withinOrganicWindow) {
        scoreDelta += 35;
        tags.push('organic_window');
        lastHitReason = 'organic_window_steal';
    }
    if (dailyCount >= Math.max(2, Number(config.passiveDailyThreshold) || 3)) {
        scoreDelta += 15;
        tags.push('repeat_daily');
        if (lastHitReason === 'passive_steal') {
            lastHitReason = 'repeat_daily_steal';
        }
    }

    const eventPayload = {
        landId,
        friendName,
        dailyCount,
        organicWindowTriggered: withinOrganicWindow,
        organicWindowSec: withinOrganicWindow ? Math.max(0, Math.floor((observedAtMs - recentFertilizerAt) / 1000)) : 0,
        source: normalizeText(options.source || 'farm_visitor', 32) || 'farm_visitor',
    };

    await pool.execute(
        `INSERT INTO friend_risk_events
            (account_id, friend_gid, friend_uin, friend_open_id, friend_name, event_type, score_delta, event_payload, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            accountId,
            friendGid,
            friendUin || null,
            friendOpenId || null,
            friendName,
            'passive_steal',
            scoreDelta,
            JSON.stringify(eventPayload),
            new Date(observedAtMs),
        ],
    );

    const [profileRows] = await pool.query(
        `SELECT id, risk_score, tags
         FROM friend_risk_profiles
         WHERE account_id = ? AND friend_gid = ?
         LIMIT 1`,
        [accountId, friendGid],
    );
    const currentProfile = Array.isArray(profileRows) ? profileRows[0] : null;
    const nextScore = Math.max(0, Number(currentProfile?.risk_score || 0)) + scoreDelta;
    const nextTags = Array.from(new Set([
        ...parseJsonArray(currentProfile?.tags),
        ...tags,
    ]));
    const nextRiskLevel = resolveRiskLevel(nextScore, config);
    const strategyState = config.autoDeprioritize && nextRiskLevel !== 'low'
        ? 'deprioritized'
        : 'observe';

    await pool.execute(
        `INSERT INTO friend_risk_profiles
            (account_id, friend_gid, friend_uin, friend_open_id, friend_name, risk_score, risk_level, strategy_state, tags, last_hit_reason, last_hit_at, last_observed_at, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            friend_uin = VALUES(friend_uin),
            friend_open_id = VALUES(friend_open_id),
            friend_name = VALUES(friend_name),
            risk_score = VALUES(risk_score),
            risk_level = VALUES(risk_level),
            strategy_state = VALUES(strategy_state),
            tags = VALUES(tags),
            last_hit_reason = VALUES(last_hit_reason),
            last_hit_at = VALUES(last_hit_at),
            last_observed_at = VALUES(last_observed_at),
            meta = VALUES(meta)`,
        [
            accountId,
            friendGid,
            friendUin || null,
            friendOpenId || null,
            friendName,
            nextScore,
            nextRiskLevel,
            strategyState,
            JSON.stringify(nextTags),
            lastHitReason,
            new Date(observedAtMs),
            new Date(observedAtMs),
            JSON.stringify({
                dailyCount,
                organicWindowTriggered: withinOrganicWindow,
            }),
        ],
    );

    return {
        friendGid,
        friendName,
        scoreDelta,
        riskScore: nextScore,
        riskLevel: nextRiskLevel,
        strategyState,
        dailyCount,
        withinOrganicWindow,
        lastHitReason,
    };
}

async function listFriendRiskProfiles(accountId, options = {}) {
    const pool = await ensurePoolReady();
    const normalizedAccountId = normalizeText(accountId, 64);
    if (!normalizedAccountId) {
        return [];
    }
    const limit = Math.min(Math.max(normalizePositiveInt(options.limit, 50), 1), 200);
    const keyword = normalizeText(options.keyword, 100);
    const level = normalizeText(options.level, 16);
    const where = ['account_id = ?'];
    const params = [normalizedAccountId];
    if (level && (level === 'low' || level === 'medium' || level === 'high')) {
        where.push('risk_level = ?');
        params.push(level);
    }
    if (keyword) {
        const like = `%${keyword}%`;
        where.push('(friend_name LIKE ? OR friend_uin LIKE ? OR friend_open_id LIKE ? OR CAST(friend_gid AS CHAR) LIKE ?)');
        params.push(like, like, like, like);
    }
    const [rows] = await pool.query(
        `SELECT id, account_id, friend_gid, friend_uin, friend_open_id, friend_name, risk_score, risk_level, strategy_state, tags, last_hit_reason, last_hit_at, last_observed_at, updated_at
         FROM friend_risk_profiles
         WHERE ${where.join(' AND ')}
         ORDER BY risk_score DESC, updated_at DESC, id DESC
         LIMIT ${limit}`,
        params,
    );
    return rows.map(mapProfileRow);
}

async function listFriendRiskEvents(accountId, options = {}) {
    const pool = await ensurePoolReady();
    const normalizedAccountId = normalizeText(accountId, 64);
    if (!normalizedAccountId) {
        return [];
    }
    const limit = Math.min(Math.max(normalizePositiveInt(options.limit, 50), 1), 200);
    const friendGid = normalizePositiveInt(options.friendGid, 0);
    const where = ['account_id = ?'];
    const params = [normalizedAccountId];
    if (friendGid > 0) {
        where.push('friend_gid = ?');
        params.push(friendGid);
    }
    const [rows] = await pool.query(
        `SELECT id, account_id, friend_gid, friend_uin, friend_open_id, friend_name, event_type, score_delta, event_payload, observed_at, created_at
         FROM friend_risk_events
         WHERE ${where.join(' AND ')}
         ORDER BY observed_at DESC, id DESC
         LIMIT ${limit}`,
        params,
    );
    return rows.map(mapEventRow);
}

async function resetFriendRiskProfile(accountId, friendGid) {
    const pool = await ensurePoolReady();
    const normalizedAccountId = normalizeText(accountId, 64);
    const normalizedFriendGid = normalizePositiveInt(friendGid, 0);
    if (!normalizedAccountId || !normalizedFriendGid) {
        return false;
    }
    await pool.execute('DELETE FROM friend_risk_profiles WHERE account_id = ? AND friend_gid = ?', [normalizedAccountId, normalizedFriendGid]);
    await pool.execute('DELETE FROM friend_risk_events WHERE account_id = ? AND friend_gid = ?', [normalizedAccountId, normalizedFriendGid]);
    return true;
}

async function getFriendRiskSummary(accountId) {
    const pool = await ensurePoolReady();
    const normalizedAccountId = normalizeText(accountId, 64);
    if (!normalizedAccountId) {
        return { total: 0, low: 0, medium: 0, high: 0, topProfiles: [] };
    }
    const [rows] = await pool.query(
        `SELECT risk_level, COUNT(*) AS total
         FROM friend_risk_profiles
         WHERE account_id = ?
         GROUP BY risk_level`,
        [normalizedAccountId],
    );
    const summary = { total: 0, low: 0, medium: 0, high: 0 };
    for (const row of rows) {
        const level = normalizeText(row.risk_level, 16);
        const total = Math.max(0, Number(row.total || 0));
        if (level === 'high' || level === 'medium' || level === 'low') {
            summary[level] += total;
            summary.total += total;
        }
    }
    const topProfiles = await listFriendRiskProfiles(normalizedAccountId, { limit: 5 });
    return {
        ...summary,
        topProfiles,
    };
}

module.exports = {
    rememberOrganicFertilizerWindow,
    recordPassiveStealEvent,
    listFriendRiskProfiles,
    listFriendRiskEvents,
    resetFriendRiskProfile,
    getFriendRiskSummary,
    getDefaultFriendRiskConfig,
    getEffectiveFriendRiskConfig,
};
