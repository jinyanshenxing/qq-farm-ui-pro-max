const test = require('node:test');
const assert = require('node:assert/strict');

const { createDataProvider } = require('../src/runtime/data-provider');

test('getAccounts includes live wechat protection diagnostics for account ownership views', async () => {
    const provider = createDataProvider({
        workers: {
            'acc-1': {
                wsError: null,
                status: {
                    connection: { connected: true },
                    status: {
                        name: '微信账号甲',
                        level: 26,
                    },
                    effectiveMode: 'safe',
                    accountZone: 'wechat_zone',
                    collaborationEnabled: false,
                    degradeReason: '',
                    degradeReasonLabel: '',
                    protection: {
                        suspended: true,
                        suspendUntil: Date.now() + 5 * 60 * 1000,
                        suspendRemainSec: 300,
                        networkBreaker: {
                            state: '',
                            coolDownMs: 0,
                            cooldownRemainingSec: 0,
                            failures: 0,
                            threshold: 0,
                        },
                        wechat: {
                            enabled: true,
                            friendGuardActive: true,
                            friendGuardReason: 'self_only',
                            friendCooldownUntil: Date.now() + 2 * 60 * 1000,
                            friendCooldownRemainSec: 120,
                            syncAllUnsupportedUntil: 0,
                            failureCount: 3,
                            failureReason: 'self_only',
                            failureAt: Date.now(),
                            farmAutomationPaused: true,
                        },
                    },
                },
            },
        },
        globalLogs: [],
        accountLogs: [],
        store: {
            getConfigSnapshot: () => ({ accountMode: 'main', harvestDelay: { min: 0, max: 0 }, riskPromptEnabled: true }),
            resolveAccountZone: () => 'wechat_zone',
            getSuspendUntil: () => 0,
        },
        accountRepository: null,
        getAccounts: async () => ({
            accounts: [{
                id: 'acc-1',
                name: '微信账号甲',
                platform: 'wx_car',
                running: true,
                connected: false,
            }],
        }),
        callWorkerApi: async () => ({}),
        buildDefaultStatus: () => ({}),
        normalizeStatusForPanel: status => status,
        filterLogs: logs => logs,
        addAccountLog: () => {},
        nextConfigRevision: () => 1,
        broadcastConfigToWorkers: () => {},
        startWorker: async () => true,
        stopWorker: async () => true,
        restartWorker: async () => true,
    });

    const result = await provider.getAccounts();
    const account = result.accounts[0];

    assert.equal(account.connected, true);
    assert.equal(account.protection.wechat.enabled, true);
    assert.equal(account.protection.wechat.friendGuardActive, true);
    assert.equal(account.protection.wechat.friendGuardReason, 'self_only');
    assert.equal(account.protection.wechat.failureCount, 3);
    assert.equal(account.protection.wechat.farmAutomationPaused, true);
});
