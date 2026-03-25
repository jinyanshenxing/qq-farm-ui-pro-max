const fs = require('node:fs');
const path = require('node:path');

function toTimestamp(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    const parsed = Date.parse(text.replace(' ', 'T'));
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseLabelValue(content) {
    const matched = String(content || '').match(/^([^：:]+)[：:]\s*(.*)$/);
    if (!matched) {
        return {
            label: '',
            value: '',
        };
    }
    return {
        label: String(matched[1] || '').trim(),
        value: String(matched[2] || '').trim(),
    };
}

function parseSectionItems(lines, heading) {
    const items = [];
    let active = false;

    for (const rawLine of lines) {
        const line = String(rawLine || '').trim();
        if (!line) continue;
        if (/^##\s+/.test(line)) {
            active = line === `## ${heading}`;
            continue;
        }
        if (!active || !line.startsWith('- ')) {
            continue;
        }
        const item = line.slice(2).trim();
        if (item && item !== '无') {
            items.push(item);
        }
    }

    return items;
}

function parseSummaryStats(lines) {
    const stats = {
        passCount: 0,
        warnCount: 0,
        failCount: 0,
    };
    let active = false;

    for (const rawLine of lines) {
        const line = String(rawLine || '').trim();
        if (!line) continue;
        if (/^##\s+/.test(line)) {
            active = line === '## 统计';
            continue;
        }
        if (!active || !line.startsWith('- ')) {
            continue;
        }
        const content = line.slice(2).trim();
        const { label, value: rawValue } = parseLabelValue(content);
        const value = Math.max(0, Number.parseInt(rawValue, 10) || 0);
        switch (label) {
            case '通过':
                stats.passCount = value;
                break;
            case '提醒':
                stats.warnCount = value;
                break;
            case '失败':
                stats.failCount = value;
                break;
            default:
                break;
        }
    }

    return stats;
}

function parseSummaryMeta(lines) {
    const meta = {};
    let active = true;

    for (const rawLine of lines) {
        const line = String(rawLine || '').trim();
        if (!line) continue;
        if (/^##\s+/.test(line)) {
            active = false;
            continue;
        }
        if (!active || !line.startsWith('- ')) {
            continue;
        }
        const content = line.slice(2).trim();
        const { label, value: rawValue } = parseLabelValue(content);
        const key = label;
        if (!key) continue;
        meta[key] = rawValue;
    }

    return meta;
}

function parseSystemUpdateSmokeSummary(markdown, options = {}) {
    const lines = String(markdown || '')
        .replace(/\r\n/g, '\n')
        .split('\n');
    const meta = parseSummaryMeta(lines);
    const stats = parseSummaryStats(lines);
    const passItems = parseSectionItems(lines, '通过项');
    const warnItems = parseSectionItems(lines, '提醒项');
    const failItems = parseSectionItems(lines, '失败项');
    const rawFiles = parseSectionItems(lines, '原始响应文件');
    const checkedAt = toTimestamp(meta['检查时间']);
    const status = stats.failCount > 0
        ? 'failed'
        : (stats.warnCount > 0 ? 'warning' : (stats.passCount > 0 ? 'passed' : 'unknown'));

    return {
        status,
        checkedAt,
        checkedAtLabel: String(meta['检查时间'] || '').trim(),
        baseUrl: String(meta['基础地址'] || '').trim(),
        authMode: String(meta['认证方式'] || '').trim(),
        targetVersion: String(meta['目标版本'] || '').trim(),
        targetScope: String(meta['目标范围'] || '').trim(),
        targetStrategy: String(meta['目标策略'] || '').trim(),
        targetAgents: String(meta['目标代理'] || '').trim(),
        verifyTarget: String(meta['宿主机核验'] || '').trim(),
        passCount: stats.passCount,
        warnCount: stats.warnCount,
        failCount: stats.failCount,
        passItems,
        warnItems,
        failItems,
        rawFiles,
        reportDir: String(options.reportDir || '').trim(),
        summaryPath: String(options.summaryPath || '').trim(),
    };
}

function getCandidateRoots({ pathRef, projectRoot, processRef, reportRoot }) {
    const values = [
        reportRoot,
        processRef && processRef.env ? processRef.env.SYSTEM_UPDATE_SMOKE_REPORT_ROOT : '',
        projectRoot ? pathRef.join(projectRoot, 'reports/system-update-smoke') : '',
        processRef && typeof processRef.cwd === 'function'
            ? pathRef.join(processRef.cwd(), 'reports/system-update-smoke')
            : '',
    ];
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
}

function createSystemUpdateSmokeSummaryService({
    fsRef = fs,
    pathRef = path,
    projectRoot = process.cwd(),
    processRef = process,
    reportRoot = '',
    cacheTtlMs = 15 * 1000,
    nowFn = () => Date.now(),
} = {}) {
    let cache = null;
    let cacheAt = 0;

    function findLatestSummaryFile() {
        const roots = getCandidateRoots({
            pathRef,
            projectRoot,
            processRef,
            reportRoot,
        });
        const candidates = [];

        for (const root of roots) {
            if (!root || !fsRef.existsSync(root)) continue;
            let entries = [];
            try {
                entries = fsRef.readdirSync(root, { withFileTypes: true });
            } catch {
                continue;
            }

            for (const entry of entries) {
                if (!entry || !entry.isDirectory()) continue;
                const reportDir = pathRef.join(root, entry.name);
                const summaryPath = pathRef.join(reportDir, 'SUMMARY.md');
                if (!fsRef.existsSync(summaryPath)) continue;

                let summaryStat = null;
                try {
                    summaryStat = fsRef.statSync(summaryPath);
                } catch {
                    summaryStat = null;
                }
                candidates.push({
                    reportDir,
                    summaryPath,
                    updatedAt: Number(summaryStat && summaryStat.mtimeMs) || 0,
                    sortKey: entry.name,
                });
            }
        }

        candidates.sort((left, right) => {
            if (right.updatedAt !== left.updatedAt) {
                return right.updatedAt - left.updatedAt;
            }
            return String(right.sortKey || '').localeCompare(String(left.sortKey || ''));
        });

        return candidates[0] || null;
    }

    function getLatestSummary() {
        const now = nowFn();
        if (cache && (now - cacheAt) < cacheTtlMs) {
            return cache;
        }

        const latest = findLatestSummaryFile();
        if (!latest) {
            cache = null;
            cacheAt = now;
            return null;
        }

        const markdown = fsRef.readFileSync(latest.summaryPath, 'utf8');
        cache = parseSystemUpdateSmokeSummary(markdown, latest);
        cacheAt = now;
        return cache;
    }

    return {
        getLatestSummary,
        parseSystemUpdateSmokeSummary: (markdown, options = {}) => parseSystemUpdateSmokeSummary(markdown, options),
    };
}

module.exports = {
    createSystemUpdateSmokeSummaryService,
    parseSystemUpdateSmokeSummary,
};
