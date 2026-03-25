const { formatVersionTag } = require('./system-update-utils');

function mapAnnouncementPreviewEntry(entry = {}) {
    return {
        title: String(entry.title || '').trim(),
        version: formatVersionTag(entry.version || '', ''),
        publishDate: String(entry.publishDate || entry.publish_date || '').trim(),
        summary: String(entry.summary || entry.content || entry.title || '').trim(),
        sourceType: String(entry.sourceType || '').trim(),
        releaseUrl: String(entry.releaseUrl || '').trim(),
    };
}

function normalizeAnnouncementPreviewSummary(result = {}, options = {}) {
    const entries = Array.isArray(result.entries)
        ? result.entries.map(mapAnnouncementPreviewEntry).filter(item => item.title || item.version || item.publishDate)
        : [];
    const maxEntries = Math.max(0, Number.parseInt(options.maxEntries, 10) || 0);
    return {
        added: Math.max(0, Number.parseInt(result.added, 10) || 0),
        updated: Math.max(0, Number.parseInt(result.updated, 10) || 0),
        skipped: Math.max(0, Number.parseInt(result.skipped, 10) || 0),
        totalParsed: Math.max(0, Number.parseInt(result.totalParsed, 10) || entries.length),
        latestVersion: formatVersionTag(result.latestVersion || '', ''),
        sources: result.sources && typeof result.sources === 'object' ? result.sources : {},
        entries: maxEntries > 0 ? entries.slice(0, maxEntries) : entries,
    };
}

function buildSyncRecommendation(previewSummary) {
    if (!previewSummary) {
        return null;
    }

    const pendingCount = Number(previewSummary.added || 0) + Number(previewSummary.updated || 0);
    if (pendingCount > 0) {
        return {
            suggested: true,
            reason: previewSummary.added > 0
                ? `检测到 ${previewSummary.added} 条可新增公告`
                : `检测到 ${previewSummary.updated} 条公告可从版本源更新`,
            pendingCount,
            latestVersion: previewSummary.latestVersion || '',
        };
    }

    return {
        suggested: false,
        reason: '当前公告已与系统版本源保持同步',
        pendingCount: 0,
        latestVersion: previewSummary.latestVersion || '',
    };
}

function buildAnnouncementSyncResponse(result = {}, options = {}) {
    const summary = normalizeAnnouncementPreviewSummary(result, options);
    return {
        ...summary,
        previewCount: summary.added + summary.updated,
        sourceStats: summary.sources,
    };
}

module.exports = {
    mapAnnouncementPreviewEntry,
    normalizeAnnouncementPreviewSummary,
    buildSyncRecommendation,
    buildAnnouncementSyncResponse,
};
