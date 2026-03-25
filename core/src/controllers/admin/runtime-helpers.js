const { parseUpdateLogEntries } = require('../../services/announcement-materializer');

function createAccountRuntimeHelpers({
    getProvider,
    getAccountsSnapshot,
    normalizeAccountRef,
    resolveAccountId,
}) {
    const getAccountList = async () => {
        try {
            const provider = getProvider();
            if (provider && typeof provider.getAccounts === 'function') {
                const data = await provider.getAccounts();
                if (data && Array.isArray(data.accounts)) return data.accounts;
            }
        } catch {
            // ignore provider failures
        }
        const data = await getAccountsSnapshot();
        return Array.isArray(data.accounts) ? data.accounts : [];
    };

    const getAccountSnapshotById = async (accountId) => {
        const list = await getAccountList();
        const targetId = String(accountId || '').trim();
        return list.find((acc) => {
            const candidates = [
                acc && acc.id,
                acc && acc.accountId,
                acc && acc.qq,
                acc && acc.username,
            ].map(value => String(value || '').trim()).filter(Boolean);
            return candidates.includes(targetId);
        }) || {};
    };

    const isSoftRuntimeError = (err) => {
        const msg = String((err && err.message) || '');
        return msg === '账号未运行' || msg === 'API Timeout';
    };

    function handleApiError(res, err) {
        if (isSoftRuntimeError(err)) {
            return res.json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: err.message });
    }

    const resolveAccId = async (rawRef) => {
        const input = normalizeAccountRef(rawRef);
        if (!input) return '';

        const provider = getProvider();
        if (provider && typeof provider.resolveAccountId === 'function') {
            const resolvedByProvider = normalizeAccountRef(await provider.resolveAccountId(input));
            if (resolvedByProvider) return resolvedByProvider;
        }

        const resolved = resolveAccountId(await getAccountList(), input);
        return resolved || input;
    };

    async function getAccId(req) {
        return await resolveAccId(req.headers['x-account-id']);
    }

    return {
        getAccountList,
        getAccountSnapshotById,
        isSoftRuntimeError,
        handleApiError,
        resolveAccId,
        getAccId,
    };
}

function createTrialRateLimiter({
    getClientIP,
    trialRateLimitMap,
    windowMs = 60 * 60 * 1000,
    maxCalls = 3,
    tooManyRequestsMessage = '您的公网 IP 体验卡申请频率过高，请 1 小时后再试 (429)',
}) {
    return (req, res, next) => {
        const ip = getClientIP(req);
        const now = Date.now();
        const record = trialRateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + windowMs;
        } else {
            record.count += 1;
            if (record.count > maxCalls) {
                return res.status(429).json({ ok: false, error: tooManyRequestsMessage });
            }
        }
        trialRateLimitMap.set(ip, record);
        next();
    };
}

function createUpdateLogParser({
    fsRef,
    pathRef,
    baseDir,
    cacheTtlMs = 5 * 60 * 1000,
    nowFn = () => Date.now(),
}) {
    let notificationsCache = null;
    let notificationsCacheTime = 0;

    return () => {
        const now = nowFn();
        if (notificationsCache && (now - notificationsCacheTime) < cacheTtlMs) {
            return notificationsCache;
        }
        const logPath = pathRef.join(baseDir, '../../../logs/development/Update.log');
        if (!fsRef.existsSync(logPath)) return [];
        const raw = fsRef.readFileSync(logPath, 'utf-8');
        const parsedEntries = parseUpdateLogEntries(raw);
        notificationsCache = parsedEntries.map((entry) => ({
            date: entry.publishDate,
            title: entry.title,
            version: entry.version,
            content: entry.content,
        }));
        notificationsCacheTime = now;
        return notificationsCache;
    };
}

module.exports = {
    createAccountRuntimeHelpers,
    createTrialRateLimiter,
    createUpdateLogParser,
};
