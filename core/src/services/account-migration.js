function normalizeCredentialKind(account = {}) {
    const code = String(account.code || '').trim();
    const authTicket = String(account.authTicket || '').trim();
    if (authTicket) return 'auth_ticket';
    if (code) return 'login_code';
    return 'none';
}

function evaluateAccountCutover(account = {}) {
    const running = !!account.running;
    const credentialKind = normalizeCredentialKind(account);
    const needsReloginAfterStop = credentialKind !== 'auth_ticket';

    if (!running) {
        return {
            credentialKind,
            cutoverEligible: true,
            cutoverReason: 'none',
            cutoverMessage: '',
            needsReloginAfterStop,
        };
    }

    if (needsReloginAfterStop) {
        return {
            credentialKind,
            cutoverEligible: false,
            cutoverReason: 'hot_migration_missing_relogin_required',
            cutoverMessage: '当前版本未实现运行态热迁移，且该账号仅保存一次性登录凭据；执行排空切换后通常需要重新登录或重新扫码。',
            needsReloginAfterStop: true,
        };
    }

    return {
        credentialKind,
        cutoverEligible: false,
        cutoverReason: 'hot_migration_unsupported',
        cutoverMessage: '当前版本未实现运行态热迁移；执行排空切换会中断该账号。',
        needsReloginAfterStop: false,
    };
}

function buildReloginRiskReadiness({ accounts } = {}) {
    const list = Array.isArray(accounts) ? accounts : [];
    let runningAccountCount = 0;
    let reloginRequiredCount = 0;
    const blockers = [];

    list.forEach((account) => {
        const running = !!(account && account.running);
        if (!running) return;

        runningAccountCount += 1;
        const cutover = evaluateAccountCutover(account);
        if (!cutover.needsReloginAfterStop) return;

        reloginRequiredCount += 1;
        const accountId = String(account && account.id || '').trim();
        blockers.push({
            accountId,
            accountName: String(account && (account.name || account.nick || account.uin || account.id) || '').trim() || accountId,
            platform: String(account && account.platform || '').trim(),
            credentialKind: cutover.credentialKind,
            reasonCode: cutover.cutoverReason,
            message: cutover.cutoverMessage,
            needsReloginAfterStop: cutover.needsReloginAfterStop,
        });
    });

    return {
        checkedAt: Date.now(),
        hasReloginRisk: blockers.length > 0,
        runningAccountCount,
        blockerCount: blockers.length,
        reloginRequiredCount,
        blockers,
    };
}

function buildDrainCutoverReadiness({ accounts, clusterNodes, targetNodeIds } = {}) {
    const list = Array.isArray(accounts) ? accounts : [];
    const nodes = Array.isArray(clusterNodes) ? clusterNodes : [];
    const normalizedTargetNodeIds = Array.from(new Set(
        (Array.isArray(targetNodeIds) ? targetNodeIds : [])
            .map(item => String(item || '').trim())
            .filter(Boolean),
    ));
    const targetNodeSet = new Set(normalizedTargetNodeIds);
    const assignedNodeByAccountId = new Map();

    nodes.forEach((node) => {
        const nodeId = String(node && node.nodeId || '').trim();
        if (!nodeId) return;
        const assignedIds = Array.isArray(node && node.assignedAccountIds)
            ? node.assignedAccountIds
            : [];
        assignedIds.forEach((accountId) => {
            const normalizedAccountId = String(accountId || '').trim();
            if (!normalizedAccountId || assignedNodeByAccountId.has(normalizedAccountId)) return;
            assignedNodeByAccountId.set(normalizedAccountId, nodeId);
        });
    });

    let runningAccountCount = 0;
    let targetedRunningAccountCount = 0;
    let reloginRequiredCount = 0;
    const affectedAccounts = [];
    const blockers = [];

    list.forEach((account) => {
        const accountId = String(account && account.id || '').trim();
        const nodeId = assignedNodeByAccountId.get(accountId) || '';
        const targeted = !!nodeId && (targetNodeSet.size === 0 || targetNodeSet.has(nodeId));
        const running = !!(account && account.running);

        if (running) runningAccountCount += 1;
        if (running && targeted) targetedRunningAccountCount += 1;
        if (!running || !targeted) return;

        const affectedRecord = {
            accountId,
            accountName: String(account && (account.name || account.nick || account.uin || account.id) || '').trim() || accountId,
            platform: String(account && account.platform || '').trim(),
            nodeId,
            credentialKind: normalizeCredentialKind(account),
            needsReloginAfterStop: normalizeCredentialKind(account) !== 'auth_ticket',
        };
        affectedAccounts.push(affectedRecord);

        const cutover = evaluateAccountCutover(account);
        if (cutover.cutoverEligible) return;

        if (cutover.needsReloginAfterStop) reloginRequiredCount += 1;

        blockers.push({
            accountId,
            accountName: String(account && (account.name || account.nick || account.uin || account.id) || '').trim() || accountId,
            platform: String(account && account.platform || '').trim(),
            nodeId,
            credentialKind: cutover.credentialKind,
            reasonCode: cutover.cutoverReason,
            message: cutover.cutoverMessage,
            needsReloginAfterStop: cutover.needsReloginAfterStop,
        });
    });

    const reloginRequiredAccounts = affectedAccounts.filter(item => item.needsReloginAfterStop);
    const blockingNodes = Array.from(new Set(blockers.map(item => item.nodeId).filter(Boolean))).map((nodeId) => {
        const nodeBlockers = blockers.filter(item => item.nodeId === nodeId);
        return {
            nodeId,
            blockerCount: nodeBlockers.length,
            affectedAccounts: nodeBlockers.map(item => ({
                accountId: item.accountId,
                accountName: item.accountName,
                platform: item.platform,
                reasonCode: item.reasonCode,
                needsReloginAfterStop: item.needsReloginAfterStop,
            })),
        };
    });
    const forcedStopCandidates = affectedAccounts.filter((item) => !blockers.find(blocker => blocker.accountId === item.accountId));
    const estimatedDrainSeconds = targetedRunningAccountCount > 0
        ? Math.max(30, targetedRunningAccountCount * 45)
        : 0;

    return {
        checkedAt: Date.now(),
        canDrainCutover: blockers.length === 0,
        targetNodeIds: normalizedTargetNodeIds,
        runningAccountCount,
        targetedRunningAccountCount,
        blockerCount: blockers.length,
        reloginRequiredCount,
        affectedAccounts,
        blockingNodes,
        estimatedDrainSeconds,
        reloginRequiredAccounts,
        forcedStopCandidates,
        blockers,
    };
}

module.exports = {
    normalizeCredentialKind,
    evaluateAccountCutover,
    buildReloginRiskReadiness,
    buildDrainCutoverReadiness,
};
