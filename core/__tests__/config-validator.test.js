const test = require('node:test');
const assert = require('node:assert/strict');

const { validateSettings } = require('../src/services/config-validator');

test('validateSettings accepts unlimited and extended QQ high-risk window durations', () => {
    const unlimited = validateSettings({
        qqHighRiskWindow: {
            durationMinutes: 0,
        },
    });
    assert.equal(unlimited.valid, true);
    assert.equal(unlimited.coerced.qqHighRiskWindow.durationMinutes, 0);

    const extended = validateSettings({
        qqHighRiskWindow: {
            durationMinutes: 43200,
        },
    });
    assert.equal(extended.valid, true);
    assert.equal(extended.coerced.qqHighRiskWindow.durationMinutes, 43200);

    const tooShort = validateSettings({
        qqHighRiskWindow: {
            durationMinutes: 4,
        },
    });
    assert.equal(tooShort.valid, false);
    assert.match(tooShort.errors.join('\n'), /QQ 高风险自动回退时长\(分钟\)/);
});
