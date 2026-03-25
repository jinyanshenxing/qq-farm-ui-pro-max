const test = require('node:test');
const assert = require('node:assert/strict');

const { registerSystemPublicRoutes, registerNotificationsRoute } = require('../src/controllers/admin/system-public-routes');

function createFakeApp() {
    const routes = { get: new Map(), post: new Map() };
    return {
        routes,
        app: {
            get(path, ...handlers) {
                routes.get.set(path, handlers);
            },
            post(path, ...handlers) {
                routes.post.set(path, handlers);
            },
        },
    };
}

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

function getHandler(routes, path, method = 'get') {
    const handlers = routes[method].get(path);
    assert.ok(handlers, `missing route: ${String(method).toUpperCase()} ${path}`);
    assert.equal(handlers.length, 1);
    assert.equal(typeof handlers[0], 'function');
    return handlers[0];
}

function createDeps(overrides = {}) {
    return {
        app: null,
        getPool: () => ({
            query: async () => [[]],
        }),
        getAccountsSnapshot: async () => ({ accounts: [] }),
        inspectSystemSettingsHealth: async () => ({ ok: true }),
        inspectWebDistState: () => ({
            activeDirRelative: 'web/dist',
            activeSource: 'default',
            selectionReason: 'default_ready',
            selectionReasonLabel: '默认目录存在有效产物',
            buildTargetDirRelative: 'web/dist',
            buildTargetSource: 'default',
            defaultDirRelative: 'web/dist',
            defaultHasAssets: true,
            defaultWritable: true,
            fallbackDirRelative: 'web/dist-runtime',
            fallbackHasAssets: false,
            fallbackWritable: true,
        }),
        version: 'v-test',
        processRef: { uptime: () => 12.34 },
        store: {
            getUI: () => ({ theme: 'light', siteTitle: 'global' }),
        },
        resolveRequestUser: async () => null,
        getUserUiConfig: async () => ({}),
        mergeUiConfig: (globalUi, userUi) => ({ ...globalUi, ...userUi }),
        getUserPreferences: async () => null,
        getAccId: async () => 'acc-1',
        getProvider: () => ({}),
        getSchedulerRegistrySnapshot: () => ({ schedulerCount: 1 }),
        adminOperationLogService: null,
        handleApiError: (res, err) => res.status(500).json({ ok: false, error: err.message }),
        parseUpdateLog: () => [],
        readLatestQqFriendDiagnostics: () => null,
        ...overrides,
    };
}

test('system logs route returns empty result for non-admin without owned accounts', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getPool: () => ({
            query: async () => {
                throw new Error('should not query database');
            },
        }),
    });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/system-logs');
    const res = createResponse();

    await handler({ query: {}, currentUser: { username: 'alice', role: 'user' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: { total: 0, page: 1, limit: 50, items: [] },
    });
});

test('system settings health route blocks non-admin users', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({ app });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/system-settings/health');
    const res = createResponse();

    await handler({ currentUser: { role: 'user' } }, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { ok: false, error: '仅管理员可查看 system_settings 自检结果' });
});

test('system settings health route includes web asset selection snapshot for admins', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        inspectSystemSettingsHealth: async () => ({
            ok: true,
            missingRequiredKeys: [],
        }),
        inspectWebDistState: () => ({
            activeDirRelative: 'web/dist-runtime',
            activeSource: 'fallback',
            selectionReason: 'fallback_missing_default_assets',
            selectionReasonLabel: '默认目录缺少有效产物，回退目录可用',
            buildTargetDirRelative: 'web/dist',
            buildTargetSource: 'default',
            defaultDirRelative: 'web/dist',
            defaultHasAssets: false,
            defaultWritable: true,
            fallbackDirRelative: 'web/dist-runtime',
            fallbackHasAssets: true,
            fallbackWritable: true,
        }),
    });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/system-settings/health');
    const res = createResponse();

    await handler({ currentUser: { role: 'admin' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            ok: true,
            missingRequiredKeys: [],
            webAssets: {
                activeDir: 'web/dist-runtime',
                activeSource: 'fallback',
                selectionReason: 'fallback_missing_default_assets',
                selectionReasonLabel: '默认目录缺少有效产物，回退目录可用',
                buildTargetDir: 'web/dist',
                buildTargetSource: 'default',
                defaultDir: 'web/dist',
                defaultHasAssets: false,
                defaultWritable: true,
                fallbackDir: 'web/dist-runtime',
                fallbackHasAssets: true,
                fallbackWritable: true,
            },
        },
    });
});

