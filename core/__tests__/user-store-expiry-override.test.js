const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const userStoreModulePath = require.resolve('../src/models/user-store');
const runtimePathsModulePath = require.resolve('../src/config/runtime-paths');
const mysqlDbModulePath = require.resolve('../src/services/mysql-db');
const securityModulePath = require.resolve('../src/services/security');

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

function createRuntimePathsMock(rootDir) {
    const dataDir = path.join(rootDir, 'data');
    const logDir = path.join(rootDir, 'logs');
    return {
        getDataFile(filename) {
            return path.join(dataDir, filename);
        },
        ensureDataDir() {
            fs.mkdirSync(dataDir, { recursive: true });
            return dataDir;
        },
        ensureLogDir() {
            fs.mkdirSync(logDir, { recursive: true });
            return logDir;
        },
    };
}

function createMysqlMock(initialState) {
    const state = {
        users: (initialState.users || []).map(row => ({ ...row })),
        cards: (initialState.cards || []).map(row => ({ ...row })),
    };

    async function handleQuery(sql, params = []) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

        if (normalizedSql === 'select * from users') {
            return [state.users.map(row => ({ ...row }))];
        }

        if (normalizedSql.includes('from cards inner join users on cards.used_by = users.id')) {
            const rows = state.cards
                .filter(card => card.used_by != null)
                .sort((left, right) => {
                    const leftTime = new Date(left.used_at || left.created_at || 0).getTime();
                    const rightTime = new Date(right.used_at || right.created_at || 0).getTime();
                    if (left.used_by !== right.used_by) {
                        return Number(left.used_by || 0) - Number(right.used_by || 0);
                    }
                    if (leftTime !== rightTime) {
                        return leftTime - rightTime;
                    }
                    return Number(left.id || 0) - Number(right.id || 0);
                })
                .map((card) => {
                    const user = state.users.find(item => item.id === card.used_by);
                    return {
                        ...card,
                        usedBy: user ? user.username : null,
                    };
                });
            return [rows];
        }

        if (normalizedSql.startsWith('update cards set expires_at=?, expires_override=?, updated_at=? where code=?')) {
            const [expiresAt, expiresOverride, updatedAt, code] = params;
            const card = state.cards.find(item => item.code === code);
            assert.ok(card, `card not found: ${code}`);
            card.expires_at = expiresAt;
            card.expires_override = Number(expiresOverride) ? 1 : 0;
            card.updated_at = updatedAt;
            return [{ affectedRows: 1 }];
        }

        if (normalizedSql.startsWith('update users set username=? where username=?')) {
            const [nextUsername, username] = params;
            const user = state.users.find(item => item.username === username);
            assert.ok(user, `user not found: ${username}`);
            user.username = nextUsername;
            return [{ affectedRows: 1 }];
        }

        if (normalizedSql.startsWith('update users set status=?, role=?, password_hash=? where username=?')) {
            const [status, role, passwordHash, username] = params;
            const user = state.users.find(item => item.username === username);
            assert.ok(user, `user not found: ${username}`);
            user.status = status;
            user.role = role;
            user.password_hash = passwordHash;
            return [{ affectedRows: 1 }];
        }

        if (normalizedSql.startsWith('update users set status=?, role=? where username=?')) {
            const [status, role, username] = params;
            const user = state.users.find(item => item.username === username);
            assert.ok(user, `user not found: ${username}`);
            user.status = status;
            user.role = role;
            return [{ affectedRows: 1 }];
        }

        throw new Error(`Unhandled SQL in test: ${sql}`);
    }

    return {
        getPool() {
            return {
                query: handleQuery,
                execute: handleQuery,
            };
        },
        async transaction(handler) {
            return await handler({
                query: handleQuery,
                execute: handleQuery,
            });
        },
        __state: state,
    };
}

test('manual expiry override persists as permanent after reload and only updates the current card', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'user-store-expiry-override-'));
    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const mysqlMock = createMysqlMock({
        users: [
            {
                id: 1,
                username: 'admin5',
                password_hash: 'hashed-password',
                role: 'user',
                status: 'active',
                created_at: new Date('2026-03-01T00:00:00.000Z'),
            },
        ],
        cards: [
            {
                id: 11,
                code: 'TRIAL-OLD',
                type: 'T',
                description: '历史体验卡',
                days: 1,
                used_by: 1,
                used_at: new Date('2026-03-03T00:00:00.000Z'),
                enabled: 0,
                expires_at: new Date('2026-03-04T00:00:00.000Z'),
                expires_override: 0,
                created_at: new Date('2026-03-03T00:00:00.000Z'),
                updated_at: new Date('2026-03-03T00:00:00.000Z'),
            },
            {
                id: 12,
                code: 'TRIAL-NEW',
                type: 'T',
                description: '当前体验卡',
                days: 3,
                used_by: 1,
                used_at: new Date('2026-03-05T00:00:00.000Z'),
                enabled: 0,
                expires_at: new Date('2026-03-08T00:00:00.000Z'),
                expires_override: 0,
                created_at: new Date('2026-03-05T00:00:00.000Z'),
                updated_at: new Date('2026-03-05T00:00:00.000Z'),
            },
        ],
    });
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[userStoreModulePath];
        const userStore = require(userStoreModulePath);
        const security = require(securityModulePath);

        const updated = await userStore.updateUser('admin5', { expiresAt: null });
        assert.equal(updated.card.expiresAt, null);

        const reloadedUsers = await userStore.getAllUsers();
        const reloadedUser = reloadedUsers.find(user => user.username === 'admin5');
        assert.ok(reloadedUser);
        assert.equal(reloadedUser.card.code, 'TRIAL-NEW');
        assert.equal(reloadedUser.card.type, 'T');
        assert.equal(reloadedUser.card.expiresAt, null);

        const currentCard = mysqlMock.__state.cards.find(card => card.code === 'TRIAL-NEW');
        const historyCard = mysqlMock.__state.cards.find(card => card.code === 'TRIAL-OLD');
        assert.ok(currentCard);
        assert.ok(historyCard);
        assert.equal(currentCard.expires_override, 1);
        assert.equal(currentCard.expires_at, null);
        assert.equal(
            new Date(historyCard.expires_at).getTime(),
            new Date('2026-03-04T00:00:00.000Z').getTime(),
        );

        security.stopLoginLockCleanup();
    } finally {
        delete require.cache[userStoreModulePath];
        delete require.cache[securityModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
