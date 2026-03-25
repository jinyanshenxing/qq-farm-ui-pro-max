const process = require('node:process');
const { loadProjectEnv } = require('./src/config/load-env');
/**
 * 主程序 - 进程管理器
 * 负责启动 Web 面板，并管理多个 Bot 子进程
 * 自动启动 AI 服务（OpenViking + 千问 3.5 Plus）
 */

loadProjectEnv();

const { startAdminServer, stopAdminServer, emitRealtimeStatus, emitRealtimeLog, emitRealtimeAccountLog, getIO } = require('./src/controllers/admin');
const { initMasterRuntimeDispatcher, disposeMasterRuntimeDispatcher } = require('./src/cluster/master-runtime');
const { createRuntimeEngine } = require('./src/runtime/runtime-engine');
const { registerRuntimeShutdownHandlers } = require('./src/runtime/graceful-shutdown');
const { createAiServiceRuntime, createMainShutdownRuntime } = require('./src/runtime/main-process-runtime');
const { createModuleLogger } = require('./src/services/logger');
const { initJobs } = require('./src/jobs/index');
const { initDatabase, closeDatabase } = require('./src/services/database');
const { createAnnouncementRuntime } = require('./src/services/announcement-materializer');
const { inspectSystemSettingsHealth } = require('./src/services/system-settings');
const { getServiceProfileConfig, resolveServiceProfileSnapshot } = require('./src/services/service-profile');

const mainLogger = createModuleLogger('main');
const announcementRuntime = createAnnouncementRuntime();

function buildStartupBlockMessage(err) {
    const message = String(err && err.message ? err.message : err || 'unknown');
    const details = [
        '系统检测到 MySQL 环境异常或增量迁移失败，为了防止产生级联错误风暴，已安全阻断启动。',
        '',
        '📋 已识别的高频原因：',
    ];

    if (/sql syntax|1064|syntax to use near/i.test(message)) {
        details.push('1. 当前数据库迁移 SQL 与你的 MySQL / MariaDB 语法不兼容。');
    } else if (/ECONNREFUSED|connect ECONNREFUSED|ETIMEDOUT/i.test(message)) {
        details.push('1. MySQL 服务未启动，或端口 / 主机地址不可达。');
    } else if (/Access denied/i.test(message)) {
        details.push('1. MySQL 用户名或密码错误。');
    } else if (/Unknown database/i.test(message)) {
        details.push('1. 目标数据库不存在，且当前账号没有自动建库权限。');
    } else {
        details.push('1. 数据库配置缺失、数据库离线，或增量迁移执行失败。');
    }

    details.push('2. 旧版 SQLite / JSON 数据尚未正确迁移到 MySQL。');
    details.push('3. 本地 `.env` / Shell 环境中的 MYSQL_* 或 REDIS_* 参数与实际服务不一致。');
    details.push('');
    details.push('💡 【处方建议】：');
    details.push('👉 本地直跑前先检查根目录 `.env`、MySQL 连通性以及账号密码是否正确');
    details.push('👉 不想折腾？请直接采用一键容器化启动。在根目录运行: docker compose -f deploy/docker-compose.yml up -d');
    details.push('👉 需要全新服务器一键部署？请运行: ./scripts/deploy/fresh-install.sh');
    return details.join('\n');
}

const isWorkerProcess = process.env.FARM_WORKER === '1';
const currentRole = process.env.ROLE || 'standalone';

