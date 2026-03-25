const { validateHelpCenterObservabilityConfig } = require('../../services/config-validator');
const {
    buildPublicHelpCenterObservabilityConfig,
    createHelpCenterEventService,
    getHelpCenterObservabilityConfig,
    setHelpCenterObservabilityConfig,
} = require('../../services/help-center-event-service');

function registerHelpCenterObservabilityRoutes({
    app,
    authRequired,
    adminLogger,
    getPool,
}) {
    const eventService = createHelpCenterEventService({
        getPool,
        logger: adminLogger,
    });

    app.get('/api/help-center/config', authRequired, async (_req, res) => {
        try {
            const config = await getHelpCenterObservabilityConfig();
            return res.json({
                ok: true,
                data: buildPublicHelpCenterObservabilityConfig(config),
            });
        } catch (error) {
            return res.status(500).json({
                ok: false,
                error: error.message,
                code: 'help_center_internal_error',
            });
        }
    });

    app.post('/api/help-center/events/batch', authRequired, async (req, res) => {
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            if (!Array.isArray(body.events)) {
                return res.status(400).json({
                    ok: false,
                    error: '帮助中心埋点 payload 不合法',
                    code: 'help_center_invalid_payload',
                });
            }

            const data = await eventService.acceptEventBatch({
                currentUser: req.currentUser,
                payload: body,
            });
            return res.json({ ok: true, data });
        } catch {
            return res.json({
                ok: true,
                data: {
                    accepted: 0,
                    ignored: Array.isArray(req.body?.events) ? req.body.events.length : 0,
                    failed: true,
                },
            });
        }
    });

    app.get('/api/settings/help-center-observability', authRequired, async (req, res) => {
        try {
            if (req.currentUser?.role !== 'admin') {
                return res.status(403).json({
                    ok: false,
                    error: '仅管理员可查看帮助中心可观测性配置',
                    code: 'help_center_forbidden',
                });
            }

            return res.json({
                ok: true,
                data: await getHelpCenterObservabilityConfig(),
            });
        } catch (error) {
            return res.status(500).json({
                ok: false,
                error: error.message,
                code: 'help_center_internal_error',
            });
        }
    });

    app.post('/api/settings/help-center-observability', authRequired, async (req, res) => {
        try {
            if (req.currentUser?.role !== 'admin') {
                return res.status(403).json({
                    ok: false,
                    error: '仅管理员可修改帮助中心可观测性配置',
                    code: 'help_center_forbidden',
                });
            }

            const validation = validateHelpCenterObservabilityConfig(req.body || {});
            if (!validation.valid) {
                return res.status(400).json({
                    ok: false,
                    error: '帮助中心可观测性配置校验失败',
                    errors: validation.errors,
                    code: 'help_center_invalid_payload',
                });
            }

            const data = await setHelpCenterObservabilityConfig(validation.coerced || {});
            return res.json({ ok: true, data });
        } catch (error) {
            return res.status(500).json({
                ok: false,
                error: error.message,
                code: 'help_center_internal_error',
            });
        }
    });
}

module.exports = {
    registerHelpCenterObservabilityRoutes,
};
