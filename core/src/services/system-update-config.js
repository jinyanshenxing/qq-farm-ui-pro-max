const {
    getSystemSetting,
    setSystemSetting,
} = require('./system-settings');
const {
    formatVersionTag,
    normalizeUrl,
    parseJsonSafely,
    toTimestamp,
} = require('./system-update-utils');

const SYSTEM_UPDATE_SETTING_KEYS = Object.freeze({
    CONFIG: 'update_config',
    RELEASE_CACHE: 'update_release_cache',
    RUNTIME: 'update_runtime',
});

const UPDATE_PROVIDER_OPTIONS = new Set(['github_release', 'manifest_url', 'release_api_url']);
const UPDATE_STRATEGY_OPTIONS = new Set(['in_place', 'rolling', 'parallel_new_dir', 'drain_and_cutover']);
const UPDATE_SCOPE_OPTIONS = new Set(['app', 'worker', 'cluster']);

function normalizeClusterNodeRecord(input = {}) {
    const nodeId = String(input.nodeId || input.agentId || '').trim();
    if (!nodeId) {
        return null;
    }

    const assignedAccountIds = Array.isArray(input.assignedAccountIds)
        ? Array.from(new Set(input.assignedAccountIds.map(item => String(item || '').trim()).filter(Boolean)))
        : [];
    const assignedCount = Math.max(
        0,
        Number.parseInt(input.assignedCount, 10) || assignedAccountIds.length,
    );
    const connected = input.connected !== undefined ? !!input.connected : !['offline', 'disconnected'].includes(String(input.status || '').trim());
    const draining = !!input.draining;
    let status = String(input.status || '').trim().toLowerCase();
    if (!status) {
        if (!connected) {
            status = 'offline';
        } else if (draining) {
            status = 'draining';
        } else if (assignedCount > 0) {
            status = 'active';
        } else {
            status = 'idle';
        }
    }

    return {
        nodeId,
        role: String(input.role || 'worker').trim() || 'worker',
        status,
        version: formatVersionTag(input.version || '', ''),
        connected,
        draining,
        assignedCount,
        assignedAccountIds,
        updatedAt: toTimestamp(input.updatedAt || input.updated_at || 0),
    };
}

function resolveDefaultGitHubIdentity() {
    const fromCombined = String(process.env.SYSTEM_UPDATE_GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY || '').trim();
    if (fromCombined.includes('/')) {
        const [owner, repo] = fromCombined.split('/');
        return {
            githubOwner: String(owner || '').trim(),
            githubRepo: String(repo || '').trim(),
        };
    }
    return {
        githubOwner: String(process.env.SYSTEM_UPDATE_GITHUB_OWNER || '').trim(),
        githubRepo: String(process.env.SYSTEM_UPDATE_GITHUB_REPO || '').trim(),
    };
}

function normalizeStringList(value) {
    if (Array.isArray(value)) {
        return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)));
    }
    return Array.from(new Set(
        String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean),
    ));
}

function normalizeSystemUpdateConfig(input = {}) {
    const fallbackIdentity = resolveDefaultGitHubIdentity();
    const provider = UPDATE_PROVIDER_OPTIONS.has(String(input.provider || '').trim())
        ? String(input.provider || '').trim()
        : (process.env.SYSTEM_UPDATE_MANIFEST_URL ? 'manifest_url' : 'github_release');
    const preferredStrategy = UPDATE_STRATEGY_OPTIONS.has(String(input.preferredStrategy || '').trim())
        ? String(input.preferredStrategy || '').trim()
        : 'rolling';
    const preferredScope = UPDATE_SCOPE_OPTIONS.has(String(input.preferredScope || '').trim())
        ? String(input.preferredScope || '').trim()
        : 'app';

    return {
        provider,
        manifestUrl: normalizeUrl(input.manifestUrl || process.env.SYSTEM_UPDATE_MANIFEST_URL || ''),
        releaseApiUrl: normalizeUrl(input.releaseApiUrl || process.env.SYSTEM_UPDATE_RELEASE_API_URL || ''),
        githubOwner: String(input.githubOwner || fallbackIdentity.githubOwner || '').trim(),
        githubRepo: String(input.githubRepo || fallbackIdentity.githubRepo || '').trim(),
        channel: String(input.channel || 'stable').trim() || 'stable',
        allowPreRelease: !!input.allowPreRelease,
        preferredStrategy,
        preferredScope,
        requireDrain: input.requireDrain !== undefined ? !!input.requireDrain : preferredScope !== 'app',
        agentMode: String(input.agentMode || 'db_polling').trim() || 'db_polling',
        agentPollIntervalSec: Math.max(5, Number.parseInt(input.agentPollIntervalSec, 10) || 15),
        defaultDrainNodeIds: normalizeStringList(input.defaultDrainNodeIds),
        maintenanceWindow: String(input.maintenanceWindow || '').trim(),
        autoSyncAnnouncements: !!input.autoSyncAnnouncements,
        autoRunVerification: input.autoRunVerification !== undefined ? !!input.autoRunVerification : true,
        promptRollbackOnFailure: input.promptRollbackOnFailure !== undefined ? !!input.promptRollbackOnFailure : true,
        defaultLogTailLines: Math.max(20, Number.parseInt(input.defaultLogTailLines, 10) || 80),
    };
}

function normalizeReleaseAsset(input = {}) {
    input = input && typeof input === 'object' ? input : {};
    const name = String(input.name || input.label || '').trim();
    const url = normalizeUrl(input.url || input.downloadUrl || input.browser_download_url || '');
    if (!name && !url) {
        return null;
    }
    return {
        name,
        url,
        size: Math.max(0, Number.parseInt(input.size, 10) || 0),
    };
}

