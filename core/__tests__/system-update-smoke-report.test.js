const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    createSystemUpdateSmokeSummaryService,
    parseSystemUpdateSmokeSummary,
} = require('../src/services/system-update-smoke-report');

const SAMPLE_SUMMARY = `# 系统更新中心 Smoke 报告

- 检查时间：2026-03-25 21:30:00
- 基础地址：http://127.0.0.1:9527
- 认证方式：login cookie
- 目标版本：v4.5.34
- 目标范围：app
- 目标策略：rolling
- 目标代理：未指定
- 宿主机核验：/opt/qq-farm-current

## 统计

- 通过：6
- 提醒：1
- 失败：0

## 通过项

- 认证验证通过：admin / root
- 更新概览接口可用：当前 v4.5.34，最新 v4.5.34。

## 提醒项

- 更新预检返回阻断：阻断 1 项，提醒 0 项。

## 失败项

- 无

## 原始响应文件

- 04-system-update-overview.json
- 07-system-update-preflight.json
`;

test('parseSystemUpdateSmokeSummary extracts smoke metadata and status', () => {
    const parsed = parseSystemUpdateSmokeSummary(SAMPLE_SUMMARY, {
        reportDir: '/tmp/reports/system-update-smoke/20260325_213000',
        summaryPath: '/tmp/reports/system-update-smoke/20260325_213000/SUMMARY.md',
    });

    assert.equal(parsed.status, 'warning');
    assert.equal(parsed.passCount, 6);
    assert.equal(parsed.warnCount, 1);
    assert.equal(parsed.failCount, 0);
    assert.equal(parsed.baseUrl, 'http://127.0.0.1:9527');
    assert.equal(parsed.targetVersion, 'v4.5.34');
    assert.equal(parsed.targetScope, 'app');
    assert.equal(parsed.targetStrategy, 'rolling');
    assert.equal(parsed.targetAgents, '未指定');
    assert.equal(parsed.verifyTarget, '/opt/qq-farm-current');
    assert.equal(parsed.passItems[0], '认证验证通过：admin / root');
    assert.equal(parsed.warnItems[0], '更新预检返回阻断：阻断 1 项，提醒 0 项。');
    assert.deepEqual(parsed.failItems, []);
    assert.deepEqual(parsed.rawFiles, [
        '04-system-update-overview.json',
        '07-system-update-preflight.json',
    ]);
    assert.equal(parsed.reportDir, '/tmp/reports/system-update-smoke/20260325_213000');
    assert.equal(parsed.summaryPath, '/tmp/reports/system-update-smoke/20260325_213000/SUMMARY.md');
    assert.ok(parsed.checkedAt > 0);
});

test('system update smoke summary service picks latest summary from report root', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-update-smoke-test-'));
    const reportRoot = path.join(tempDir, 'reports/system-update-smoke');
    const olderDir = path.join(reportRoot, '20260324_120000');
    const latestDir = path.join(reportRoot, '20260325_213000');

    fs.mkdirSync(olderDir, { recursive: true });
    fs.mkdirSync(latestDir, { recursive: true });
    fs.writeFileSync(path.join(olderDir, 'SUMMARY.md'), SAMPLE_SUMMARY.replace('v4.5.34', 'v4.5.33'));
    fs.writeFileSync(path.join(latestDir, 'SUMMARY.md'), SAMPLE_SUMMARY);
    fs.utimesSync(path.join(olderDir, 'SUMMARY.md'), new Date('2026-03-24T12:00:00'), new Date('2026-03-24T12:00:00'));
    fs.utimesSync(path.join(latestDir, 'SUMMARY.md'), new Date('2026-03-25T21:30:00'), new Date('2026-03-25T21:30:00'));

    const service = createSystemUpdateSmokeSummaryService({
        projectRoot: tempDir,
        reportRoot,
    });

    const latest = service.getLatestSummary();
    assert.ok(latest);
    assert.equal(latest.targetVersion, 'v4.5.34');
    assert.equal(latest.summaryPath, path.join(latestDir, 'SUMMARY.md'));
    assert.equal(latest.reportDir, latestDir);

    fs.rmSync(tempDir, { recursive: true, force: true });
});
