const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createModuleLogger } = require('./logger');
const { getAnnouncements, saveAnnouncement } = require('./database');
const { getSystemUpdateReleaseCache } = require('./system-update-config');
const {
    compareVersions,
    formatVersionTag,
    parseJsonSafely,
    toTimestamp,
} = require('./system-update-utils');

const logger = createModuleLogger('announcement-materializer');

const ANNOUNCEMENT_SOURCE_PRIORITY = Object.freeze({
    release_cache: 3,
    update_log: 2,
    embedded: 1,
});

function resolveProjectRoot(projectRoot) {
    if (projectRoot) {
        return path.resolve(String(projectRoot));
    }
    return path.resolve(__dirname, '../../..');
}

function sanitizeText(value) {
    return String(value || '').trim();
}

function normalizeAnnouncementMatchParts(input = {}) {
    const version = formatVersionTag(input.version || input.versionTag || '', '');
    const publishDate = sanitizeText(input.publishDate || input.publish_date || input.date || '');
    const title = sanitizeText(input.title || '').replace(/\s+/g, ' ').toLowerCase();

    if (version && publishDate) {
        return [`ver:${version}|date:${publishDate}`];
    }
    if (version) {
        return [`ver:${version}`];
    }
    if (publishDate && title) {
        return [`date:${publishDate}|title:${title}`];
    }
    if (title) {
        return [`title:${title}`];
    }
    return [];
}

function buildAnnouncementSourceKey(input = {}) {
    const matchParts = normalizeAnnouncementMatchParts(input);
    if (matchParts.length === 0) {
        return '';
    }
    return crypto.createHash('sha1').update(matchParts[0]).digest('hex');
}

function formatDateOnly(value) {
    const ts = toTimestamp(value, 0);
    if (!ts) {
        const text = sanitizeText(value);
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            return text;
        }
        return '';
    }
    return new Date(ts).toISOString().slice(0, 10);
}

function parseUpdateLogEntries(raw = '') {
    const lines = String(raw || '').split(/\r?\n/);
    const entries = [];
    const dateRe = /^(\d{4}-\d{2}-\d{2})(?:\s+|$)/;
    const versionRe = /前端[：:]\s*(v[\d.]+)/;
    let current = null;

    const pushCurrent = () => {
        if (!current) return;
        const header = `${current.date} ${current.title}`.trim();
        const blockText = [header, ...current.contentLines].join('\n');
        const versionMatch = header.match(versionRe) || blockText.match(versionRe);
        const content = current.contentLines.join('\n').trim();
        entries.push({
            title: current.title,
            version: versionMatch ? versionMatch[1] : '',
            publishDate: current.date,
            content,
            summary: content.split('\n').map(line => line.trim()).find(Boolean) || current.title,
            sourceType: 'update_log',
            sourceKey: buildAnnouncementSourceKey({
                title: current.title,
                version: versionMatch ? versionMatch[1] : '',
                publishDate: current.date,
            }),
            releaseUrl: '',
            assets: [],
        });
        current = null;
    };

    for (const line of lines) {
        const trimmed = line.trim();
        const dateMatch = trimmed.match(dateRe);
        if (dateMatch) {
            const title = trimmed.slice(dateMatch[0].length).trim();
            if (!title) {
                continue;
            }
            pushCurrent();
            current = {
                date: dateMatch[1],
                title,
                contentLines: [],
            };
            continue;
        }
        if (current) {
            current.contentLines.push(line);
        }
    }

    pushCurrent();
    return entries;
}