if (isWorkerProcess) {
    require('./src/core/worker');
} else if (currentRole === 'worker') {
    // Phase 6 集群架构：纯粹的 Worker 执行节点
    (async () => {
        const { WorkerClient } = require('./src/cluster/worker-client');
        const workerClient = new WorkerClient(process.env.MASTER_URL, process.env.WORKER_TOKEN);
        try {
            await workerClient.init();
        } catch (err) {
            try {
                await workerClient.stop();
            } catch (shutdownErr) {
                mainLogger.warn('worker shutdown after bootstrap failure failed', {
                    error: shutdownErr && shutdownErr.message ? shutdownErr.message : String(shutdownErr),
                });
            }
            mainLogger.error('worker bootstrap failed', { error: err && err.message ? err.message : String(err) });
            process.exit(1);
        }
    })();
} else {
    // standalone 普通模式 或 master 模式
    (async () => {
        const aiServiceRuntime = createAiServiceRuntime({
            logger: mainLogger,
            loadAutostartModule: () => require('../scripts/service/ai-autostart'),
        });

        // 启动 AI 服务（无感知自动启动）
        aiServiceRuntime.start();

        try {
            await initDatabase();

            const store = require('./src/models/store');
            if (store.initStoreRuntime) {
                await store.initStoreRuntime();
            }

            const userStore = require('./src/models/user-store');
            if (userStore.loadAllFromDB) {
                await userStore.loadAllFromDB();
            }

            if (store.loadAllFromDB) {
                await store.loadAllFromDB({ refreshGlobalConfig: false });
            }

            try {
                const announcementSeedResult = await announcementRuntime.ensureAnnouncementsSeeded();
                if (announcementSeedResult.seeded) {
                    mainLogger.info('announcement bootstrap seeded entries', {
                        added: announcementSeedResult.added || 0,
                        updated: announcementSeedResult.updated || 0,
                        skipped: announcementSeedResult.skipped || 0,
                        totalParsed: announcementSeedResult.totalParsed || 0,
                        latestVersion: announcementSeedResult.latestVersion || '',
                        sources: announcementSeedResult.sources || {},
                    });
                }
            } catch (error) {
                mainLogger.warn('announcement bootstrap failed, continuing without blocking startup', {
                    error: error && error.message ? error.message : String(error),
                });
            }

            const settingsHealth = await inspectSystemSettingsHealth();
            if (settingsHealth.ok) {
                mainLogger.info(`system_settings self-check passed (${settingsHealth.items.length} keys ready)`);
            } else {
                mainLogger.warn('system_settings self-check found missing keys', {
                    missingRequiredKeys: settingsHealth.missingRequiredKeys,
                    fallbackWouldActivateKeys: settingsHealth.fallbackWouldActivateKeys,
                });
            }
        } catch (err) {
            try {
                await closeDatabase();
            } catch (closeErr) {
                mainLogger.warn('database cleanup after startup block failed', {
                    error: closeErr && closeErr.message ? closeErr.message : String(closeErr),
                });
            }
            try {
                await aiServiceRuntime.stop();
            } catch (stopErr) {
                mainLogger.warn('ai service cleanup after startup block failed', {
                    error: stopErr && stopErr.message ? stopErr.message : String(stopErr),
                });
            }
            console.error(`\n${  '='.repeat(70)}`);
            console.error('🚨 【致命启动拦截】数据库环境未就绪或表结构损坏！');
            console.error('='.repeat(70));
            console.error(buildStartupBlockMessage(err));
            console.error('\n[底层抛错信息]:', err.message);
            console.error(`${'='.repeat(70)  }\n`);
            process.exit(1);
        }

        let serviceProfileSnapshot = resolveServiceProfileSnapshot({
            env: process.env,
            config: null,
        });
        try {
            const serviceProfileConfig = await getServiceProfileConfig();
            serviceProfileSnapshot = resolveServiceProfileSnapshot({
                env: process.env,
                config: serviceProfileConfig,
            });
        } catch (error) {
            mainLogger.warn('service profile config load failed, using env fallback', {
                error: error && error.message ? error.message : String(error),
            });
        }

        const runtimeEngine = createRuntimeEngine({
            processRef: process,
            mainEntryPath: __filename,
            startAdminServer,
            stopAdminServer,
            onStatusSync: (accountId, status) => {
                emitRealtimeStatus(accountId, status);
            },
            onLog: (entry) => {
                emitRealtimeLog(entry);
            },
            onAccountLog: (entry) => {
                emitRealtimeAccountLog(entry);
            },
        });
        const jobRuntime = initJobs();
        const shutdownRuntime = createMainShutdownRuntime({
            logger: mainLogger,
            stopJobs: () => {
                if (jobRuntime && typeof jobRuntime.stop === 'function') {
                    jobRuntime.stop();
                }
            },
            disposeMasterDispatcher: () => {
                disposeMasterRuntimeDispatcher({
                    currentRole,
                    disposeDispatcher: require('./src/cluster/master-dispatcher').disposeDispatcher,
                    logger: mainLogger,
                });
            },
            stopRuntimeEngine: () => runtimeEngine.stop(),
            closeDatabase,
            stopAiServices: () => aiServiceRuntime.stop(),
        });
        registerRuntimeShutdownHandlers({
            processRef: process,
            runtimeEngine: shutdownRuntime,
            logger: mainLogger,
        });

        try {
            await runtimeEngine.start({
                startAdminServer: serviceProfileSnapshot.webPanelEnabled,
                autoStartAccounts: serviceProfileSnapshot.autoStartAccounts && currentRole !== 'master', // role为master时不再在这里挂起本地账号循环，而交由此处 dispatcher 管理下发
            });
            mainLogger.info(`系统启动完成 (模式: ${currentRole})`, {
                serviceProfile: serviceProfileSnapshot.profile,
                webPanelEnabled: serviceProfileSnapshot.webPanelEnabled,
                runtimeEnabled: serviceProfileSnapshot.runtimeEnabled,
                autoStartAccounts: serviceProfileSnapshot.autoStartAccounts,
            });

            initMasterRuntimeDispatcher({
                currentRole,
                getIO,
                initDispatcher: require('./src/cluster/master-dispatcher').initDispatcher,
                logger: mainLogger,
            });

        } catch (err) {
            try {
                await shutdownRuntime.stop();
            } catch (shutdownErr) {
                mainLogger.warn('runtime shutdown after bootstrap failure failed', {
                    error: shutdownErr && shutdownErr.message ? shutdownErr.message : String(shutdownErr),
                });
            }
            mainLogger.error('runtime bootstrap failed', { error: err && err.message ? err.message : String(err) });
            process.exit(1);
        }
    })();
}
