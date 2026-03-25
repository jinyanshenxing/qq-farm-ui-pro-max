const test = require('node:test');
const assert = require('node:assert/strict');

const { createSystemUpdatePreflightService } = require('../src/services/system-update-preflight');

test('system update preflight reports disk blockers and relogin risk', async () => {
    const service = createSystemUpdatePreflightService({
        fsRef: {
            statfs: async () => ({
                bsize: 4096,
                bavail: 1024,
                blocks: 4096,
            }),
        },
        healthProbeService: {
            getDependenciesSnapshot: async () => ({
                ok: true,
                checkedAt: Date.now(),
                dependencies: {
                    mysql: { ok: true, status: 'up', error: '' },
                    redis: { ok: true, status: 'up', error: '' },
                },
            }),
        },
    });

    const result = await service.runPreflight({
        targetVersion: 'v4.5.19',
        scope: 'worker',
        strategy: 'rolling',
        targetAgentIds: ['agent-a'],
        runtime: {
            agentSummary: [
                {
                    nodeId: 'agent-a',
                    status: 'claimed',
                    updatedAt: Date.now(),
                    managedNodeIds: ['worker-a'],
                },
            ],
        },
        accountsSnapshot: {
            accounts: [
                {
                    id: '1',
                    running: true,
                    code: 'login-code',
                    authTicket: '',
                },
            ],
        },
        preflightOverride: {
            minDiskFreeBytes: 32 * 1024 * 1024,
        },
    });

    assert.equal(result.ok, false);
    assert.equal(result.checks.some(item => item.key === 'disk_space' && item.blocker), true);
    assert.equal(result.checks.some(item => item.key === 'relogin_risk' && item.blocker), true);
});

test('system update preflight can downgrade relogin risk to warning via override', async () => {
    const service = createSystemUpdatePreflightService({
        fsRef: {
            statfs: async () => ({
                bsize: 4096,
                bavail: 1024 * 1024,
                blocks: 4096 * 1024,
            }),
        },
        healthProbeService: {
            getDependenciesSnapshot: async () => ({
                ok: true,
                checkedAt: Date.now(),
                dependencies: {
                    mysql: { ok: true, status: 'up', error: '' },
                    redis: { ok: true, status: 'up', error: '' },
                },
            }),
        },
    });

    const result = await service.runPreflight({
        targetVersion: 'v4.5.19',
        scope: 'app',
        strategy: 'rolling',
        runtime: { agentSummary: [] },
        accountsSnapshot: {
            accounts: [
                {
                    id: '1',
                    running: true,
                    code: 'login-code',
                    authTicket: '',
                },
            ],
        },
        preflightOverride: {
            allowReloginRisk: true,
        },
    });

    assert.equal(result.ok, true);
    const reloginCheck = result.checks.find(item => item.key === 'relogin_risk');
    assert.equal(reloginCheck.blocker, false);
    assert.equal(reloginCheck.warning, true);
});