test('stats trend route returns one zero-filled point when database is empty', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({ app });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/stats/trend');
    const res = createResponse();

    await handler({ currentUser: { role: 'admin' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.dates.length, 1);
    assert.deepEqual(res.body.data.series, { exp: [0], gold: [0], steal: [0] });
});

test('auth validate route echoes current user marker', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({ app });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/auth/validate');
    const res = createResponse();

    await handler({ currentUser: { username: 'alice', role: 'user', card: { code: 'c1' } } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            valid: true,
            user: {
                username: 'alice',
                role: 'user',
                card: { code: 'c1' },
            },
        },
    });
});

test('ping route exposes lightweight web asset routing status', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        version: 'v-4.5.17',
        processRef: { uptime: () => 88.5 },
        inspectWebDistState: () => ({
            activeDirRelative: 'web/dist',
            activeSource: 'default',
            selectionReason: 'default_ready',
            selectionReasonLabel: '默认目录存在有效产物',
            buildTargetDirRelative: 'web/dist',
            buildTargetSource: 'default',
            defaultDirRelative: 'web/dist',
            defaultHasAssets: true,
            defaultWritable: true,
            fallbackDirRelative: 'web/dist-runtime',
            fallbackHasAssets: true,
            fallbackWritable: true,
        }),
    });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/ping');
    const res = createResponse();

    await handler({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            ok: true,
            uptime: 88.5,
            version: 'v-4.5.17',
            webAssets: {
                activeDir: 'web/dist',
                activeSource: 'default',
                selectionReason: 'default_ready',
                selectionReasonLabel: '默认目录存在有效产物',
                buildTargetDir: 'web/dist',
                buildTargetSource: 'default',
                defaultDir: 'web/dist',
                defaultHasAssets: true,
                defaultWritable: true,
                fallbackDir: 'web/dist-runtime',
                fallbackHasAssets: true,
                fallbackWritable: true,
            },
        },
    });
});

test('ui config route merges per-user overrides for non-admin users', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        resolveRequestUser: async () => ({ username: 'alice', role: 'user' }),
        getUserUiConfig: async () => ({ siteTitle: 'user-title' }),
        getUserPreferences: async () => ({ currentAccountId: 'acc-9' }),
    });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/ui-config');
    const res = createResponse();

    await handler({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: { theme: 'light', siteTitle: 'user-title', currentAccountId: 'acc-9' },
    });
});

test('scheduler route falls back to runtime snapshot when worker status is unavailable', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getSchedulerRegistrySnapshot: () => ({ schedulerCount: 2 }),
    });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/scheduler');
    const res = createResponse();

    await handler({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            runtime: { schedulerCount: 2 },
            worker: null,
            workerError: '当前运行环境不支持调度器状态查询',
            reloadTargets: [],
            reloadHistory: [],
            reloadError: '当前运行环境不支持热重载查询',
        },
    });
});

test('scheduler route returns provider scheduler status with reload targets', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getProvider: () => ({
            getSchedulerStatus: async () => ({
                accountId: 'acc-1',
                runtime: { schedulerCount: 1 },
                worker: { schedulerCount: 3 },
                workerError: '',
                reloadTargets: [{ target: 'farm', modules: ['farm', 'friend'] }],
                reloadHistory: [{ target: 'farm', result: 'ok', durationMs: 500 }],
                reloadError: '',
            }),
        }),
    });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/scheduler');
    const res = createResponse();

    await handler({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            accountId: 'acc-1',
            runtime: { schedulerCount: 1 },
            worker: { schedulerCount: 3 },
            workerError: '',
            reloadTargets: [{ target: 'farm', modules: ['farm', 'friend'] }],
            reloadHistory: [{ target: 'farm', result: 'ok', durationMs: 500 }],
            reloadError: '',
        },
    });
});

