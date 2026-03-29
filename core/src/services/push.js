/**
 * 推送接口封装（基于 pushoo）
 */

const pushoo = require('pushoo').default;
const { sendEmailMessage } = require('./smtp-mailer');

const SUCCESS_TEXTS = new Set(['ok', 'success', 'successful', 'sent', 'queued', 'accepted', 'done', 'delivered', 'true']);
const FAILURE_TEXTS = new Set(['error', 'failed', 'fail', 'false', 'denied', 'forbidden', 'invalid']);

function assertRequiredText(name, value) {
    const text = String(value || '').trim();
    if (!text) {
        throw new Error(`${name} 不能为空`);
    }
    return text;
}

function hasOwn(source, key) {
    return !!source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, key);
}

function findField(source, keys = []) {
    if (!source || typeof source !== 'object') return null;
    for (const key of keys) {
        if (!hasOwn(source, key)) continue;
        const value = source[key];
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' && !value.trim()) continue;
        return { key, value };
    }
    return null;
}

function toText(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Error) return String(value.message || '').trim();
    return '';
}

function toInteger(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    const text = toText(value);
    if (!/^-?\d+$/.test(text)) return null;
    return Number.parseInt(text, 10);
}

function isSuccessLikeText(value) {
    return SUCCESS_TEXTS.has(toText(value).toLowerCase());
}

function isFailureLikeText(value) {
    return FAILURE_TEXTS.has(toText(value).toLowerCase());
}

function classifyCodeField(field) {
    const text = toText(field && field.value);
    if (!text) return { success: false, failure: false, code: '' };

    const key = String(field && field.key || '').trim();
    const numeric = toInteger(text);

    if (key === 'errcode' || key === 'errCode' || key === 'errno') {
        return {
            success: text === '0' || isSuccessLikeText(text),
            failure: text !== '0' && !isSuccessLikeText(text),
            code: text,
        };
    }

    if (numeric !== null) {
        return {
            success: numeric === 0 || (numeric >= 200 && numeric < 300),
            failure: numeric < 0 || numeric >= 400,
            code: text,
        };
    }

    return {
        success: isSuccessLikeText(text),
        failure: isFailureLikeText(text),
        code: text,
    };
}

function classifyStatusField(field) {
    const text = toText(field && field.value);
    if (!text) return { success: false, failure: false, code: '' };

    const numeric = toInteger(text);
    if (numeric !== null) {
        return {
            success: numeric >= 200 && numeric < 300,
            failure: numeric < 0 || numeric >= 400,
            code: text,
        };
    }

    return {
        success: isSuccessLikeText(text),
        failure: isFailureLikeText(text),
        code: text,
    };
}

function extractErrorMessage(error) {
    if (!error) return '';
    if (typeof error === 'string') return error.trim();

    const responseData = error && error.response && error.response.data;
    const responseField = findField(responseData, ['msg', 'message', 'errmsg', 'errMsg', 'errorMessage', 'description']);
    if (responseField) return toText(responseField.value);
    if (typeof responseData === 'string' && responseData.trim()) return responseData.trim();

    if (typeof error.message === 'string' && error.message.trim()) {
        return error.message.trim();
    }

    return '';
}

function buildHttpFailureMessage(status, rawBody) {
    const body = String(rawBody || '').trim();
    if (!body) return `http_${status}`;
    const compact = body.replace(/\s+/g, ' ').slice(0, 180);
    return `http_${status}: ${compact}`;
}

function normalizePushooResult(result) {
    const raw = (result && typeof result === 'object') ? result : { data: result };
    const rawData = (raw && raw.data && typeof raw.data === 'object') ? raw.data : null;
    const errorResponseData = raw && raw.error && raw.error.response && typeof raw.error.response.data === 'object'
        ? raw.error.response.data
        : null;

    const explicitBoolean = (() => {
        for (const source of [raw, rawData, errorResponseData]) {
            if (!source || typeof source !== 'object') continue;
            if (typeof source.ok === 'boolean') return source.ok;
            if (typeof source.success === 'boolean') return source.success;
        }
        return null;
    })();

    const codeField = [raw, rawData, errorResponseData]
        .map(source => findField(source, ['errcode', 'errCode', 'errno', 'code', 'statusCode', 'status_code']))
        .find(Boolean) || null;
    const statusField = [raw, rawData, errorResponseData]
        .map(source => findField(source, ['status', 'state', 'result']))
        .find(Boolean) || null;

    const codeState = classifyCodeField(codeField);
    const statusState = classifyStatusField(statusField);

    let ok;
    if (explicitBoolean !== null) {
        ok = explicitBoolean;
    } else if (raw && raw.error) {
        ok = false;
    } else if (codeState.failure || statusState.failure) {
        ok = false;
    } else if (codeState.success || statusState.success) {
        ok = true;
    } else {
        ok = true;
    }

    const messageCandidates = [
        findField(raw, ['msg', 'message', 'errmsg', 'errMsg', 'errorMessage', 'description']),
        findField(rawData, ['msg', 'message', 'errmsg', 'errMsg', 'errorMessage', 'description']),
        findField(errorResponseData, ['msg', 'message', 'errmsg', 'errMsg', 'errorMessage', 'description']),
    ]
        .filter(Boolean)
        .map(field => toText(field.value))
        .filter(Boolean);

    if (typeof raw.data === 'string' && raw.data.trim()) {
        messageCandidates.push(raw.data.trim());
    }
    if (raw && raw.error) {
        const nestedErrorMessage = extractErrorMessage(raw.error);
        if (nestedErrorMessage) messageCandidates.push(nestedErrorMessage);
    }

    let message = messageCandidates[0] || '';
    const code = codeState.code || statusState.code || (ok ? 'ok' : 'error');

    if (!ok) {
        if (!message || isSuccessLikeText(message)) {
            if (code && !isSuccessLikeText(code)) {
                message = `渠道返回异常状态 (${code})`;
            } else {
                message = '发送失败';
            }
        }
    } else if (!message) {
        message = 'ok';
    }

    return {
        ok,
        code,
        msg: message,
        raw,
    };
}

