const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDrainCutoverReadiness } = require('../src/services/account-migration');

test('buildDrainCutoverReadiness exposes blocking nodes and affected accounts', () => {
    const readiness = buildDrainCutoverReadiness({
        accounts: [
            {
                id: '1',
                name: '账号 A',
                platform: 'wx',
                running: true,
                code: 'used-code',
                authTicket: '',
            },
            {
                id: '2',
                name: '账号 B',
                platform: 'qq',
                running: true,
                code: '',
                authTicket: 'auth-ticket',
            },
        ],
        clusterNodes: [
            {
                nodeId: 'worker-a',
                assignedAccountIds: ['1', '2'],
            },
        ],
        targetNodeIds: ['worker-a'],
    });

    assert.equal(readiness.targetedRunningAccountCount, 2);
    assert.equal(readiness.blockingNodes.length, 1);
    assert.equal(readiness.blockingNodes[0].nodeId, 'worker-a');
    assert.equal(readiness.affectedAccounts.length, 2);
    assert.equal(readiness.reloginRequiredAccounts.length, 1);
    assert.equal(readiness.estimatedDrainSeconds >= 30, true);
});
