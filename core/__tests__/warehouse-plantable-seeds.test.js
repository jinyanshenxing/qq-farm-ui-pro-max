const test = require('node:test');
const assert = require('node:assert/strict');

const warehouseModulePath = require.resolve('../src/services/warehouse');
const gameConfigModulePath = require.resolve('../src/config/gameConfig');
const storeModulePath = require.resolve('../src/models/store');
const networkModulePath = require.resolve('../src/utils/network');
const protoModulePath = require.resolve('../src/utils/proto');
const utilsModulePath = require.resolve('../src/utils/utils');
const accountBagPreferencesModulePath = require.resolve('../src/services/account-bag-preferences');
const mysqlModulePath = require.resolve('../src/services/mysql-db');
const statusModulePath = require.resolve('../src/services/status');
const loggerModulePath = require.resolve('../src/services/logger');

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

test('plantable bag seeds treat owned rare seeds as usable and keep corrected 2x2 size', async () => {
    const restoreFns = [
        mockModule(gameConfigModulePath, {
            getFruitName: () => '',
            getPlantByFruitId: () => null,
            getPlantBySeedId: (seedId) => {
                if (Number(seedId) === 20046) {
                    return { seed_id: 20046, name: '爱心果', land_level_need: 71, size: 2 };
                }
                return null;
            },
            getPlantNameBySeedId: (seedId) => (Number(seedId) === 20046 ? '爱心果' : `Seed#${seedId}`),
            getSeedImageBySeedId: () => '/seed.png',
            getSeedPlantSize: (seedId) => (Number(seedId) === 20046 ? 2 : 1),
            getItemById: (itemId) => {
                if (Number(itemId) === 20046) {
                    return {
                        id: 20046,
                        type: 5,
                        name: '爱心果种子',
                        price: 69552,
                        level: 71,
                        interaction_type: 'plant',
                        desc: '种植后，可以收获一定数量的爱心果。',
                        effectDesc: '爱心果',
                        rarity: 4,
                        rarity_color: 'D1A21E',
                        can_use: 0,
                        max_count: 9999,
                        max_own: 9999,
                    };
                }
                return null;
            },
            getItemImageById: () => '/seed.png',
        }),
        mockModule(storeModulePath, {
            isAutomationOn: () => false,
            getTradeConfig: () => ({}),
            getConfigSnapshot: () => ({
                inventoryPlanting: {
                    globalKeepCount: 0,
                    reserveRules: [],
                },
            }),
        }),
        mockModule(networkModulePath, {
            sendMsgAsync: async () => ({ body: Buffer.from('bag-reply') }),
            networkEvents: { emit() {}, on() {}, removeListener() {} },
            getUserState: () => ({ level: 1 }),
        }),
        mockModule(protoModulePath, {
            types: {
                BagRequest: {
                    create: (payload) => payload,
                    encode: () => ({ finish: () => Buffer.from('bag-request') }),
                },
                BagReply: {
                    decode: () => ({
                        item_bag: {
                            items: [
                                { id: 20046, count: 3, uid: 1 },
                            ],
                        },
                    }),
                },
            },
        }),
        mockModule(utilsModulePath, {
            toLong: (value) => value,
            toNum: (value) => Number(value) || 0,
            log() {},
            logWarn() {},
            sleep: async () => {},
        }),
        mockModule(accountBagPreferencesModulePath, {
            getAccountBagPreferences: async () => null,
            saveAccountBagPreferences: async () => null,
        }),
        mockModule(mysqlModulePath, {
            isMysqlInitialized: () => false,
        }),
        mockModule(statusModulePath, {
            updateStatusGold() {},
        }),
        mockModule(loggerModulePath, {
            createModuleLogger: () => ({
                info() {},
                warn() {},
                error() {},
            }),
        }),
    ];

    try {
        delete require.cache[warehouseModulePath];
        const warehouse = require(warehouseModulePath);

        const seeds = await warehouse.getPlantableBagSeeds({
            includeZeroUsable: true,
            includeLocked: true,
            persistSnapshot: false,
        });

        assert.equal(seeds.length, 1);
        assert.deepEqual(seeds[0], {
            seedId: 20046,
            name: '爱心果',
            count: 3,
            usableCount: 3,
            reservedCount: 0,
            requiredLevel: 71,
            plantSize: 2,
            image: '/seed.png',
            unlocked: true,
            accountLevel: 1,
        });
    } finally {
        delete require.cache[warehouseModulePath];
        restoreFns.reverse().forEach((restore) => restore());
    }
});