function parseChangelogQuickIndex(raw = '') {
    const quickIndexMatch = String(raw || '').match(/## 快速索引（精简版）([\s\S]*?)(?:\n> 说明|\n## )/);
    const quickIndexBlock = quickIndexMatch && quickIndexMatch[1] ? quickIndexMatch[1] : '';

    return quickIndexBlock
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map((line) => {
            const match = line.match(/^- `([^`]+) \((\d{4}-\d{2}-\d{2})\)` (.+)$/);
            if (!match) return null;

            const [, version = '', publishDate = '', body = ''] = match;
            const [titlePart = '', summaryPart = ''] = body.split(/[：:]/, 2);
            const title = sanitizeText(titlePart || body);
            const summary = sanitizeText(summaryPart || body);

            return {
                title,
                version: formatVersionTag(version, ''),
                publishDate,
                content: summary,
                summary,
                sourceType: 'embedded',
                sourceKey: buildAnnouncementSourceKey({
                    title,
                    version,
                    publishDate,
                }),
                releaseUrl: '',
                assets: [],
            };
        })
        .filter(Boolean);
}

function normalizeReleaseAsset(asset = {}) {
    const input = asset && typeof asset === 'object' ? asset : {};
    const name = sanitizeText(input.name || input.label || '');
    const url = sanitizeText(input.url || input.browser_download_url || input.downloadUrl || '');
    if (!name && !url) {
        return null;
    }
    return {
        name,
        url,
        size: Math.max(0, Number.parseInt(input.size, 10) || 0),
    };
}

function normalizeReleaseCacheEntries(releaseCache = {}) {
    const releases = Array.isArray(releaseCache.releases) && releaseCache.releases.length > 0
        ? releaseCache.releases
        : [releaseCache.latestRelease].filter(Boolean);

    return releases
        .map((release) => {
            const normalizedRelease = release && typeof release === 'object' ? release : {};
            const version = formatVersionTag(
                normalizedRelease.versionTag
                || normalizedRelease.version
                || '',
                '',
            );
            const title = sanitizeText(normalizedRelease.title || normalizedRelease.name || version);
            const publishDate = formatDateOnly(normalizedRelease.publishedAt || normalizedRelease.published_at || '');
            const content = sanitizeText(normalizedRelease.notes || normalizedRelease.body || title);
            const summary = content.split('\n').map(line => line.trim()).find(Boolean) || title;
            const assets = Array.isArray(normalizedRelease.assets)
                ? normalizedRelease.assets.map(normalizeReleaseAsset).filter(Boolean)
                : [];

            return {
                title: title || version,
                version,
                publishDate,
                content,
                summary,
                sourceType: 'release_cache',
                sourceKey: buildAnnouncementSourceKey({
                    title,
                    version,
                    publishDate,
                }),
                releaseUrl: sanitizeText(normalizedRelease.url || normalizedRelease.html_url || ''),
                assets,
            };
        })
        .filter(item => item.sourceKey || item.title);
}

function compareAnnouncementEntries(left, right) {
    const leftTime = toTimestamp(left && left.publishDate, 0);
    const rightTime = toTimestamp(right && right.publishDate, 0);
    if (rightTime !== leftTime) {
        return rightTime - leftTime;
    }

    const versionCmp = compareVersions(
        right && right.version,
        left && left.version,
    );
    if (versionCmp !== 0) {
        return versionCmp;
    }

    const priorityGap = (ANNOUNCEMENT_SOURCE_PRIORITY[right && right.sourceType] || 0)
        - (ANNOUNCEMENT_SOURCE_PRIORITY[left && left.sourceType] || 0);
    if (priorityGap !== 0) {
        return priorityGap;
    }

    return sanitizeText(right && right.title).localeCompare(sanitizeText(left && left.title), 'zh-CN');
}

function dedupeAnnouncementEntries(entries = []) {
    const deduped = new Map();
    const sortedEntries = Array.isArray(entries)
        ? [...entries].sort(compareAnnouncementEntries)
        : [];

    for (const entry of sortedEntries) {
        const normalized = {
            title: sanitizeText(entry && entry.title),
            version: formatVersionTag(entry && entry.version, ''),
            publishDate: sanitizeText(entry && entry.publishDate),
            content: sanitizeText(entry && entry.content),
            summary: sanitizeText(entry && entry.summary),
            sourceType: sanitizeText(entry && entry.sourceType) || 'embedded',
            sourceKey: sanitizeText(entry && entry.sourceKey) || buildAnnouncementSourceKey(entry),
            releaseUrl: sanitizeText(entry && entry.releaseUrl),
            assets: Array.isArray(entry && entry.assets) ? entry.assets : [],
        };
        const dedupeKey = normalized.sourceKey || buildAnnouncementSourceKey(normalized);
        if (!dedupeKey) {
            continue;
        }

        if (!deduped.has(dedupeKey)) {
            deduped.set(dedupeKey, normalized);
            continue;
        }

        const current = deduped.get(dedupeKey);
        if (!current.content && normalized.content) {
            current.content = normalized.content;
        }
        if (!current.summary && normalized.summary) {
            current.summary = normalized.summary;
        }
        if (!current.releaseUrl && normalized.releaseUrl) {
            current.releaseUrl = normalized.releaseUrl;
        }
        if ((!current.assets || current.assets.length === 0) && normalized.assets.length > 0) {
            current.assets = normalized.assets;
        }
    }

    return Array.from(deduped.values()).sort(compareAnnouncementEntries);
}

function createAnnouncementRuntime(options = {}) {
    const fsRef = options.fsRef || fs;
    const pathRef = options.pathRef || path;
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const updateLogPath = sanitizeText(options.updateLogPath) || pathRef.join(projectRoot, 'logs/development/Update.log');
    const changelogPath = sanitizeText(options.changelogPath) || pathRef.join(projectRoot, 'CHANGELOG.md');
    const cacheTtlMs = Math.max(1000, Number.parseInt(options.cacheTtlMs, 10) || (5 * 60 * 1000));
    const nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
    const getAnnouncementsRef = options.getAnnouncementsRef || getAnnouncements;
    const saveAnnouncementRef = options.saveAnnouncementRef || saveAnnouncement;
    const getSystemUpdateReleaseCacheRef = options.getSystemUpdateReleaseCacheRef || getSystemUpdateReleaseCache;

    let notificationsCache = null;
    let notificationsCacheTime = 0;

    function invalidateCache() {
        notificationsCache = null;
        notificationsCacheTime = 0;
    }

    function readTextFile(targetPath) {
        if (!fsRef.existsSync(targetPath)) {
            return '';
        }
        return fsRef.readFileSync(targetPath, 'utf8');
    }

    function loadUpdateLogEntries() {
        const raw = readTextFile(updateLogPath);
        if (!raw) {
            return [];
        }
        return parseUpdateLogEntries(raw);
    }

    function loadEmbeddedReleaseNotes() {
        const raw = readTextFile(changelogPath);
        if (!raw) {
            return [];
        }
        return parseChangelogQuickIndex(raw);
    }

    async function loadReleaseCacheEntries() {
        try {
            const releaseCache = await getSystemUpdateReleaseCacheRef();
            return normalizeReleaseCacheEntries(releaseCache);
        } catch (error) {
            logger.warn('load release cache entries failed', {
                error: error && error.message ? error.message : String(error),
            });
            return [];
        }
    }

    async function collectAnnouncementEntries(optionsRef = {}) {
        const sourceTypes = Array.isArray(optionsRef.sourceTypes) && optionsRef.sourceTypes.length > 0
            ? Array.from(new Set(optionsRef.sourceTypes.map(item => sanitizeText(item)).filter(Boolean)))
            : ['release_cache', 'update_log', 'embedded'];
        const allEntries = [];

        if (sourceTypes.includes('release_cache')) {
            allEntries.push(...await loadReleaseCacheEntries());
        }
        if (sourceTypes.includes('update_log')) {
            allEntries.push(...loadUpdateLogEntries());
        }
        if (sourceTypes.includes('embedded')) {
            allEntries.push(...loadEmbeddedReleaseNotes());
        }

        const dedupedEntries = dedupeAnnouncementEntries(allEntries);
        const limit = Math.max(0, Number.parseInt(optionsRef.limit, 10) || 0);
        return limit > 0 ? dedupedEntries.slice(0, limit) : dedupedEntries;
    }

    async function listNotificationEntries(optionsRef = {}) {
        const limit = Math.max(0, Number.parseInt(optionsRef.limit, 10) || 0);
        const forceRefresh = !!optionsRef.forceRefresh;
        const now = nowFn();

        if (!forceRefresh && notificationsCache && (now - notificationsCacheTime) < cacheTtlMs) {
            return limit > 0 ? notificationsCache.slice(0, limit) : notificationsCache;
        }

        const entries = await collectAnnouncementEntries({
            ...optionsRef,
            limit: 0,
        });
        notificationsCache = entries;
        notificationsCacheTime = now;
        return limit > 0 ? entries.slice(0, limit) : entries;
    }

    async function materializeAnnouncements(optionsRef = {}) {
        const createdBy = sanitizeText(optionsRef.createdBy) || 'system_sync';
        const dryRun = !!optionsRef.dryRun;
        const entries = await collectAnnouncementEntries({
            sourceTypes: optionsRef.sourceTypes,
            limit: optionsRef.limit,
            forceRefresh: true,
        });
        const existing = await getAnnouncementsRef() || [];
        const existingById = new Map();
        const existingByMatchKey = new Map();

        for (const announcement of existing) {
            if (announcement && announcement.id) {
                existingById.set(Number(announcement.id), announcement);
            }
            const sourceKey = sanitizeText(announcement && announcement.sourceKey);
            if (sourceKey) {
                existingByMatchKey.set(sourceKey, announcement);
            }
            for (const key of normalizeAnnouncementMatchParts({
                title: announcement && announcement.title,
                version: announcement && announcement.version,
                publishDate: announcement && (announcement.publishDate || announcement.publish_date),
            })) {
                existingByMatchKey.set(key, announcement);
            }
        }

        let added = 0;
        let updated = 0;
        let skipped = 0;
        const sourceStats = {};

        const orderedEntries = [...entries].reverse();
        for (const entry of orderedEntries) {
            sourceStats[entry.sourceType] = (sourceStats[entry.sourceType] || 0) + 1;

            const matchKeys = [
                sanitizeText(entry.sourceKey),
                ...normalizeAnnouncementMatchParts(entry),
            ].filter(Boolean);
            const matchedAnnouncement = matchKeys
                .map(key => existingByMatchKey.get(key))
                .find(Boolean) || null;

            const payload = {
                id: matchedAnnouncement ? Number(matchedAnnouncement.id) : null,
                title: entry.title,
                version: entry.version,
                publish_date: entry.publishDate,
                content: entry.content || entry.summary || entry.title,
                summary: entry.summary || entry.title,
                enabled: matchedAnnouncement ? matchedAnnouncement.enabled !== false : true,
                createdBy,
                sourceType: entry.sourceType,
                sourceKey: entry.sourceKey || buildAnnouncementSourceKey(entry),
                releaseUrl: entry.releaseUrl,
                assets: entry.assets,
            };

            const unchanged = matchedAnnouncement
                && sanitizeText(matchedAnnouncement.title) === payload.title
                && formatVersionTag(matchedAnnouncement.version, '') === payload.version
                && sanitizeText(matchedAnnouncement.publishDate || matchedAnnouncement.publish_date) === payload.publish_date
                && sanitizeText(matchedAnnouncement.content) === payload.content
                && sanitizeText(matchedAnnouncement.summary) === payload.summary
                && sanitizeText(matchedAnnouncement.sourceType) === payload.sourceType
                && sanitizeText(matchedAnnouncement.sourceKey) === payload.sourceKey
                && sanitizeText(matchedAnnouncement.releaseUrl) === payload.releaseUrl
                && JSON.stringify(parseJsonSafely(matchedAnnouncement.assets, [])) === JSON.stringify(payload.assets || []);

            if (unchanged) {
                skipped += 1;
                continue;
            }

            if (!dryRun) {
                await saveAnnouncementRef(payload);
            }

            if (matchedAnnouncement) {
                updated += 1;
                const nextRecord = {
                    ...matchedAnnouncement,
                    ...payload,
                    id: matchedAnnouncement.id,
                    publishDate: payload.publish_date,
                };
                existingById.set(Number(matchedAnnouncement.id), nextRecord);
                existingByMatchKey.set(payload.sourceKey, nextRecord);
                for (const key of normalizeAnnouncementMatchParts(payload)) {
                    existingByMatchKey.set(key, nextRecord);
                }
            } else {
                added += 1;
                const nextRecord = {
                    id: 0,
                    ...payload,
                    publishDate: payload.publish_date,
                };
                existingByMatchKey.set(payload.sourceKey, nextRecord);
                for (const key of normalizeAnnouncementMatchParts(payload)) {
                    existingByMatchKey.set(key, nextRecord);
                }
            }
        }

        invalidateCache();

        return {
            ok: true,
            totalParsed: entries.length,
            added,
            updated,
            skipped,
            latestVersion: entries[0] ? entries[0].version : '',
            sources: sourceStats,
            entries,
        };
    }

    async function ensureAnnouncementsSeeded(optionsRef = {}) {
        const currentAnnouncements = await getAnnouncementsRef() || [];
        if (currentAnnouncements.length > 0 && !optionsRef.force) {
            return {
                ok: true,
                seeded: false,
                reason: 'existing_announcements',
                totalExisting: currentAnnouncements.length,
            };
        }

        const result = await materializeAnnouncements({
            ...optionsRef,
            dryRun: false,
            createdBy: sanitizeText(optionsRef.createdBy) || 'system_bootstrap',
        });

        return {
            ok: true,
            seeded: result.added > 0 || result.updated > 0,
            totalExisting: currentAnnouncements.length,
            ...result,
        };
    }

    return {
        projectRoot,
        updateLogPath,
        changelogPath,
        invalidateCache,
        loadUpdateLogEntries,
        loadEmbeddedReleaseNotes,
        loadReleaseCacheEntries,
        listNotificationEntries,
        collectAnnouncementEntries,
        materializeAnnouncements,
        ensureAnnouncementsSeeded,
    };
}

module.exports = {
    ANNOUNCEMENT_SOURCE_PRIORITY,
    buildAnnouncementSourceKey,
    createAnnouncementRuntime,
    dedupeAnnouncementEntries,
    normalizeReleaseCacheEntries,
    parseChangelogQuickIndex,
    parseUpdateLogEntries,
};
