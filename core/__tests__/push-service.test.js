const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const pushModulePath = require.resolve('../src/services/push');

function loadPushModule(mockPushoo) {
    delete require.cache[pushModulePath];
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'pushoo') {
            return { default: mockPushoo };
        }
        return originalLoad.apply(this, arguments);
    };

    try {
        return require(pushModulePath);
    } finally {
        Module._load = originalLoad;
    }
}

test('sendPushooMessage treats HTTP-like 2xx code as success', async () => {
    const { sendPushooMessage } = loadPushModule(async () => ({ code: 200, msg: 'ok' }));

    const result = await sendPushooMessage({
        channel: 'webhook',
        endpoint: 'https://example.com/hook',
        title: '经营汇报',
        content: '测试内容',
    });

    assert.equal(result.ok, true);
    assert.equal(result.code, '200');
    assert.equal(result.msg, 'ok');
});

test('sendPushooMessage rewrites misleading success-like errmsg on failure', async () => {
    const { sendPushooMessage } = loadPushModule(async () => ({ errcode: 40001, errmsg: 'ok' }));

    const result = await sendPushooMessage({
        channel: 'webhook',
        endpoint: 'https://example.com/hook',
        title: '经营汇报',
        content: '测试内容',
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, '40001');
    assert.match(result.msg, /40001/);
});

test('sendPushooMessage converts invalid email config errors into failure result', async () => {
    const { sendPushooMessage } = loadPushModule(async () => ({ code: 200, msg: 'ok' }));

    const result = await sendPushooMessage({
        channel: 'email',
        title: '经营汇报',
        content: '测试内容',
        smtpHost: 'smtp.qq.com',
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: '123456@qq.com',
        smtpPass: 'auth-code',
        emailFrom: '机器人 <123456@qq.com>',
        emailTo: 'target@example.com',
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'error');
    assert.match(result.msg, /emailFrom 格式无效/);
});