test('scheduler reload route validates target and forwards request to provider', async () => {
    const { app, routes } = createFakeApp();
    const reloadCalls = [];
    const accountLogs = [];
    const auditLogs = [];
    const deps = createDeps({
        app,
        getAccountsSnapshot: async () => ({ accounts: [{ id: 'acc-1', name: '账号一号' }] }),
        getProvider: () => ({
            reloadRuntimeModule: async (accountId, target, options) => {
                reloadCalls.push({ accountId, target, options });
                return { target, modules: ['farm', 'friend'] };
            },
            addAccountLog: (...args) => {
                accountLogs.push(args);
            },
        }),
        adminOperationLogService: {
            createAdminOperationLog: async (payload) => {
                auditLogs.push(payload);
                return payload;
            },
        },
    });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/scheduler/reload', 'post');
    const res = createResponse();

    await handler({ body: { target: 'farm', options: { reason: 'manual' } }, currentUser: { username: 'admin', role: 'admin' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(reloadCalls, [{
        accountId: 'acc-1',
        target: 'farm',
        options: {
            reason: 'manual',
            source: 'admin_api',
        },
    }]);
    assert.deepEqual(accountLogs, [[
        'runtime_reload',
        '管理员 admin 热重载 账号一号 的农场模块，重建 farm / friend',
        'acc-1',
        '账号一号',
        {
            actorUsername: 'admin',
            actorRole: 'admin',
            target: 'farm',
            targetLabel: '农场模块',
            modules: ['farm', 'friend'],
            source: 'admin_api',
            result: 'ok',
            reason: '',
        },
    ]]);
    assert.deepEqual(auditLogs, [{
        actorUsername: 'admin',
        scope: 'runtime',
        actionLabel: '热重载 农场模块',
        status: 'success',
        totalCount: 1,
        successCount: 1,
        failedCount: 0,
        affectedNames: ['账号一号'],
        failedNames: [],
        detailLines: [
            '账号：账号一号',
            '目标模块族：农场模块 (farm)',
            '重建模块：farm、friend',
            '来源：admin_api',
        ],
    }]);
    assert.deepEqual(res.body, {
        ok: true,
        data: { target: 'farm', modules: ['farm', 'friend'] },
    });
});

test('scheduler reload route rejects empty target', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({ app });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/scheduler/reload', 'post');
    const res = createResponse();

    await handler({ body: {} }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { ok: false, error: '缺少热重载目标' });
});

test('scheduler reload route records failure audit before returning error', async () => {
    const { app, routes } = createFakeApp();
    const accountLogs = [];
    const auditLogs = [];
    const deps = createDeps({
        app,
        getAccountsSnapshot: async () => ({ accounts: [{ id: 'acc-1', name: '账号一号' }] }),
        getProvider: () => ({
            reloadRuntimeModule: async () => {
                throw new Error('worker exploded');
            },
            addAccountLog: (...args) => {
                accountLogs.push(args);
            },
        }),
        adminOperationLogService: {
            createAdminOperationLog: async (payload) => {
                auditLogs.push(payload);
                return payload;
            },
        },
    });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/scheduler/reload', 'post');
    const res = createResponse();

    await handler({ body: { target: 'business' }, currentUser: { username: 'admin', role: 'admin' } }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(accountLogs, [[
        'runtime_reload_failed',
        '管理员 admin 热重载 账号一号 的全部业务模块失败: worker exploded',
        'acc-1',
        '账号一号',
        {
            actorUsername: 'admin',
            actorRole: 'admin',
            target: 'business',
            targetLabel: '全部业务模块',
            modules: [],
            source: 'admin_api',
            result: 'error',
            reason: 'worker exploded',
        },
    ]]);
    assert.deepEqual(auditLogs, [{
        actorUsername: 'admin',
        scope: 'runtime',
        actionLabel: '热重载 全部业务模块',
        status: 'error',
        totalCount: 1,
        successCount: 0,
        failedCount: 1,
        affectedNames: ['账号一号'],
        failedNames: ['账号一号'],
        detailLines: [
            '账号：账号一号',
            '目标模块族：全部业务模块 (business)',
            '来源：admin_api',
            '失败原因：worker exploded',
        ],
    }]);
    assert.deepEqual(res.body, { ok: false, error: 'worker exploded' });
});

test('qq friend diagnostics route blocks non-admin users', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({ app });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/qq-friend-diagnostics');
    const res = createResponse();

    await handler({ currentUser: { role: 'user' }, query: {} }, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { ok: false, error: '仅管理员可查看 QQ 好友诊断结果' });
});

test('qq friend diagnostics route returns latest parsed snapshot for admins', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        readLatestQqFriendDiagnostics: (appid) => ({
            appid: appid || '1112386029',
            qqVersion: '9.2.70',
            summary: { protocolLikely: 'qq-host-bridge' },
        }),
    });

    registerSystemPublicRoutes(deps);
    const handler = getHandler(routes, '/api/qq-friend-diagnostics');
    const res = createResponse();

    await handler({ currentUser: { role: 'admin' }, query: { appid: '1112386029' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            appid: '1112386029',
            qqVersion: '9.2.70',
            summary: { protocolLikely: 'qq-host-bridge' },
        },
    });
});

test('notifications route respects limit parameter', async () => {
    const { app, routes } = createFakeApp();
    registerNotificationsRoute({
        app,
        getNotificationEntries: async () => [
            { title: 'A' },
            { title: 'B' },
        ],
    });

    const handler = getHandler(routes, '/api/notifications');
    const res = createResponse();

    await handler({ query: { limit: '1' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, data: [{ title: 'A' }] });
});
