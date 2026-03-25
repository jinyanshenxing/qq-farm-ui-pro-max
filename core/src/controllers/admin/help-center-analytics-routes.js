const { createHelpCenterAnalyticsService } = require('../../services/help-center-analytics-service');

function registerHelpCenterAnalyticsRoutes({
    app,
    authRequired,
    adminLogger,
    getPool,
}) {
    const analyticsService = createHelpCenterAnalyticsService({
        getPool,
        logger: adminLogger,
    });

    function ensureAdmin(req, res) {
        if (req.currentUser?.role === 'admin') {
            return true;
        }
        res.status(403).json({
            ok: false,
            error: '仅管理员可查看帮助中心统计',
            code: 'help_center_forbidden',
        });
        return false;
    }

    app.get('/api/help-center/analytics/overview', authRequired, async (req, res) => {
        try {
            if (!ensureAdmin(req, res)) return;
            return res.json({ ok: true, data: await analyticsService.getOverview(req.query || {}) });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message, code: 'help_center_internal_error' });
        }
    });

    app.get('/api/help-center/analytics/articles', authRequired, async (req, res) => {
        try {
            if (!ensureAdmin(req, res)) return;
            return res.json({ ok: true, data: await analyticsService.listArticleMetrics(req.query || {}) });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message, code: 'help_center_internal_error' });
        }
    });

    app.get('/api/help-center/analytics/entry-pages', authRequired, async (req, res) => {
        try {
            if (!ensureAdmin(req, res)) return;
            return res.json({ ok: true, data: await analyticsService.listEntryPages(req.query || {}) });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message, code: 'help_center_internal_error' });
        }
    });

    app.get('/api/help-center/analytics/search-keywords', authRequired, async (req, res) => {
        try {
            if (!ensureAdmin(req, res)) return;
            return res.json({ ok: true, data: await analyticsService.listSearchKeywords(req.query || {}) });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message, code: 'help_center_internal_error' });
        }
    });

    app.get('/api/help-center/analytics/jump-failures', authRequired, async (req, res) => {
        try {
            if (!ensureAdmin(req, res)) return;
            return res.json({ ok: true, data: await analyticsService.listJumpFailures(req.query || {}) });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message, code: 'help_center_internal_error' });
        }
    });
}

module.exports = {
    registerHelpCenterAnalyticsRoutes,
};
