const path = require('node:path');
const { buildReloginRiskReadiness } = require('./account-migration');
const { formatVersionTag } = require('./system-update-utils');

const DEFAULT_PREFLIGHT_OPTIONS = Object.freeze({
    minDiskFreeBytes: 2 * 1024 * 1024 * 1024,
    minBackupFreeBytes: 3 * 1024 * 1024 * 1024,
    agentOfflineThresholdSec: 120,
});

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

function normalizePreflightOverride(input = {}) {
    const raw = input && typeof input === 'object' ? input : {};
    return {
        ignoreChecks: normalizeStringList(raw.ignoreChecks),
        allowReloginRisk: raw.allowReloginRisk === true,
        minDiskFreeBytes: Math.max(0, Number.parseInt(raw.minDiskFreeBytes, 10) || 0),
        minBackupFreeBytes: Math.max(0, Number.parseInt(raw.minBackupFreeBytes, 10) || 0),
        agentOfflineThresholdSec: Math.max(10, Number.parseInt(raw.agentOfflineThresholdSec, 10) || 0),
        deployPath: String(raw.deployPath || '').trim(),
    };
}

function buildCheck({
    key,
    label,
    status,
    message,
    details = null,
    blocker = false,
    warning = false,
}) {
    return {
        key,
        label,
        status,
        blocker: !!blocker,
        warning: !!warning,
        message: String(message || '').trim(),
        details: details && typeof details === 'object' ? details : null,
    };
}