function normalizeReleaseRecord(input = {}) {
    input = input && typeof input === 'object' ? input : {};
    const versionTag = formatVersionTag(
        input.versionTag
        || input.version
        || input.tag
        || input.tagName
        || input.tag_name
        || '',
        '',
    );
    if (!versionTag) {
        return null;
    }
    const assets = Array.isArray(input.assets)
        ? input.assets.map(normalizeReleaseAsset).filter(Boolean)
        : [];
    return {
        version: versionTag.replace(/^v/i, ''),
        versionTag,
        title: String(input.title || input.name || versionTag).trim() || versionTag,
        publishedAt: toTimestamp(input.publishedAt || input.published_at || input.releaseDate || input.releasedAt || ''),
        prerelease: !!input.prerelease,
        notes: String(input.notes || input.body || input.description || '').trim(),
        url: normalizeUrl(input.url || input.html_url || input.releaseUrl || ''),
        source: String(input.source || '').trim(),
        assets,
    };
}

function normalizeSystemUpdateReleaseCache(input = {}) {
    const latestRelease = normalizeReleaseRecord(
        input.latestRelease
        || input.latest
        || null,
    );
    const releases = Array.isArray(input.releases)
        ? input.releases.map(normalizeReleaseRecord).filter(Boolean)
        : (latestRelease ? [latestRelease] : []);
    return {
        checkedAt: toTimestamp(input.checkedAt || input.checked_at || 0),
        source: String(input.source || '').trim(),
        etag: String(input.etag || '').trim(),
        lastError: String(input.lastError || '').trim(),
        latestRelease: latestRelease || releases[0] || null,
        releases,
    };
}

function normalizeSystemUpdateRuntime(input = {}) {
    const agentSummary = Array.isArray(input.agentSummary)
        ? input.agentSummary.map((item) => {
            const record = parseJsonSafely(item, item);
            if (!record || typeof record !== 'object') return null;
            const nodeId = String(record.nodeId || record.agentId || '').trim();
            if (!nodeId) return null;
            return {
                nodeId,
                role: String(record.role || '').trim(),
                status: String(record.status || '').trim(),
                version: formatVersionTag(record.version || '', ''),
                managedNodeIds: normalizeStringList(parseJsonSafely(record.managedNodeIds, record.managedNodeIds)),
                jobId: Math.max(0, Number.parseInt(record.jobId, 10) || 0),
                jobStatus: String(record.jobStatus || '').trim(),
                targetVersion: formatVersionTag(record.targetVersion || '', ''),
                updatedAt: toTimestamp(record.updatedAt || record.updated_at || 0),
            };
        }).filter(Boolean)
        : [];
    const clusterNodes = Array.isArray(input.clusterNodes)
        ? input.clusterNodes.map(normalizeClusterNodeRecord).filter(Boolean)
        : [];

    return {
        lastCheckAt: toTimestamp(input.lastCheckAt || input.last_check_at || 0),
        lastCheckOk: !!input.lastCheckOk,
        lastError: String(input.lastError || '').trim(),
        activeJobId: Math.max(0, Number.parseInt(input.activeJobId, 10) || 0),
        activeJobStatus: String(input.activeJobStatus || '').trim(),
        activeJobKey: String(input.activeJobKey || '').trim(),
        activeTargetVersion: formatVersionTag(input.activeTargetVersion || '', ''),
        agentSummary,
        clusterNodes,
    };
}

async function getSystemUpdateConfig() {
    const raw = await getSystemSetting(SYSTEM_UPDATE_SETTING_KEYS.CONFIG, {});
    return normalizeSystemUpdateConfig(raw);
}

async function saveSystemUpdateConfig(input = {}) {
    const normalized = normalizeSystemUpdateConfig(input);
    await setSystemSetting(SYSTEM_UPDATE_SETTING_KEYS.CONFIG, normalized);
    return normalized;
}

async function getSystemUpdateReleaseCache() {
    const raw = await getSystemSetting(SYSTEM_UPDATE_SETTING_KEYS.RELEASE_CACHE, {});
    return normalizeSystemUpdateReleaseCache(raw);
}

async function saveSystemUpdateReleaseCache(input = {}) {
    const normalized = normalizeSystemUpdateReleaseCache(input);
    await setSystemSetting(SYSTEM_UPDATE_SETTING_KEYS.RELEASE_CACHE, normalized);
    return normalized;
}

async function getSystemUpdateRuntime() {
    const raw = await getSystemSetting(SYSTEM_UPDATE_SETTING_KEYS.RUNTIME, {});
    return normalizeSystemUpdateRuntime(raw);
}

async function saveSystemUpdateRuntime(input = {}) {
    const normalized = normalizeSystemUpdateRuntime(input);
    await setSystemSetting(SYSTEM_UPDATE_SETTING_KEYS.RUNTIME, normalized);
    return normalized;
}

module.exports = {
    SYSTEM_UPDATE_SETTING_KEYS,
    UPDATE_PROVIDER_OPTIONS,
    UPDATE_STRATEGY_OPTIONS,
    UPDATE_SCOPE_OPTIONS,
    normalizeClusterNodeRecord,
    normalizeSystemUpdateConfig,
    normalizeSystemUpdateReleaseCache,
    normalizeSystemUpdateRuntime,
    normalizeReleaseRecord,
    getSystemUpdateConfig,
    saveSystemUpdateConfig,
    getSystemUpdateReleaseCache,
    saveSystemUpdateReleaseCache,
    getSystemUpdateRuntime,
    saveSystemUpdateRuntime,
};
