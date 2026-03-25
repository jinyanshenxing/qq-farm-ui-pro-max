const test = require('node:test');
const assert = require('node:assert/strict');

const routeModulePath = require.resolve('../src/controllers/admin/help-center-observability-routes');
const serviceModulePath = require.resolve('../src/services/help-center-event-service');
const validatorModulePath = require.resolve('../src/services/config-validator');

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

function getRoute(routes, method, path) {
    const handlers = routes[method].get(path);
    assert.ok(handlers, `missing route ${method.toUpperCase()} ${path}`);
    return {
        middleware: handlers.length > 1 ? handlers[0] : null,
        handler: handlers[handlers.length - 1],
    };
}

test('help center observability routes keep auth middleware and expose public config plus batch ingestion', async () => {
    const calls = { acceptEventBatch: [], setConfig: [] };
    const restoreService = mockModule(serviceModulePath, {
        createHelpCenterEventService: () => ({
            async acceptEventBatch(payload) {
                calls.acceptEventBatch.push(payload);
                return { accepted: 1, ignored: 0 };
            },
        }),
        async getHelpCenterObservabilityConfig() {
            return {
                telemetryEnabled: true,
                feedbackEnabled: false,
                jumpTracingEnabled: true,
                telemetrySamplingRate: 1,
                batchSize: 20,
                flushIntervalMs: 15000,
                retentionDays: 90,
            };
        },
        async setHelpCenterObservabilityConfig(input) {
            calls.setConfig.push(input);
            return { telemetryEnabled: true, feedbackEnabled: true, jumpTracingEnabled: true, telemetrySamplingRate: 1 };
        },
        buildPublicHelpCenterObservabilityConfig(config) {
            return {
                telemetryEnabled: !!config.telemetryEnabled,
                feedbackEnabled: !!config.feedbackEnabled,
                jumpTracingEnabled: !!config.jumpTracingEnabled,
                telemetrySamplingRate: config.telemetrySamplingRate,
            };
        },
    });
    const restoreValidator = mockModule(validatorModulePath, {
        validateHelpCenterObservabilityConfig: () => ({
            valid: true,
            errors: [],
            coerced: { telemetryEnabled: true, feedbackEnabled: true, jumpTracingEnabled: true, telemetrySamplingRate: 1 },
        }),
    });

    try {
        delete require.cache[routeModulePath];
        const { registerHelpCenterObservabilityRoutes } = require(routeModulePath);
        const { app, routes } = createFakeApp();
        const authRequired = (_req, _res, next) => next && next();

        registerHelpCenterObservabilityRoutes({
            app,
            authRequired,
            adminLogger: {},
            getPool: () => null,
        });

        const configRoute = getRoute(routes, 'get', '/api/help-center/config');
        assert.equal(configRoute.middleware, authRequired);
        const configRes = createResponse();
        await configRoute.handler({}, configRes);
        assert.deepEqual(configRes.body, {
            ok: true,
            data: {
                telemetryEnabled: true,
                feedbackEnabled: false,
                jumpTracingEnabled: true,
                telemetrySamplingRate: 1,
            },
        });

        const batchRoute = getRoute(routes, 'post', '/api/help-center/events/batch');
        const batchRes = createResponse();
        await batchRoute.handler({
            currentUser: { username: 'tester', role: 'user' },
            body: { events: [{ eventNo: 'evt-1', eventType: 'article_open' }] },
        }, batchRes);
        assert.equal(batchRes.statusCode, 200);
        assert.equal(calls.acceptEventBatch.length, 1);
        assert.deepEqual(batchRes.body, { ok: true, data: { accepted: 1, ignored: 0 } });

        const saveRoute = getRoute(routes, 'post', '/api/settings/help-center-observability');
        const saveRes = createResponse();
        await saveRoute.handler({
            currentUser: { username: 'admin', role: 'admin' },
            body: { telemetryEnabled: true },
        }, saveRes);
        assert.equal(saveRes.statusCode, 200);
        assert.equal(calls.setConfig.length, 1);
    } finally {
        delete require.cache[routeModulePath];
        restoreService();
        restoreValidator();
    }
});

test('help center observability admin settings reject non-admin users and invalid payloads', async () => {
    const restoreService = mockModule(serviceModulePath, {
        createHelpCenterEventService: () => ({
            async acceptEventBatch() {
                return { accepted: 0, ignored: 0 };
            },
        }),
        async getHelpCenterObservabilityConfig() {
            return { telemetryEnabled: false, feedbackEnabled: false, jumpTracingEnabled: false, telemetrySamplingRate: 0 };
        },
        async setHelpCenterObservabilityConfig(input) {
            return input;
        },
        buildPublicHelpCenterObservabilityConfig(config) {
            return config;
        },
    });
    const restoreValidator = mockModule(validatorModulePath, {
        validateHelpCenterObservabilityConfig: () => ({
            valid: false,
            errors: ['帮助中心埋点采样率必须在 0 到 1 之间'],
            coerced: {},
        }),
    });

    try {
        delete require.cache[routeModulePath];
        const { registerHelpCenterObservabilityRoutes } = require(routeModulePath);
        const { app, routes } = createFakeApp();
        const authRequired = (_req, _res, next) => next && next();
        registerHelpCenterObservabilityRoutes({
            app,
            authRequired,
            adminLogger: {},
            getPool: () => null,
        });

        const saveRoute = getRoute(routes, 'post', '/api/settings/help-center-observability');

        const forbiddenRes = createResponse();
        await saveRoute.handler({
            currentUser: { username: 'tester', role: 'user' },
            body: {},
        }, forbiddenRes);
        assert.equal(forbiddenRes.statusCode, 403);

        const invalidRes = createResponse();
        await saveRoute.handler({
            currentUser: { username: 'admin', role: 'admin' },
            body: { telemetrySamplingRate: 9 },
        }, invalidRes);
        assert.equal(invalidRes.statusCode, 400);
        assert.equal(invalidRes.body.code, 'help_center_invalid_payload');
    } finally {
        delete require.cache[routeModulePath];
        restoreService();
        restoreValidator();
    }
});
