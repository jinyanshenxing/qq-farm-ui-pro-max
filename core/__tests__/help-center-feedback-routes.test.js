const test = require('node:test');
const assert = require('node:assert/strict');

const routeModulePath = require.resolve('../src/controllers/admin/help-center-feedback-routes');
const serviceModulePath = require.resolve('../src/services/help-center-feedback-service');

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
    const routes = { get: new Map(), post: new Map(), patch: new Map() };
    return {
        routes,
        app: {
            get(path, ...handlers) {
                routes.get.set(path, handlers);
            },
            post(path, ...handlers) {
                routes.post.set(path, handlers);
            },
            patch(path, ...handlers) {
                routes.patch.set(path, handlers);
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

test('help center feedback routes keep auth middleware and delegate submit/list/update actions', async () => {
    const calls = {
        submitFeedback: [],
        listFeedback: [],
        updateFeedback: [],
        assignFeedback: [],
        linkBugReport: [],
    };
    const restoreService = mockModule(serviceModulePath, {
        createHelpCenterFeedbackService: () => ({
            async submitFeedback(payload) {
                calls.submitFeedback.push(payload);
                return { id: 1, feedbackNo: 'HCF001', status: 'open' };
            },
            async listFeedback(query) {
                calls.listFeedback.push(query);
                return { items: [{ id: 1, feedbackNo: 'HCF001' }], total: 1 };
            },
            async getFeedbackById(id) {
                return { id: Number(id), feedbackNo: 'HCF001' };
            },
            async updateFeedback(id, payload, actor) {
                calls.updateFeedback.push({ id, payload, actor });
                return { id: Number(id), status: payload.status || 'triaged' };
            },
            async assignFeedback(id, payload, actor) {
                calls.assignFeedback.push({ id, payload, actor });
                return { id: Number(id), assignedTo: payload.assignedTo };
            },
            async linkBugReport(id, payload, actor) {
                calls.linkBugReport.push({ id, payload, actor });
                return { id: Number(id), linkedBugReportNo: payload.linkedBugReportNo };
            },
        }),
    });

    try {
        delete require.cache[routeModulePath];
        const { registerHelpCenterFeedbackRoutes } = require(routeModulePath);
        const { app, routes } = createFakeApp();
        const authRequired = (_req, _res, next) => next && next();
        registerHelpCenterFeedbackRoutes({
            app,
            authRequired,
            adminLogger: {},
            getPool: () => null,
            adminOperationLogService: {},
        });

        const submitRoute = getRoute(routes, 'post', '/api/help-center/feedback');
        assert.equal(submitRoute.middleware, authRequired);
        const submitRes = createResponse();
        await submitRoute.handler({
            currentUser: { username: 'tester', role: 'user' },
            body: { articleId: 'quick-start', articleTitle: '快速上手', message: '这里描述不清晰' },
        }, submitRes);
        assert.equal(submitRes.statusCode, 200);
        assert.equal(calls.submitFeedback.length, 1);

        const listRoute = getRoute(routes, 'get', '/api/help-center/feedback');
        const listRes = createResponse();
        await listRoute.handler({
            currentUser: { username: 'admin', role: 'admin' },
            query: { status: 'open' },
        }, listRes);
        assert.equal(listRes.statusCode, 200);
        assert.equal(calls.listFeedback.length, 1);

        const patchRoute = getRoute(routes, 'patch', '/api/help-center/feedback/:id');
        const patchRes = createResponse();
        await patchRoute.handler({
            params: { id: '1' },
            currentUser: { username: 'admin', role: 'admin' },
            body: { status: 'resolved' },
        }, patchRes);
        assert.equal(patchRes.statusCode, 200);
        assert.equal(calls.updateFeedback.length, 1);

        const assignRoute = getRoute(routes, 'post', '/api/help-center/feedback/:id/assign');
        const assignRes = createResponse();
        await assignRoute.handler({
            params: { id: '1' },
            currentUser: { username: 'admin', role: 'admin' },
            body: { assignedTo: 'ops' },
        }, assignRes);
        assert.equal(assignRes.statusCode, 200);
        assert.equal(calls.assignFeedback.length, 1);
    } finally {
        delete require.cache[routeModulePath];
        restoreService();
    }
});

test('help center feedback routes reject non-admin management requests', async () => {
    const restoreService = mockModule(serviceModulePath, {
        createHelpCenterFeedbackService: () => ({
            async submitFeedback() {
                return { id: 1 };
            },
            async listFeedback() {
                return { items: [], total: 0 };
            },
            async getFeedbackById() {
                return null;
            },
            async updateFeedback() {
                return { id: 1 };
            },
            async assignFeedback() {
                return { id: 1 };
            },
            async linkBugReport() {
                return { id: 1 };
            },
        }),
    });

    try {
        delete require.cache[routeModulePath];
        const { registerHelpCenterFeedbackRoutes } = require(routeModulePath);
        const { app, routes } = createFakeApp();
        const authRequired = (_req, _res, next) => next && next();
        registerHelpCenterFeedbackRoutes({
            app,
            authRequired,
            adminLogger: {},
            getPool: () => null,
            adminOperationLogService: {},
        });

        const listRoute = getRoute(routes, 'get', '/api/help-center/feedback');
        const res = createResponse();
        await listRoute.handler({
            currentUser: { username: 'tester', role: 'user' },
            query: {},
        }, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.code, 'help_center_forbidden');
    } finally {
        delete require.cache[routeModulePath];
        restoreService();
    }
});
