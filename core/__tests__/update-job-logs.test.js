const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildResultSignature,
    mapJobLogRow,
    summarizeUpdateJobBatch,
} = require('../src/services/system-update-jobs');

test('mapJobLogRow normalizes structured job log rows', () => {
    const row = mapJobLogRow({
        id: 9,
        job_id: 7,
        phase: 'pull_image',
        level: 'warn',
        message: 'pull retry',
        payload_json: JSON.stringify({ attempt: 2 }),
        created_at: '2026-03-25T12:00:00.000Z',
    });

    assert.equal(row.id, 9);
    assert.equal(row.jobId, 7);
    assert.equal(row.phase, 'pull_image');
    assert.equal(row.level, 'warn');
    assert.deepEqual(row.payload, { attempt: 2 });
});

test('buildResultSignature changes when execution payload changes', () => {
    const first = buildResultSignature({
        status: 'running',
        executionPhase: 'pull_image',
        summaryMessage: 'pull started',
        result: { attempt: 1 },
    });
    const second = buildResultSignature({
        status: 'running',
        executionPhase: 'pull_image',
        summaryMessage: 'pull started',
        result: { attempt: 2 },
    });

    assert.notEqual(first, second);
});

test('summarizeUpdateJobBatch aggregates per-node phase and failure categories', () => {
    const summary = summarizeUpdateJobBatch([
        {
            id: 1,
            jobKey: 'upd_1',
            batchKey: 'upd_batch_1',
            scope: 'cluster',
            strategy: 'rolling',
            status: 'running',
            sourceVersion: 'v4.5.18',
            targetVersion: 'v4.5.19',
            targetAgentId: 'agent-a',
            claimAgentId: 'agent-a',
            drainNodeIds: ['worker-a'],
            progressPercent: 60,
            summaryMessage: 'agent-a running',
            executionPhase: 'apply_update',
            payload: { options: { managedNodeIds: ['worker-a'] } },
            result: null,
            errorMessage: '',
            createdAt: 100,
            updatedAt: 140,
        },
        {
            id: 2,
            jobKey: 'upd_2',
            batchKey: 'upd_batch_1',
            scope: 'cluster',
            strategy: 'rolling',
            status: 'failed',
            sourceVersion: 'v4.5.18',
            targetVersion: 'v4.5.19',
            targetAgentId: 'agent-b',
            claimAgentId: 'agent-b',
            drainNodeIds: ['worker-b'],
            progressPercent: 25,
            summaryMessage: 'agent-b failed',
            executionPhase: 'verify',
            payload: { options: { managedNodeIds: ['worker-b'] } },
            result: { failureCategory: 'verification_failed' },
            errorMessage: 'network',
            createdAt: 110,
            updatedAt: 150,
        },
    ]);

    assert.equal(summary.perNodePhase['worker-a'], 'apply_update');
    assert.equal(summary.perNodePhase['worker-b'], 'verify');
    assert.equal(summary.failedCategories.verification_failed, 1);
    assert.equal(summary.runningNodeCount >= 1, true);
    assert.equal(summary.failedNodeCount, 1);
});
