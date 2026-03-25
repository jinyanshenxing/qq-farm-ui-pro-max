const { createHelpCenterFeedbackService } = require('../../services/help-center-feedback-service');

function registerHelpCenterFeedbackRoutes({
    app,
    authRequired,
    adminLogger,
    getPool,
    adminOperationLogService,
}) {
    const feedbackService = createHelpCenterFeedbackService({
        getPool,
        logger: adminLogger,
        adminOperationLogService,
    });

    function ensureAdmin(req, res) {
        if (req.currentUser?.role === 'admin') {
            return true;
        }
        res.status(403).json({
            ok: false,
            error: '仅管理员可管理帮助中心反馈',
            code: 'help_center_forbidden',
        });
        return false;
    }

    app.post('/api/help-center/feedback', authRequired, async (req, res) => {
        try {
            const data = await feedbackService.submitFeedback({
                currentUser: req.currentUser,
                payload: req.body || {},
            });
            return res.json({ ok: true, data });
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                ok: false,
                error: error.message,
                code: error.code || 'help_center_internal_error',
            });
        }
    });

    app.get('/api/help-center/feedback', authRequired, async (req, res) => {
        try {
            if (!ensureAdmin(req, res)) return;
            return res.json({ ok: true, data: await feedbackService.listFeedback(req.query || {}) });
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                ok: false,
                error: error.message,
                code: error.code || 'help_center_internal_error',
            });
        }
    });

    app.get('/api/help-center/feedback/:id', authRequired, async (req, res) => {
        try {
            if (!ensureAdmin(req, res)) return;
            const item = await feedbackService.getFeedbackById(req.params.id);
            if (!item) {
                return res.status(404).json({
                    ok: false,
                    error: '帮助中心反馈不存在',
                    code: 'help_center_not_found',
                });
            }
            return res.json({ ok: true, data: item });
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                ok: false,
                error: error.message,
                code: error.code || 'help_center_internal_error',
            });
        }
    });

    app.patch('/api/help-center/feedback/:id', authRequired, async (req, res) => {
        try {
            if (!ensureAdmin(req, res)) return;
            return res.json({
                ok: true,
                data: await feedbackService.updateFeedback(req.params.id, req.body || {}, req.currentUser),
            });
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                ok: false,
                error: error.message,
                code: error.code || 'help_center_internal_error',
            });
        }
    });

    app.post('/api/help-center/feedback/:id/assign', authRequired, async (req, res) => {
        try {
            if (!ensureAdmin(req, res)) return;
            return res.json({
                ok: true,
                data: await feedbackService.assignFeedback(req.params.id, req.body || {}, req.currentUser),
            });
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                ok: false,
                error: error.message,
                code: error.code || 'help_center_internal_error',
            });
        }
    });

    app.post('/api/help-center/feedback/:id/link-bug-report', authRequired, async (req, res) => {
        try {
            if (!ensureAdmin(req, res)) return;
            return res.json({
                ok: true,
                data: await feedbackService.linkBugReport(req.params.id, req.body || {}, req.currentUser),
            });
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                ok: false,
                error: error.message,
                code: error.code || 'help_center_internal_error',
            });
        }
    });
}

module.exports = {
    registerHelpCenterFeedbackRoutes,
};