function bytesToLabel(value) {
    const size = Math.max(0, Number(value) || 0);
    if (size >= 1024 * 1024 * 1024) {
        return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (size >= 1024 * 1024) {
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (size >= 1024) {
        return `${Math.round(size / 1024)} KB`;
    }
    return `${size} B`;
}

async function readDiskSnapshot(fsRef, targetPath) {
    const statfs = fsRef && typeof fsRef.statfs === 'function'
        ? await fsRef.statfs(targetPath)
        : (typeof require('node:fs').promises.statfs === 'function'
            ? await require('node:fs').promises.statfs(targetPath)
            : null);
    if (!statfs) {
        return null;
    }
    const blockSize = Number(statfs.bsize || 0);
    const freeBlocks = Number(statfs.bavail || statfs.bfree || 0);
    const totalBlocks = Number(statfs.blocks || 0);
    const freeBytes = Math.max(0, blockSize * freeBlocks);
    const totalBytes = Math.max(0, blockSize * totalBlocks);
    return {
        targetPath,
        freeBytes,
        totalBytes,
        usedBytes: Math.max(0, totalBytes - freeBytes),
    };
}

function summarizeAgentStatus(runtime = {}, targetAgentIds = [], offlineThresholdSec = DEFAULT_PREFLIGHT_OPTIONS.agentOfflineThresholdSec) {
    const agentSummary = Array.isArray(runtime.agentSummary) ? runtime.agentSummary : [];
    const byId = new Map(
        agentSummary
            .map((item) => ({
                nodeId: String(item && item.nodeId || '').trim(),
                status: String(item && item.status || '').trim(),
                updatedAt: Math.max(0, Number(item && item.updatedAt || 0)),
                managedNodeIds: normalizeStringList(item && item.managedNodeIds),
            }))
            .filter(item => item.nodeId)
            .map(item => [item.nodeId, item]),
    );

    const now = Date.now();
    const resolvedTargetAgentIds = targetAgentIds.length > 0
        ? targetAgentIds
        : Array.from(byId.keys());
    const offlineAgents = [];

    resolvedTargetAgentIds.forEach((agentId) => {
        const record = byId.get(agentId);
        if (!record) {
            offlineAgents.push({
                nodeId: agentId,
                reason: 'missing',
                updatedAt: 0,
            });
            return;
        }
        const ageMs = now - record.updatedAt;
        if (record.status === 'error' || ageMs > offlineThresholdSec * 1000) {
            offlineAgents.push({
                nodeId: agentId,
                reason: record.status === 'error' ? 'error' : 'stale',
                updatedAt: record.updatedAt,
                managedNodeIds: record.managedNodeIds,
            });
        }
    });

    return {
        resolvedTargetAgentIds,
        offlineAgents,
        onlineAgentCount: Math.max(0, resolvedTargetAgentIds.length - offlineAgents.length),
    };
}

function createSystemUpdatePreflightService({
    fsRef,
    pathRef = path,
    healthProbeService = null,
}) {
    async function runPreflight(options = {}) {
        const checkedAt = Date.now();
        const config = options.config && typeof options.config === 'object' ? options.config : {};
        const runtime = options.runtime && typeof options.runtime === 'object' ? options.runtime : {};
        const releaseCache = options.releaseCache && typeof options.releaseCache === 'object' ? options.releaseCache : {};
        const latestRelease = releaseCache.latestRelease && typeof releaseCache.latestRelease === 'object'
            ? releaseCache.latestRelease
            : null;
        const accountsSnapshot = options.accountsSnapshot && typeof options.accountsSnapshot === 'object'
            ? options.accountsSnapshot
            : { accounts: [] };
        const accounts = Array.isArray(accountsSnapshot.accounts) ? accountsSnapshot.accounts : [];
        const targetVersion = formatVersionTag(
            options.targetVersion
            || (latestRelease && latestRelease.versionTag)
            || '',
            '',
        );
        const scope = String(options.scope || config.preferredScope || 'app').trim() || 'app';
        const strategy = String(options.strategy || config.preferredStrategy || 'rolling').trim() || 'rolling';
        const targetAgentIds = normalizeStringList(options.targetAgentIds);
        const preflightOverride = normalizePreflightOverride(options.preflightOverride);
        const ignoreChecks = new Set(preflightOverride.ignoreChecks);
        const diskTargetPath = preflightOverride.deployPath || process.cwd();
        const effectiveMinDiskFreeBytes = preflightOverride.minDiskFreeBytes || DEFAULT_PREFLIGHT_OPTIONS.minDiskFreeBytes;
        const effectiveMinBackupFreeBytes = preflightOverride.minBackupFreeBytes || DEFAULT_PREFLIGHT_OPTIONS.minBackupFreeBytes;
        const effectiveOfflineThresholdSec = preflightOverride.agentOfflineThresholdSec || DEFAULT_PREFLIGHT_OPTIONS.agentOfflineThresholdSec;
        const checks = [];

        const dependenciesSnapshot = healthProbeService && typeof healthProbeService.getDependenciesSnapshot === 'function'
            ? await healthProbeService.getDependenciesSnapshot().catch(() => null)
            : null;

        if (targetVersion) {
            checks.push(buildCheck({
                key: 'target_release',
                label: '目标版本可解析',
                status: 'passed',
                message: `准备更新到 ${targetVersion}`,
                details: {
                    targetVersion,
                    latestVersion: latestRelease && latestRelease.versionTag ? latestRelease.versionTag : '',
                    releaseSource: String(releaseCache.source || '').trim(),
                },
            }));
        } else {
            checks.push(buildCheck({
                key: 'target_release',
                label: '目标版本可解析',
                status: ignoreChecks.has('target_release') ? 'warning' : 'blocked',
                blocker: !ignoreChecks.has('target_release'),
                warning: ignoreChecks.has('target_release'),
                message: '缺少目标版本，且当前缓存里没有可用的最新版本信息。',
            }));
        }

        const diskSnapshot = await readDiskSnapshot(fsRef, pathRef.resolve(diskTargetPath)).catch(() => null);
        if (diskSnapshot) {
            const diskBlocked = diskSnapshot.freeBytes < effectiveMinDiskFreeBytes && !ignoreChecks.has('disk_space');
            checks.push(buildCheck({
                key: 'disk_space',
                label: '部署空间',
                status: diskBlocked ? 'blocked' : (diskSnapshot.freeBytes < effectiveMinDiskFreeBytes ? 'warning' : 'passed'),
                blocker: diskBlocked,
                warning: !diskBlocked && diskSnapshot.freeBytes < effectiveMinDiskFreeBytes,
                message: diskBlocked
                    ? `部署目录剩余空间不足，当前 ${bytesToLabel(diskSnapshot.freeBytes)}，要求至少 ${bytesToLabel(effectiveMinDiskFreeBytes)}。`
                    : `部署目录剩余空间 ${bytesToLabel(diskSnapshot.freeBytes)}。`,
                details: {
                    targetPath: diskSnapshot.targetPath,
                    freeBytes: diskSnapshot.freeBytes,
                    totalBytes: diskSnapshot.totalBytes,
                    requiredBytes: effectiveMinDiskFreeBytes,
                },
            }));
            const backupBlocked = diskSnapshot.freeBytes < effectiveMinBackupFreeBytes && !ignoreChecks.has('backup_space');
            checks.push(buildCheck({
                key: 'backup_space',
                label: '回退预留空间',
                status: backupBlocked ? 'blocked' : (diskSnapshot.freeBytes < effectiveMinBackupFreeBytes ? 'warning' : 'passed'),
                blocker: backupBlocked,
                warning: !backupBlocked && diskSnapshot.freeBytes < effectiveMinBackupFreeBytes,
                message: backupBlocked
                    ? `当前剩余空间不足以保留回退副本，当前 ${bytesToLabel(diskSnapshot.freeBytes)}，建议至少 ${bytesToLabel(effectiveMinBackupFreeBytes)}。`
                    : `回退预留空间检查通过，当前 ${bytesToLabel(diskSnapshot.freeBytes)}。`,
                details: {
                    targetPath: diskSnapshot.targetPath,
                    freeBytes: diskSnapshot.freeBytes,
                    requiredBytes: effectiveMinBackupFreeBytes,
                },
            }));
        } else {
            checks.push(buildCheck({
                key: 'disk_space',
                label: '部署空间',
                status: ignoreChecks.has('disk_space') ? 'warning' : 'blocked',
                blocker: !ignoreChecks.has('disk_space'),
                warning: ignoreChecks.has('disk_space'),
                message: '当前环境无法读取磁盘空间信息。',
            }));
        }

        const mysqlStatus = dependenciesSnapshot && dependenciesSnapshot.dependencies && dependenciesSnapshot.dependencies.mysql;
        const mysqlBlocked = !(mysqlStatus && mysqlStatus.ok) && !ignoreChecks.has('mysql_health');
        checks.push(buildCheck({
            key: 'mysql_health',
            label: 'MySQL 健康',
            status: mysqlBlocked ? 'blocked' : ((mysqlStatus && mysqlStatus.ok) ? 'passed' : 'warning'),
            blocker: mysqlBlocked,
            warning: !mysqlBlocked && !(mysqlStatus && mysqlStatus.ok),
            message: mysqlStatus && mysqlStatus.ok
                ? 'MySQL 连接正常。'
                : `MySQL 健康检查异常${mysqlStatus && mysqlStatus.error ? `: ${mysqlStatus.error}` : ''}`,
            details: mysqlStatus || null,
        }));

        const redisStatus = dependenciesSnapshot && dependenciesSnapshot.dependencies && dependenciesSnapshot.dependencies.redis;
        const redisBlocked = redisStatus && redisStatus.status === 'down' && !ignoreChecks.has('redis_health');
        checks.push(buildCheck({
            key: 'redis_health',
            label: 'Redis 健康',
            status: redisBlocked ? 'blocked' : ((redisStatus && redisStatus.ok) ? 'passed' : 'warning'),
            blocker: redisBlocked,
            warning: !redisBlocked && !(redisStatus && redisStatus.ok),
            message: redisStatus && redisStatus.ok
                ? 'Redis 连接正常。'
                : `Redis 当前状态为 ${redisStatus ? redisStatus.status : 'unknown'}${redisStatus && redisStatus.error ? `: ${redisStatus.error}` : ''}`,
            details: redisStatus || null,
        }));

        const reloginRisk = buildReloginRiskReadiness({ accounts });
        const reloginBlocked = reloginRisk.hasReloginRisk
            && !preflightOverride.allowReloginRisk
            && !ignoreChecks.has('relogin_risk');
        checks.push(buildCheck({
            key: 'relogin_risk',
            label: '运行中账号重登录风险',
            status: reloginBlocked ? 'blocked' : (reloginRisk.hasReloginRisk ? 'warning' : 'passed'),
            blocker: reloginBlocked,
            warning: !reloginBlocked && reloginRisk.hasReloginRisk,
            message: reloginRisk.hasReloginRisk
                ? `检测到 ${reloginRisk.blockerCount} 个运行中账号仍依赖一次性登录凭据，更新后可能需要重新登录。`
                : '未发现运行中一次性登录凭据账号。',
            details: reloginRisk,
        }));

        const agentStatus = summarizeAgentStatus(runtime, targetAgentIds, effectiveOfflineThresholdSec);
        const agentCheckBlocked = (scope !== 'app' || agentStatus.resolvedTargetAgentIds.length > 0)
            ? (agentStatus.offlineAgents.length > 0 && !ignoreChecks.has('agent_online'))
            : false;
        const noAgentBlocked = scope !== 'app'
            && agentStatus.resolvedTargetAgentIds.length === 0
            && !ignoreChecks.has('agent_online');
        checks.push(buildCheck({
            key: 'agent_online',
            label: '宿主机更新代理在线',
            status: noAgentBlocked || agentCheckBlocked
                ? 'blocked'
                : ((agentStatus.resolvedTargetAgentIds.length > 0 && agentStatus.offlineAgents.length === 0) ? 'passed' : 'warning'),
            blocker: noAgentBlocked || agentCheckBlocked,
            warning: !(noAgentBlocked || agentCheckBlocked) && (
                agentStatus.resolvedTargetAgentIds.length === 0
                || agentStatus.offlineAgents.length > 0
            ),
            message: noAgentBlocked
                ? '当前没有可用的宿主机更新代理。'
                : (agentStatus.offlineAgents.length > 0
                    ? `检测到 ${agentStatus.offlineAgents.length} 个目标代理离线或心跳过期。`
                    : `已解析 ${agentStatus.resolvedTargetAgentIds.length} 个目标代理。`),
            details: agentStatus,
        }));

        const blockers = checks.filter(item => item.blocker);
        const warnings = checks.filter(item => item.warning);

        return {
            checkedAt,
            ok: blockers.length === 0,
            scope,
            strategy,
            targetVersion,
            blockerCount: blockers.length,
            warningCount: warnings.length,
            checks,
            blockers,
            warnings,
            release: {
                targetVersion,
                latestVersion: latestRelease && latestRelease.versionTag ? latestRelease.versionTag : '',
                source: String(releaseCache.source || '').trim(),
            },
            disk: diskSnapshot,
            dependencies: dependenciesSnapshot ? dependenciesSnapshot.dependencies : null,
            reloginRisk,
            agentStatus,
            preflightOverride,
        };
    }

    return {
        runPreflight,
    };
}

module.exports = {
    DEFAULT_PREFLIGHT_OPTIONS,
    normalizePreflightOverride,
    createSystemUpdatePreflightService,
};
