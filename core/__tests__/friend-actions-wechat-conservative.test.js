const test = require('node:test');
const assert = require('node:assert/strict');

const friendActionsModulePath = require.resolve('../src/services/friend/friend-actions');
const configModulePath = require.resolve('../src/config/config');
const gameConfigModulePath = require.resolve('../src/config/gameConfig');
const storeModulePath = require.resolve('../src/models/store');
const networkModulePath = require.resolve('../src/utils/network');
const protoModulePath = require.resolve('../src/utils/proto');
const utilsModulePath = require.resolve('../src/utils/utils');
const farmModulePath = require.resolve('../src/services/farm');
const statsModulePath = require.resolve('../src/services/stats');
const warehouseModulePath = require.resolve('../src/services/warehouse');
const databaseModulePath = require.resolve('../src/services/database');
const interactModulePath = require.resolve('../src/services/interact');
const commonModulePath = require.resolve('../src/services/common');
const platformFactoryModulePath = require.resolve('../src/platform/PlatformFactory');
const friendCacheSeedsModulePath = require.resolve('../src/services/friend-cache-seeds');
const friendStateModulePath = require.resolve('../src/services/friend/friend-state');
const friendScannerModulePath = require.resolve('../src/services/friend/friend-scanner');
const friendDecisionModulePath = require.resolve('../src/services/friend/friend-decision');

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

