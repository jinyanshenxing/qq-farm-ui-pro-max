const test = require('node:test');
const assert = require('node:assert/strict');

const friendCacheSeedsModulePath = require.resolve('../src/services/friend-cache-seeds');
const configModulePath = require.resolve('../src/config/config');
const databaseModulePath = require.resolve('../src/services/database');
const loggerModulePath = require.resolve('../src/services/logger');
const utilsModulePath = require.resolve('../src/utils/utils');

function mockModule(modulePath, exports) {
    const previous = require.cache[modulePath];
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports,
    };

    return () => {
        if (previous) require.cache[modulePath] = previous;
        else delete require.cache[modulePath];
    };
}

test('cacheFriendSeeds normalizes and merges immediate seeds', async () => {
    const mergeCalls = [];
    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { accountId: 'acc-1' } }),
        mockModule(databaseModulePath, {
            mergeFriendsCache: async (accountId, friends) => {
                mergeCalls.push({ accountId, friends });
            },
        }),
        mockModule(loggerModulePath, {
            createModuleLogger: () => ({ warn() {}, info() {}, error() {} }),
        }),
        mockModule(utilsModulePath, {
            toNum: (value) => Number(value) || 0,
        }),
    ];

    try {
        delete require.cache[friendCacheSeedsModulePath];
        const { cacheFriendSeeds, buildFriendSeedsFromLands } = require(friendCacheSeedsModulePath);

        const landSeeds = buildFriendSeedsFromLands([
            { unlocked: true, plant: { stealers: [3001, 3002], weed_owners: [3002], insect_owners: [999] } },
        ], 999);

        await cacheFriendSeeds([
            { gid: 3001, name: '偷菜甲', avatar_url: 'https://img/a.png' },
            { visitor_gid: 3002, nick: '偷菜乙' },
            ...landSeeds,
        ], { immediate: true });

        assert.deepEqual(mergeCalls, [
            {
                accountId: 'acc-1',
                friends: [
                    { gid: 3001, uin: '', name: '偷菜甲', avatarUrl: 'https://img/a.png' },
                    { gid: 3002, uin: '', name: '偷菜乙', avatarUrl: '' },
                ],
            },
        ]);
    } finally {
        delete require.cache[friendCacheSeedsModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});

test('cacheFriendSeeds batches delayed writes by account', async () => {
    const mergeCalls = [];
    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { accountId: '' } }),
        mockModule(databaseModulePath, {
            mergeFriendsCache: async (accountId, friends) => {
                mergeCalls.push({ accountId, friends });
            },
        }),
        mockModule(loggerModulePath, {
            createModuleLogger: () => ({ warn() {}, info() {}, error() {} }),
        }),
        mockModule(utilsModulePath, {
            toNum: (value) => Number(value) || 0,
        }),
    ];

    try {
        delete require.cache[friendCacheSeedsModulePath];
        const {
            cacheFriendSeeds,
            flushQueuedFriendSeeds,
            __resetFriendSeedQueueForTest,
        } = require(friendCacheSeedsModulePath);

        await cacheFriendSeeds([{ gid: 4001, name: 'A' }], { accountId: 'acc-2', delayMs: 60 });
        await cacheFriendSeeds([{ gid: 4001, avatar_url: 'https://img/a.png' }, { gid: 4002 }], { accountId: 'acc-2', delayMs: 60 });
        await flushQueuedFriendSeeds('acc-2');

        assert.deepEqual(mergeCalls, [
            {
                accountId: 'acc-2',
                friends: [
                    { gid: 4001, uin: '', name: 'A', avatarUrl: 'https://img/a.png' },
                    { gid: 4002, uin: '', name: 'GID:4002', avatarUrl: '' },
                ],
            },
        ]);

        __resetFriendSeedQueueForTest();
    } finally {
        delete require.cache[friendCacheSeedsModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});

test('cacheFriendSeeds resolves mergeFriendsCache lazily after module load', async () => {
    const mergeCalls = [];
    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { accountId: 'acc-3' } }),
        mockModule(databaseModulePath, {}),
        mockModule(loggerModulePath, {
            createModuleLogger: () => ({ warn() {}, info() {}, error() {} }),
        }),
        mockModule(utilsModulePath, {
            toNum: (value) => Number(value) || 0,
        }),
    ];

    try {
        delete require.cache[friendCacheSeedsModulePath];
        const { cacheFriendSeeds } = require(friendCacheSeedsModulePath);

        require.cache[databaseModulePath].exports = {
            mergeFriendsCache: async (accountId, friends) => {
                mergeCalls.push({ accountId, friends });
            },
        };

        const ok = await cacheFriendSeeds([{ gid: 5001, name: '访客甲' }], { immediate: true });

        assert.equal(ok, true);
        assert.deepEqual(mergeCalls, [
            {
                accountId: 'acc-3',
                friends: [
                    { gid: 5001, uin: '', name: '访客甲', avatarUrl: '' },
                ],
            },
        ]);
    } finally {
        delete require.cache[friendCacheSeedsModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});