/**
 * 发送推送
 * @param {object} payload
 * @param {string} payload.channel 必填 推送渠道（pushoo 平台名，如 webhook，或 email）
 * @param {string} [payload.endpoint] webhook 接口地址（channel=webhook 时使用）
 * @param {string} payload.token 必填 推送 token
 * @param {string} payload.title 必填 推送标题
 * @param {string} payload.content 必填 推送内容
 * @param {string} [payload.html] HTML 内容（channel=email 时优先显示，content 作为纯文本兜底）
 * @param {string} [payload.smtpHost] SMTP 服务器地址（channel=email 时使用）
 * @param {number|string} [payload.smtpPort] SMTP 端口（channel=email 时使用）
 * @param {boolean|string} [payload.smtpSecure] SMTP 是否直连 TLS（channel=email 时使用）
 * @param {string} [payload.smtpUser] SMTP 用户名（channel=email 时使用）
 * @param {string} [payload.smtpPass] SMTP 密码（channel=email 时使用）
 * @param {string} [payload.emailFrom] 发件邮箱（channel=email 时使用）
 * @param {string} [payload.emailTo] 收件邮箱，支持多个（channel=email 时使用）
 * @returns {Promise<{ok: boolean, code: string, msg: string, raw: any}>} 推送结果
 */
async function sendPushooMessage(payload = {}) {
    try {
        const channel = assertRequiredText('channel', payload.channel);
        const title = assertRequiredText('title', payload.title);
        const content = assertRequiredText('content', payload.content);

        if (channel === 'email') {
            return await sendEmailMessage({
                title,
                content,
                html: payload.html,
                smtpHost: payload.smtpHost,
                smtpPort: payload.smtpPort,
                smtpSecure: payload.smtpSecure,
                smtpUser: payload.smtpUser,
                smtpPass: payload.smtpPass,
                emailFrom: payload.emailFrom,
                emailTo: payload.emailTo,
            });
        }

        const endpoint = String(payload.endpoint || '').trim();
        const rawToken = String(payload.token || '').trim();
        const token = channel === 'webhook' ? rawToken : assertRequiredText('token', rawToken);

        if (channel === 'webhook' && payload.webhookBody && typeof payload.webhookBody === 'object') {
            const url = assertRequiredText('endpoint', endpoint);
            const headers = { 'content-type': 'application/json' };
            if (token) {
                headers.authorization = `Bearer ${token}`;
                headers['x-token'] = token;
            }
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload.webhookBody),
            });
            let rawBody = '';
            try {
                rawBody = await response.text();
            } catch { }
            return {
                ok: response.ok,
                code: String(response.status || (response.ok ? 'ok' : 'error')),
                msg: response.ok ? 'ok' : buildHttpFailureMessage(response.status, rawBody),
                raw: {
                    status: response.status,
                    statusText: response.statusText,
                    body: rawBody,
                },
            };
        }

        const options = {};
        if (channel === 'webhook') {
            const url = assertRequiredText('endpoint', endpoint);
            options.webhook = { url, method: 'POST' };
        }

        const request = { title, content };
        if (token) request.token = token;
        if (channel === 'webhook') request.options = options;

        const result = await pushoo(channel, request);
        return normalizePushooResult(result);
    } catch (error) {
        const message = extractErrorMessage(error) || '发送失败';
        return {
            ok: false,
            code: 'error',
            msg: message,
            raw: { error: message },
        };
    }
}

module.exports = {
    sendPushooMessage,
    normalizePushooResult,
};
