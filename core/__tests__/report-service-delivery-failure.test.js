const test = require('node:test');
const assert = require('node:assert/strict');

const reportServiceModulePath = require.resolve('../src/services/report-service');
const databaseModulePath = require.resolve('../src/services/database');
const loggerModulePath = require.resolve('../src/services/logger');

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

function createSchedulerMock() {
    return {
        setTimeoutTask() {
            return null;
        },
        setIntervalTask() {
            return null;
        },
        clearAll() {
            return null;
        },
    };
}

test('sendTestReport records failure when delivery sender throws', async () => {
    const insertedLogs = [];
    const restoreDatabase = mockModule(databaseModulePath, {
        async insertReportLog(payload) {
            insertedLogs.push(payload);
            return { ok: true };
        },
        async pruneReportLogs() {
            return { ok: true, affectedRows: 0 };
        },
    });
    const restoreLogger = mockModule(loggerModulePath, {
        createModuleLogger() {
            return {
                info() {},
                warn() {},
                error() {},
            };
        },
    });

    try {
        delete require.cache[reportServiceModulePath];
        const { createReportService } = require(reportServiceModulePath);
        const scheduler = createSchedulerMock();

        const service = createReportService({
            store: {
                getReportConfig(accountId) {
                    if (!accountId) return null;
                    return {
                        enabled: true,
                        channel: 'email',
                        smtpHost: 'smtp.example.com',
                        smtpPort: 465,
                        smtpSecure: true,
                        smtpUser: 'bot@example.com',
                        smtpPass: 'secret',
                        emailFrom: 'bot@example.com',
                        emailTo: 'user@example.com',
                        title: '经营汇报',
                    };
                },
                getReportState() {
                    return {};
                },
            },
            dataProvider: {
                async resolveAccountId(accountRef) {
                    return String(accountRef);
                },
                getStatus() {
                    return {
                        accountId: '1009',
                        accountName: '离线账号',
                        connection: {
                            connected: false,
                        },
                        status: {
                            name: '离线账号',
                            platform: 'qq',
                            level: 0,
                            gold: 0,
                            exp: 0,
                        },
                        operations: {},
                    };
                },
            },
            getAccounts() {
                return [{ id: '1009', name: '离线账号', platform: 'qq' }];
            },
            async sendPushooMessage() {
                throw new Error('SMTP 配置无效');
            },
            scheduler,
        });

        const result = await service.sendTestReport('1009');

        assert.equal(result.ok, false);
        assert.equal(result.error, 'SMTP 配置无效');
        assert.equal(insertedLogs.length, 1);
        assert.equal(insertedLogs[0].ok, false);
        assert.equal(insertedLogs[0].errorMessage, 'SMTP 配置无效');
    } finally {
        delete require.cache[reportServiceModulePath];
        restoreDatabase();
        restoreLogger();
    }
});
