const friendRiskService = require('../../services/friend-risk-service');
const friendStealStatsService = require('../../services/friend-steal-stats-service');

function registerFriendBlacklistRoutes({
    app,
    accountOwnershipRequired,
    getAccId,
    store,
    getProvider,
}) {
    app.get('/api/friend-blacklist', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
        const list = store.getFriendBlacklist ? store.getFriendBlacklist(id) : [];
        res.json({ ok: true, data: list });
    });

    app.post('/api/friend-blacklist/toggle', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
        const gid = Number((req.body || {}).gid);
        if (!gid) return res.status(400).json({ ok: false, error: 'Missing gid' });
        const current = store.getFriendBlacklist ? store.getFriendBlacklist(id) : [];
        const next = current.includes(gid)
            ? current.filter(g => g !== gid)
            : [...current, gid];
        const saved = store.setFriendBlacklist ? store.setFriendBlacklist(id, next) : next;
        const provider = getProvider();
        if (provider && typeof provider.broadcastConfig === 'function') {
            provider.broadcastConfig(id);
        }
        res.json({ ok: true, data: saved });
    });
}

function isAccountMarkedBanned(account) {
    const wsError = account && account.wsError && typeof account.wsError === 'object' ? account.wsError : null;
    const code = Number(wsError && wsError.code) || 0;
    const message = String(wsError && wsError.message || '').trim();
    return code === 1000016 || /已被封禁|账号已被封禁|封禁/.test(message);
}

