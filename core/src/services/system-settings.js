const fs = require('node:fs');
const { getDataFile } = require('../config/runtime-paths');
const { getPool, transaction } = require('./mysql-db');

const SYSTEM_SETTING_KEYS = Object.freeze({
    GLOBAL_CONFIG: 'global_config',
    JWT_SECRET: 'jwt_secret',
    ADMIN_BOOTSTRAP_STATE: 'admin_bootstrap_state',
    TRIAL_IP_HISTORY: 'trial_ip_history',
    OPENAPI_CONFIG: 'openapi_config',
    EXTERNAL_API_CLIENTS: 'external_api_clients',
    HEALTH_PROBE_CONFIG: 'health_probe_config',
    SERVICE_PROFILE_CONFIG: 'service_profile_config',
    PROXY_POOL_CONFIG: 'proxy_pool_config',
    UPDATE_CONFIG: 'update_config',
    UPDATE_RELEASE_CACHE: 'update_release_cache',
    UPDATE_RUNTIME: 'update_runtime',
    HELP_CENTER_OBSERVABILITY_CONFIG: 'help_center_observability_config',
});

function getLegacyFallbackSources() {
    return {
        [SYSTEM_SETTING_KEYS.GLOBAL_CONFIG]: {
            key: SYSTEM_SETTING_KEYS.GLOBAL_CONFIG,
            filePath: getDataFile('store.json'),
            label: 'legacy store.json',
        },
        [SYSTEM_SETTING_KEYS.JWT_SECRET]: {
            key: SYSTEM_SETTING_KEYS.JWT_SECRET,
            filePath: getDataFile('.jwt-secret'),
            label: 'legacy .jwt-secret',
        },
        [SYSTEM_SETTING_KEYS.TRIAL_IP_HISTORY]: {
            key: SYSTEM_SETTING_KEYS.TRIAL_IP_HISTORY,
            filePath: getDataFile('trial-ip-history.json'),
            label: 'legacy trial-ip-history.json',
        },
    };
}

function parseSettingValue(raw) {
    if (raw === undefined || raw === null) {
        return undefined;
    }
    if (typeof raw === 'object') {
        return raw;
    }

    const text = String(raw).trim();
    if (!text) {
        return undefined;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function getSystemSettings(keys = []) {
    const pool = getPool();
    if (!pool) {
        return {};
    }

    const normalizedKeys = Array.isArray(keys)
        ? keys.map(key => String(key || '').trim()).filter(Boolean)
        : [];

    let sql = 'SELECT setting_key, setting_value FROM system_settings';
    const params = [];
    if (normalizedKeys.length > 0) {
        sql += ` WHERE setting_key IN (${normalizedKeys.map(() => '?').join(',')})`;
        params.push(...normalizedKeys);
    }

    const [rows] = await pool.query(sql, params);
    const result = {};
    for (const row of (rows || [])) {
        const key = String(row.setting_key || '').trim();
        if (!key) continue;
        result[key] = parseSettingValue(row.setting_value);
    }
    return result;
}

async function getSystemSetting(key, fallback = undefined) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
        return fallback;
    }

    const settings = await getSystemSettings([normalizedKey]);
    return settings[normalizedKey] !== undefined ? settings[normalizedKey] : fallback;
}

async function persistSettingsEntries(conn, entries) {
    const pairs = Object.entries(entries || {})
        .map(([key, value]) => [String(key || '').trim(), value])
        .filter(([key, value]) => key && value !== undefined);

    for (const [key, value] of pairs) {
        await conn.query(
            `INSERT INTO system_settings (setting_key, setting_value)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
            [key, JSON.stringify(value)]
        );
    }
}

async function setSystemSettings(entries = {}, options = {}) {
    const conn = options && options.conn;
    if (conn) {
        await persistSettingsEntries(conn, entries);
        return;
    }

    await transaction(async (innerConn) => {
        await persistSettingsEntries(innerConn, entries);
    });
}

async function setSystemSetting(key, value, options = {}) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || value === undefined) {
        return;
    }

    await setSystemSettings({ [normalizedKey]: value }, options);
}

async function inspectSystemSettingsHealth(options = {}) {
    const requiredKeys = Array.isArray(options.requiredKeys) && options.requiredKeys.length > 0
        ? options.requiredKeys.map(key => String(key || '').trim()).filter(Boolean)
        : [
            SYSTEM_SETTING_KEYS.GLOBAL_CONFIG,
            SYSTEM_SETTING_KEYS.JWT_SECRET,
            SYSTEM_SETTING_KEYS.TRIAL_IP_HISTORY,
        ];

    const optionalKeys = Array.isArray(options.optionalKeys)
        ? options.optionalKeys.map(key => String(key || '').trim()).filter(Boolean)
        : [];

    const keys = Array.from(new Set([...requiredKeys, ...optionalKeys]));
    const settings = await getSystemSettings(keys);
    const legacySources = getLegacyFallbackSources();
    const items = keys.map((key) => {
        const source = legacySources[key];
        const exists = settings[key] !== undefined;
        const fallbackFileExists = !!(source && fs.existsSync(source.filePath));
        return {
            key,
            exists,
            required: requiredKeys.includes(key),
            fallbackFilePath: source ? source.filePath : '',
            fallbackFileExists,
            fallbackWouldActivate: !exists && fallbackFileExists,
        };
    });

    const missingRequiredKeys = items
        .filter(item => item.required && !item.exists)
        .map(item => item.key);
    const fallbackWouldActivateKeys = items
        .filter(item => item.fallbackWouldActivate)
        .map(item => item.key);

    return {
        ok: missingRequiredKeys.length === 0,
        checkedAt: Date.now(),
        items,
        missingRequiredKeys,
        fallbackWouldActivateKeys,
    };
}

module.exports = {
    SYSTEM_SETTING_KEYS,
    getSystemSettings,
    getSystemSetting,
    setSystemSettings,
    setSystemSetting,
    inspectSystemSettingsHealth,
    parseSettingValue,
};