function createWeChatHarness(options = {}) {
    const state = {
        getAllCalls: 0,
    };
    const getAllReplies = Array.isArray(options.getAllReplies) ? [...options.getAllReplies] : [];
    const cachedFriends = Array.isArray(options.cachedFriends) ? options.cachedFriends : [];
    const userState = options.userState || { gid: 999, accountId: 'wx-acc-1' };
    const restoreFns = [
        mockModule(configModulePath, {
            CONFIG: {
                platform: 'wx_car',
                accountId: userState.accountId,
                uin: 'wxid_demo',
            },
            PlantPhase: {},
            PHASE_NAMES: {},
        }),
        mockModule(gameConfigModulePath, {
            getPlantName: () => '',
            getPlantById: () => null,
            getSeedImageBySeedId: () => '',
        }),
        mockModule(storeModulePath, {
            isAutomationOn: () => false,
            getFriendQuietHours: () => ({ enabled: false }),
            getFriendBlacklist: () => [],
            setFriendBlacklist: () => [],
            getStealFilterConfig: () => ({ enabled: false, mode: 'blacklist', plantIds: [] }),
            getStealFriendFilterConfig: () => ({ enabled: false, mode: 'blacklist', friendIds: [] }),
            getStakeoutStealConfig: () => ({ enabled: false, delaySec: 3 }),
            getAutomation: () => ({}),
            getConfigSnapshot: () => ({}),
            getForceGetAllConfig: () => ({ enabled: false }),
        }),
        mockModule(networkModulePath, {
            sendMsgAsync: async (_serviceName, methodName) => {
                if (methodName !== 'GetAll') {
                    throw new Error(`unexpected method: ${methodName}`);
                }
                state.getAllCalls += 1;
                const nextKey = getAllReplies.shift() || 'self-only';
                return { body: Buffer.from(nextKey) };
            },
            sendMsgAsyncUrgent: async () => ({ body: Buffer.alloc(0) }),
            getUserState: () => userState,
            networkEvents: { emit() {} },
        }),
        mockModule(protoModulePath, {
            types: {
                GetAllFriendsRequest: {
                    create: (value) => value || {},
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
                GetAllFriendsReply: {
                    decode: (body) => {
                        const key = Buffer.from(body).toString();
                        if (key === 'live') {
                            return {
                                game_friends: [
                                    { gid: userState.gid, name: 'self' },
                                    { gid: 2001, name: '微信好友甲', avatar_url: 'https://img/live.png' },
                                ],
                                invitations: [],
                                application_count: 0,
                            };
                        }
                        return {
                            game_friends: [{ gid: userState.gid, name: 'self' }],
                            invitations: [],
                            application_count: 0,
                        };
                    },
                },
            },
        }),
        mockModule(utilsModulePath, {
            toLong: (value) => value,
            toNum: (value) => Number(value) || 0,
            toTimeSec: () => 0,
            getServerTimeSec: () => 0,
            log() {},
            logWarn() {},
            sleep: async () => {},
        }),
        mockModule(farmModulePath, {
            getCurrentPhase: () => null,
            setOperationLimitsCallback() {},
        }),
        mockModule(statsModulePath, { recordOperation() {} }),
        mockModule(warehouseModulePath, { sellAllFruits: async () => {} }),
        mockModule(databaseModulePath, {
            getCachedFriends: async () => cachedFriends,
            findReusableFriendsCache: async () => null,
            mergeFriendsCache: async () => {},
        }),
        mockModule(interactModulePath, {
            getInteractRecords: async () => [],
        }),
        mockModule(commonModulePath, {
            isParamError: () => false,
        }),
        mockModule(platformFactoryModulePath, {
            createPlatform: () => ({ allowSyncAll: () => false }),
        }),
        mockModule(friendCacheSeedsModulePath, {
            cacheFriendSeeds: async () => {},
        }),
        mockModule(friendStateModulePath, {}),
        mockModule(friendScannerModulePath, {}),
        mockModule(friendDecisionModulePath, {}),
    ];

    delete require.cache[friendActionsModulePath];
    const friendActions = require(friendActionsModulePath);

    return {
        friendActions,
        state,
        cleanup() {
            delete require.cache[friendActionsModulePath];
            restoreFns.reverse().forEach(restore => restore());
        },
    };
}

test('WeChat getAllFriends keeps probing after a transient self-only reply when no cache exists', async () => {
    const harness = createWeChatHarness({
        getAllReplies: ['self-only', 'live'],
        cachedFriends: [],
    });

    try {
        const firstReply = await harness.friendActions.getAllFriends();
        assert.deepEqual(firstReply.game_friends, []);
        assert.equal(firstReply._wxConservativeGetAllOnly, true);
        assert.equal(firstReply._wxRealtimeUnavailable, true);
        assert.equal(firstReply._wxAutoRetryAt || 0, 0);

        const secondReply = await harness.friendActions.getAllFriends();
        assert.deepEqual(secondReply.game_friends.map(friend => Number(friend.gid)), [999, 2001]);
        assert.equal(secondReply._wxRealtimeUnavailable || false, false);
        assert.equal(harness.state.getAllCalls, 2);
    } finally {
        harness.cleanup();
    }
});

test('WeChat getAllFriends only enters cooldown after repeated self-only replies and then reuses cache', async () => {
    const harness = createWeChatHarness({
        getAllReplies: ['self-only', 'self-only', 'self-only', 'live'],
        cachedFriends: [
            { gid: 3001, openId: 'wxid_friend_1', name: '缓存好友甲', avatarUrl: 'https://img/cache.png' },
        ],
    });

    try {
        const firstReply = await harness.friendActions.getAllFriends();
        const secondReply = await harness.friendActions.getAllFriends();
        const thirdReply = await harness.friendActions.getAllFriends();
        const fourthReply = await harness.friendActions.getAllFriends();

        assert.equal(firstReply._fromCache, true);
        assert.equal(secondReply._fromCache, true);
        assert.equal(thirdReply._fromCache, true);
        assert.ok(Number(thirdReply._wxAutoRetryAt || 0) > Date.now());
        const diagnostics = harness.friendActions.getFriendFetchDiagnostics();
        assert.equal(diagnostics.wechat.realtimeUnavailable, true);
        assert.equal(diagnostics.wechat.realtimeUnavailableReason, 'self_only');
        assert.equal(diagnostics.wechat.failureCount, 3);
        assert.ok(Number(diagnostics.wechat.autoRetryAt || 0) > Date.now());
        assert.equal(fourthReply._fromCache, true);
        assert.deepEqual(fourthReply.game_friends.map(friend => Number(friend.gid)), [3001]);
        assert.equal(harness.state.getAllCalls, 3);
    } finally {
        harness.cleanup();
    }
});