function registerAccountControlRoutes({
    app,
    accountOwnershipRequired,
    getAccId,
    getProvider,
    store,
    resolveAccId,
    getAccountList,
    accountRepository,
    adminLogger,
    handleApiError,
    loadGenerateSafeModeBlacklist,
    loadGetPlantRankings,
}) {
    async function resolveAnalyticsAccountContext(req, requestedTimingMode) {
        const rawAccountId = String(req.headers?.['x-account-id'] || '').trim();
        if (!rawAccountId) {
            return { accountId: '', timingMode: 'theoretical' };
        }

        const resolvedId = await resolveAccId(rawAccountId) || rawAccountId;
        if (req.currentUser?.role === 'admin') {
            return { accountId: resolvedId, timingMode: requestedTimingMode };
        }

        const accounts = await getAccountList();
        const account = accounts.find(item => String(item && item.id || '') === String(resolvedId));
        if (!account) {
            if (requestedTimingMode === 'actual') {
                return { errorStatus: 404, error: '账号不存在' };
            }
            return { accountId: '', timingMode: 'theoretical' };
        }

        if (account.username && account.username === req.currentUser?.username) {
            return { accountId: resolvedId, timingMode: requestedTimingMode };
        }

        if (requestedTimingMode === 'actual') {
            return { errorStatus: 403, error: '无权操作此账号' };
        }
        return { accountId: '', timingMode: 'theoretical' };
    }

    app.post('/api/accounts/:id/start', accountOwnershipRequired, async (req, res) => {
        try {
            const resolvedId = await resolveAccId(req.params.id) || String(req.params.id || '');
            const accounts = await getAccountList();
            const account = accounts.find(item => String(item && item.id || '') === resolvedId);
            if (isAccountMarkedBanned(account)) {
                return res.status(409).json({ ok: false, error: '该账号已被服务端封禁，已阻止启动。请保持停用或更换账号。' });
            }
            const ok = await getProvider().startAccount(resolvedId);
            if (!ok) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/accounts/:id/stop', accountOwnershipRequired, async (req, res) => {
        try {
            const ok = await getProvider().stopAccount(req.params.id);
            if (!ok) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/accounts/:id/restart', accountOwnershipRequired, async (req, res) => {
        try {
            const resolvedId = await resolveAccId(req.params.id) || String(req.params.id || '');
            const accounts = await getAccountList();
            const account = accounts.find(item => String(item && item.id || '') === resolvedId);
            if (isAccountMarkedBanned(account)) {
                return res.status(409).json({ ok: false, error: '该账号已被服务端封禁，已阻止重启。请保持停用或更换账号。' });
            }
            const ok = await getProvider().restartAccount(resolvedId);
            if (!ok) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/accounts/:id/mode', accountOwnershipRequired, async (req, res) => {
        try {
            const resolvedId = await resolveAccId(req.params.id) || String(req.params.id || '');
            const mode = String((req.body || {}).mode || '');

            if (!store.ACCOUNT_MODE_PRESETS || !store.ACCOUNT_MODE_PRESETS[mode]) {
                return res.status(400).json({ ok: false, error: '无效的账号模式' });
            }

            let downgraded = [];
            if (mode === 'main') {
                const accounts = await getAccountList();
                const targetAcc = accounts.find(a => String(a.id) === resolvedId);
                const ownerUsername = targetAcc ? targetAcc.username : (req.currentUser ? req.currentUser.username : 'admin');

                if (ownerUsername && store.ensureMainAccountUnique) {
                    downgraded = await store.ensureMainAccountUnique(resolvedId, ownerUsername);
                }
            }

            const updatedConfig = store.applyAccountMode(resolvedId, mode);
            const dbPayload = { account_mode: mode };
            if (updatedConfig.harvestDelay) {
                dbPayload.harvest_delay_min = updatedConfig.harvestDelay.min;
                dbPayload.harvest_delay_max = updatedConfig.harvestDelay.max;
            }
            await accountRepository.updateConfig(resolvedId, dbPayload);

            const provider = getProvider();
            if (provider && typeof provider.broadcastConfig === 'function') {
                provider.broadcastConfig(resolvedId);
                for (const acc of downgraded) {
                    const altConfig = store.getAccountConfigSnapshot(acc.id);
                    const altPayload = { account_mode: 'alt' };
                    if (altConfig.harvestDelay) {
                        altPayload.harvest_delay_min = altConfig.harvestDelay.min;
                        altPayload.harvest_delay_max = altConfig.harvestDelay.max;
                    }
                    await accountRepository.updateConfig(acc.id, altPayload);
                    provider.broadcastConfig(acc.id);
                }
            }

            adminLogger.info(`账号 ${resolvedId} 模式切换为 ${mode}`, { downgraded });
            res.json({ ok: true, data: { config: updatedConfig, downgraded } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/accounts/:id/safe-mode/apply-blacklist', accountOwnershipRequired, async (req, res) => {
        try {
            const resolvedId = await resolveAccId(req.params.id) || String(req.params.id || '');
            const generateSafeModeBlacklist = loadGenerateSafeModeBlacklist();

            if (typeof generateSafeModeBlacklist !== 'function') {
                return res.status(400).json({ ok: false, error: '安全巡查黑名单服务未就绪' });
            }

            const addedUins = await generateSafeModeBlacklist(resolvedId);
            const provider = getProvider();
            if (provider && typeof provider.broadcastConfig === 'function') {
                provider.broadcastConfig(resolvedId);
            }

            res.json({ ok: true, data: { addedCount: addedUins.length, addedUins } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('/api/friend-risk/profiles', accountOwnershipRequired, async (req, res) => {
        try {
            const accountId = await getAccId(req);
            if (!accountId) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            const data = await friendRiskService.listFriendRiskProfiles(accountId, {
                keyword: req.query.keyword,
                level: req.query.level,
                limit: req.query.limit,
            });
            res.json({ ok: true, data });
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.get('/api/friend-risk/events', accountOwnershipRequired, async (req, res) => {
        try {
            const accountId = await getAccId(req);
            if (!accountId) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            const data = await friendRiskService.listFriendRiskEvents(accountId, {
                friendGid: req.query.friendGid,
                limit: req.query.limit,
            });
            res.json({ ok: true, data });
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.get('/api/friend-risk/summary', accountOwnershipRequired, async (req, res) => {
        try {
            const accountId = await getAccId(req);
            if (!accountId) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            const data = await friendRiskService.getFriendRiskSummary(accountId);
            res.json({ ok: true, data });
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.post('/api/friend-risk/:gid/reset', accountOwnershipRequired, async (req, res) => {
        try {
            const accountId = await getAccId(req);
            if (!accountId) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            const ok = await friendRiskService.resetFriendRiskProfile(accountId, req.params.gid);
            res.json({ ok: !!ok });
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.get('/api/friend-special-care', accountOwnershipRequired, async (req, res) => {
        try {
            const accountId = await getAccId(req);
            if (!accountId) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            const data = store.getSpecialCareFriendIds ? store.getSpecialCareFriendIds(accountId) : [];
            res.json({ ok: true, data });
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.post('/api/friend-special-care/toggle', accountOwnershipRequired, async (req, res) => {
        try {
            const accountId = await getAccId(req);
            if (!accountId) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            const gid = Number((req.body || {}).gid);
            if (!gid) return res.status(400).json({ ok: false, error: 'Missing gid' });
            const current = store.getSpecialCareFriendIds ? store.getSpecialCareFriendIds(accountId) : [];
            const currentSet = new Set(current.map(Number));
            if (currentSet.has(gid)) currentSet.delete(gid);
            else currentSet.add(gid);
            const data = store.setSpecialCareFriendIds ? store.setSpecialCareFriendIds(accountId, Array.from(currentSet)) : Array.from(currentSet);
            const provider = getProvider();
            if (provider && typeof provider.broadcastConfig === 'function') {
                provider.broadcastConfig(accountId);
            }
            res.json({ ok: true, data });
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.get('/api/friend-steal-stats', accountOwnershipRequired, async (req, res) => {
        try {
            const accountId = await getAccId(req);
            if (!accountId) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            const list = await friendStealStatsService.listFriendStealStats(accountId, {
                keyword: req.query.keyword,
                limit: req.query.limit,
            });
            const overview = await friendStealStatsService.getFriendStealStatsOverview(accountId);
            res.json({ ok: true, data: { overview, list } });
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.post('/api/farm/operate', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const { opType } = req.body;
            await getProvider().doFarmOp(id, opType);
            res.json({ ok: true });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    app.post('/api/farm/land/operate', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const { opType, landId } = req.body || {};
            const data = await getProvider().doFarmLandOp(id, opType, landId);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    app.get('/api/analytics', async (req, res) => {
        try {
            const ANALYTICS_SORT_WHITELIST = new Set(['exp', 'fert', 'gold', 'profit', 'fert_profit', 'level']);
            const ANALYTICS_TIMING_MODE_WHITELIST = new Set(['theoretical', 'actual']);
            const rawSort = String(req.query.sort || 'exp');
            const sortBy = ANALYTICS_SORT_WHITELIST.has(rawSort) ? rawSort : 'exp';
            const rawTimingMode = String(req.query.timingMode || 'theoretical');
            const timingMode = ANALYTICS_TIMING_MODE_WHITELIST.has(rawTimingMode) ? rawTimingMode : 'theoretical';
            const levelRaw = req.query.level;
            const levelMax = (levelRaw !== undefined && levelRaw !== '' && Number.isFinite(Number(levelRaw)))
                ? Number(levelRaw) : null;
            const analyticsContext = await resolveAnalyticsAccountContext(req, timingMode);
            if (analyticsContext.error) {
                return res.status(analyticsContext.errorStatus).json({ ok: false, error: analyticsContext.error });
            }
            const rankingOptions = {
                timingMode: analyticsContext.accountId ? analyticsContext.timingMode : 'theoretical',
            };
            if (analyticsContext.accountId) {
                rankingOptions.accountId = analyticsContext.accountId;
            }
            const data = loadGetPlantRankings()(sortBy, levelMax, rankingOptions);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });
}

module.exports = {
    registerFriendBlacklistRoutes,
    registerAccountControlRoutes,
};
