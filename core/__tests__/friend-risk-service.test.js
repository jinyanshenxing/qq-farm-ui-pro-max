const test = require('node:test');
const assert = require('node:assert/strict');

const serviceModulePath = require.resolve('../src/services/friend-risk-service');
const mysqlDbModulePath = require.resolve('../src/services/mysql-db');
const storeModulePath = require.resolve('../src/models/store');

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

test('friend risk service lazily initializes mysql pool for worker-side persistence', async () => {
    let initialized = false;
    let initCalls = 0;
    const calls = [];
    const fakePool = {
        async query(sql) {
            calls.push(['query', sql]);
            if (sql.includes('COUNT(*) AS total')) {
                return [[{ total: 0 }]];
            }
            if (sql.includes('SELECT id, risk_score, tags')) {
                return [[]];
            }
            if (sql.includes('FROM friend_risk_profiles')) {
                return [[{
                    id: 1,
                    account_id: '1001',
                    friend_gid: 2002,
                    friend_uin: '',
                    friend_open_id: '',
                    friend_name: '测试好友',
                    risk_score: 10,
                    risk_level: 'low',
                    strategy_state: 'observe',
                    tags: '[]',
                    last_hit_reason: 'passive_steal',
                    last_hit_at: new Date('2026-03-24T00:00:00Z'),
                    last_observed_at: new Date('2026-03-24T00:00:00Z'),
                    updated_at: new Date('2026-03-24T00:00:00Z'),
                }]];
            }
            throw new Error(`unexpected query: ${sql}`);
        },
        async execute(sql, params) {
            calls.push(['execute', sql, params]);
            return [{ affectedRows: 1 }];
        },
    };

    const restoreFns = [
        mockModule(storeModulePath, {
            getFriendRiskConfig() {
                return {
                    enabled: true,
                    passiveDetectEnabled: true,
                    passiveWindowSec: 180,
                    passiveDailyThreshold: 3,
                    markScoreThreshold: 50,
                    autoDeprioritize: false,
                    eventRetentionDays: 30,
                };
            },
        }),
        mockModule(mysqlDbModulePath, {
            async initMysql() {
                initCalls += 1;
                initialized = true;
            },
            isMysqlInitialized() {
                return initialized;
            },
            getPool() {
                if (!initialized) {
                    throw new Error('MySQL pool is not initialized. Call initMysql() first.');
                }
                return fakePool;
            },
        }),
    ];

    try {
        delete require.cache[serviceModulePath];
        const friendRiskService = require(serviceModulePath);

        const result = await friendRiskService.recordPassiveStealEvent({
            accountId: '1001',
            landId: 8,
            friendGid: 2002,
            friendName: '测试好友',
            observedAt: Date.now(),
            source: 'farm_visitor',
        });
        const profiles = await friendRiskService.listFriendRiskProfiles('1001', { limit: 5 });

        assert.equal(initCalls, 1);
        assert.equal(result.friendGid, 2002);
        assert.equal(result.riskScore, 10);
        assert.equal(profiles.length, 1);
        assert.equal(profiles[0].friendGid, 2002);
        assert.equal(calls.filter(item => item[0] === 'execute').length, 2);
    } finally {
        delete require.cache[serviceModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});
