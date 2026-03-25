const test = require('node:test');
const assert = require('node:assert/strict');

const routeModulePath = require.resolve('../src/controllers/admin/help-center-analytics-routes');
const serviceModulePath = require.resolve('../src/services/help-center-analytics-service');

function mockModule(modulePath, exports) {
    const previous = require.cache[modulePath];
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports,
    };
    return () => {
        if (previous) require.cache[modulePath] = previous;
        else delete require.cache[modulePath];
    };
}

function createFakeApp() {
    const routes = { get: new Map() };
    return {
        routes,
        app: {
            get(path, ...handlers) {
                routes.get.set(path, handlers);
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

function getRoute(routes, path) {
    const handlers = routes.get.get(path);
    assert.ok(handlers, `missing route GET ${path}`);
    return {
        middleware: handlers.length > 1 ? handlers[0] : null,
        handler: handlers[handlers.length - 1],
    };
}

test('help center analytics routes require admin and delegate to analytics service', async () => {
    const calls = {
        getOverview: 0,
        listArticleMetrics: 0,
        listEntryPages: 0,
        listSearchKeywords: 0,
        listJumpFailures: 0,
    };
    const restoreService = mockModule(serviceModulePath, {
        createHelpCenterAnalyticsService: () => ({
            async getOverview() {
                calls.getOverview += 1;
                return { articleOpenCount: 1 };
            },
            async listArticleMetrics() {
                calls.listArticleMetrics += 1;
                return { items: [] };
            },
            async listEntryPages() {
                calls.listEntryPages += 1;
                return { items: [] };
            },
            async listSearchKeywords() {
                calls.listSearchKeywords += 1;
                return { items: [] };
            },
            async listJumpFailures() {
                calls.listJumpFailures += 1;
                return { items: [] };
            },
        }),
    });

    try {
        delete require.cache[routeModulePath];
        const { registerHelpCenterAnalyticsRoutes } = require(routeModulePath);
        const { app, routes } = createFakeApp();
        const authRequired = (_req, _res, next) => next && next();
        registerHelpCenterAnalyticsRoutes({
            app,
            authRequired,
            adminLogger: {},
            getPool: () => null,
        });

        const overviewRoute = getRoute(routes, '/api/help-center/analytics/overview');
        const overviewRes = createResponse();
        await overviewRoute.handler({
            currentUser: { username: 'admin', role: 'admin' },
            query: {},
        }, overviewRes);
        assert.equal(overviewRes.statusCode, 200);
        assert.equal(calls.getOverview, 1);

        const forbiddenRes = createResponse();
        await overviewRoute.handler({
            currentUser: { username: 'tester', role: 'user' },
            query: {},
        }, forbiddenRes);
        assert.equal(forbiddenRes.statusCode, 403);
        assert.equal(forbiddenRes.body.code, 'help_center_forbidden');
    } finally {
        delete require.cache[routeModulePath];
        restoreService();
    }
});
