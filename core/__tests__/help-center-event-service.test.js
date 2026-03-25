const test = require('node:test');
const assert = require('node:assert/strict');

const mysqlDbModulePath = require.resolve('../src/services/mysql-db');
const systemSettingsModulePath = require.resolve('../src/services/system-settings');
const serviceModulePath = require.resolve('../src/services/help-center-event-service');

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

test('help center event service ignores telemetry batches when feature is disabled', async () => {
    const restoreMysql = mockModule(mysqlDbModulePath, {
        getPool() {
            throw new Error('getPool should not be called when telemetry is disabled');
        },
    });
    const restoreSystemSettings = mockModule(systemSettingsModulePath, {
        SYSTEM_SETTING_KEYS: {
            HELP_CENTER_OBSERVABILITY_CONFIG: 'help_center_observability_config',
        },
        async getSystemSetting() {
            return {
                telemetryEnabled: false,
                feedbackEnabled: false,
                jumpTracingEnabled: false,
                telemetrySamplingRate: 0,
                batchSize: 20,
                flushIntervalMs: 15000,
                retentionDays: 90,
            };
        },
        async setSystemSetting() {},
    });

    try {
        delete require.cache[serviceModulePath];
        const { createHelpCenterEventService } = require(serviceModulePath);
        const service = createHelpCenterEventService();

        const result = await service.acceptEventBatch({
            currentUser: { username: 'tester', role: 'user' },
            payload: {
                events: [{ eventNo: 'evt-1', eventType: 'article_open', articleId: 'quick-start' }],
            },
        });

        assert.deepEqual(result, {
            accepted: 0,
            ignored: 1,
            disabled: true,
        });
    } finally {
        delete require.cache[serviceModulePath];
        restoreMysql();
        restoreSystemSettings();
    }
});

test('help center event service stores sanitized events and appends daily aggregates when enabled', async () => {
    const calls = [];
    const restoreMysql = mockModule(mysqlDbModulePath, {
        getPool() {
            return {
                async execute(sql, params) {
                    calls.push({ sql, params });
                    return [{ affectedRows: 1, insertId: 1 }];
                },
            };
        },
    });
    const restoreSystemSettings = mockModule(systemSettingsModulePath, {
        SYSTEM_SETTING_KEYS: {
            HELP_CENTER_OBSERVABILITY_CONFIG: 'help_center_observability_config',
        },
        async getSystemSetting() {
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
        async setSystemSetting() {},
    });

    try {
        delete require.cache[serviceModulePath];
        const { createHelpCenterEventService } = require(serviceModulePath);
        const service = createHelpCenterEventService();

        const result = await service.acceptEventBatch({
            currentUser: { id: 7, username: 'admin', role: 'admin' },
            payload: {
                events: [
                    {
                        eventNo: 'evt-1',
                        eventType: 'context_help_open',
                        articleId: 'quick-start',
                        articleTitle: '快速上手',
                        articleCategory: '快速开始',
                        sectionId: 'start',
                        sourcePage: 'settings',
                        sourceRoute: '/settings',
                        sourceContext: 'context_help_button',
                        result: 'success',
                        latencyMs: 88,
                        meta: {
                            searchKeyword: '快速上手',
                            ignoredObject: { nested: 'value' },
                        },
                    },
                    {
                        eventNo: '',
                        eventType: 'article_open',
                    },
                ],
            },
        });

        assert.deepEqual(result, {
            accepted: 1,
            ignored: 1,
        });
        assert.equal(calls.length, 2);
        assert.match(calls[0].sql, /INSERT INTO help_center_events/);
        assert.equal(calls[0].params[0], 'evt-1');
        assert.equal(calls[0].params[4], 7);
        assert.equal(calls[0].params[5], 'admin');
        assert.equal(calls[0].params[6], 'admin');
        assert.equal(calls[0].params[8], '快速上手');
        assert.equal(calls[0].params[19], '');
        assert.equal(calls[0].params[20], 88);
        assert.equal(calls[0].params[21], JSON.stringify({
            searchKeyword: '快速上手',
            ignoredObject: { nested: 'value' },
        }));
        assert.match(calls[1].sql, /INSERT INTO help_center_event_daily/);
        assert.equal(calls[1].params[1], 'context_help_open');
        assert.equal(calls[1].params[2], 'quick-start');
        assert.equal(calls[1].params[7], 1);
    } finally {
        delete require.cache[serviceModulePath];
        restoreMysql();
        restoreSystemSettings();
    }
});
