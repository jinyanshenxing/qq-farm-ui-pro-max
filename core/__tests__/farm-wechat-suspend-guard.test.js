const test = require('node:test');
const assert = require('node:assert/strict');

const farmModulePath = require.resolve('../src/services/farm');
const configModulePath = require.resolve('../src/config/config');
const gameConfigModulePath = require.resolve('../src/config/gameConfig');
const storeModulePath = require.resolve('../src/models/store');
const networkModulePath = require.resolve('../src/utils/network');
const protoModulePath = require.resolve('../src/utils/proto');
const utilsModulePath = require.resolve('../src/utils/utils');
const analyticsModulePath = require.resolve('../src/services/analytics');
const accountModePolicyModulePath = require.resolve('../src/services/account-mode-policy');
const warehouseModulePath = require.resolve('../src/services/warehouse');
const plantingStrategyModulePath = require.resolve('../src/services/planting-strategy');
const schedulerModulePath = require.resolve('../src/services/scheduler');
const loggerModulePath = require.resolve('../src/services/logger');
const statsModulePath = require.resolve('../src/services/stats');
const rateLimiterModulePath = require.resolve('../src/services/rate-limiter');
const friendCacheSeedsModulePath = require.resolve('../src/services/friend-cache-seeds');
const visitorIdentityModulePath = require.resolve('../src/services/visitor-identity');

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

function createFarmRestores(options = {}) {
    return [
        mockModule(configModulePath, {
            CONFIG: {
                accountId: 'acc-wx-1',
                platform: options.platform || 'wx_car',
            },
            PlantPhase: {},
            PHASE_NAMES: {},
        }),
        mockModule(gameConfigModulePath, {
            getPlantNameBySeedId: () => '',
            getPlantName: () => '',
            getPlantExp: () => 0,
            formatGrowTime: () => '',
            getPlantGrowTime: () => 0,
            getAllSeeds: () => [],
            getPlantById: () => null,
            getPlantBySeedId: () => null,
            getSeedImageBySeedId: () => '',
        }),
        mockModule(storeModulePath, {
            isAutomationOn: () => true,
            getPreferredSeed: () => 0,
            getAutomation: () => ({}),
            getPlantingStrategy: () => 'preferred',
            recordSuspendUntil() {},
            getTimingConfig: () => ({
                ghostingCooldownMin: 240,
                ghostingProbability: 0,
                ghostingMinMin: 30,
                ghostingMaxMin: 90,
            }),
            getConfigSnapshot: () => ({}),
        }),
        mockModule(networkModulePath, {
            sendMsgAsync: async () => {
                throw new Error('sendMsgAsync should not be called while wx suspend guard is active');
            },
            sendMsgAsyncUrgent: async () => {
                throw new Error('sendMsgAsyncUrgent should not be called while wx suspend guard is active');
            },
            getUserState: () => ({
                gid: 1001,
                suspendUntil: Date.now() + 10 * 60 * 1000,
            }),
            getWsErrorState: () => ({ code: 0, at: 0, message: '' }),
            networkEvents: { emit() {}, on() {}, removeListener() {} },
        }),
        mockModule(protoModulePath, {
            types: {},
        }),
        mockModule(utilsModulePath, {
            toLong: (value) => value,
            toNum: (value) => Number(value) || 0,
            getServerTimeSec: () => 0,
            toTimeSec: () => 0,
            log() {},
            logWarn() {},
            sleep: async () => {},
        }),
        mockModule(analyticsModulePath, {
            getPlantRankings: () => [],
        }),
        mockModule(accountModePolicyModulePath, {
            getRuntimeAccountModePolicy: () => ({ collaborationEnabled: true }),
        }),
        mockModule(warehouseModulePath, {
            getBagDetail: async () => ({ items: [] }),
            getPlantableBagSeeds: async () => [],
        }),
        mockModule(plantingStrategyModulePath, {
            ANALYTICS_SORT_BY_MAP: {},
            getInventorySourcePlan: () => null,
            getWorkflowSelectSeedOverride: () => null,
            normalizeInventoryPlantingMode: (mode) => mode || 'disabled',
            pickBudgetOptimizedPlan: () => null,
            pickSeedByStrategy: () => null,
        }),
        mockModule(schedulerModulePath, {
            createScheduler: () => ({
                setTimeoutTask() {},
                clearAll() {},
            }),
        }),
        mockModule(loggerModulePath, {
            createModuleLogger: () => ({
                info() {},
                warn() {},
                error() {},
            }),
        }),
        mockModule(statsModulePath, {
            recordOperation() {},
        }),
        mockModule(rateLimiterModulePath, {
            getDefaultLimiter: () => ({ bucket: { waitForToken: async () => {} } }),
        }),
        mockModule(friendCacheSeedsModulePath, {
            cacheFriendSeeds: async () => {},
            buildFriendSeedsFromLands: () => [],
            resolveFriendSeedAccountId: () => 'acc-wx-1',
        }),
        mockModule(visitorIdentityModulePath, {
            resolveVisitorIdentity: async () => ({ gid: 0, name: '', known: false, source: '' }),
        }),
    ];
}

test('runFarmOperation skips self-farm automation for wx_car during suspend', async () => {
    const restoreFns = createFarmRestores({ platform: 'wx_car' });

    try {
        delete require.cache[farmModulePath];
        const farm = require(farmModulePath);

        const result = await farm.runFarmOperation('all');

        assert.deepEqual(result, { hadWork: false, actions: [] });
    } finally {
        delete require.cache[farmModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});
