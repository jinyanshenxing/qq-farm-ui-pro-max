const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('../scripts/update-agent-bridge');

test('update agent bridge parseArgs keeps structured phase arguments', () => {
    const args = parseArgs([
        'set-job-status',
        '--job-id', '9',
        '--status', 'running',
        '--phase', 'verify',
        '--summary', 'Running verify-stack.sh',
        '--verification-json', '{"ok":true}',
        '--rollback-payload-json', '{"previousVersion":"v4.5.18"}',
        '--failure-category', 'verification_failed',
    ]);

    assert.deepEqual(args._, ['set-job-status']);
    assert.equal(args['job-id'], '9');
    assert.equal(args.status, 'running');
    assert.equal(args.phase, 'verify');
    assert.equal(args['verification-json'], '{"ok":true}');
    assert.equal(args['rollback-payload-json'], '{"previousVersion":"v4.5.18"}');
    assert.equal(args['failure-category'], 'verification_failed');
});
