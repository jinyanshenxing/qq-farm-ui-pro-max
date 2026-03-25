#!/usr/bin/env node

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.FARM_FALLBACK_CONSOLE_LEVEL = process.env.FARM_FALLBACK_CONSOLE_LEVEL || 'silent';

const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');
const { initMysql, closeMysql } = require('../src/services/mysql-db');
const {
    getSystemUpdateRuntime,
} = require('../src/services/system-update-config');
const {
    appendUpdateJobLog,
    claimNextUpdateJob,
    getUpdateJobById,
    normalizeExecutionPhase,
    updateUpdateJob,
} = require('../src/services/system-update-jobs');
const {
    saveAgentHeartbeat,
    saveActiveJobRuntime,
    saveClusterNodeDrainState,
} = require('../src/services/system-update-runtime');
const { createAnnouncementRuntime } = require('../src/services/announcement-materializer');

function parseArgs(argv = []) {
    const args = {
        _: [],
    };
    for (let index = 0; index < argv.length; index += 1) {
        const token = String(argv[index] || '');
        if (!token.startsWith('--')) {
            args._.push(token);
            continue;
        }
        const eqIndex = token.indexOf('=');
        if (eqIndex > 0) {
            const key = token.slice(2, eqIndex);
            args[key] = token.slice(eqIndex + 1);
            continue;
        }
        const key = token.slice(2);
        const next = argv[index + 1];
        if (next !== undefined && !String(next).startsWith('--')) {
            args[key] = next;
            index += 1;
            continue;
        }
        args[key] = '1';
    }
    return args;
}

function parseJson(value, fallback = null) {
    if (!value) return fallback;
    try {
        return JSON.parse(String(value));
    } catch {
        return fallback;
    }
}

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    return fallback;
}

function normalizeNodeIdList(input) {
    const items = Array.isArray(input)
        ? input
        : String(input || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    return Array.from(new Set(items.map(item => String(item || '').trim()).filter(Boolean)));
}

function printJson(payload) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function printClaim(job, format) {
    if (!job) {
        if (format === 'tsv') {
            process.stdout.write('NONE\n');
            return;
        }
        printJson({ ok: true, job: null });
        return;
    }

    if (format === 'tsv') {
        const optionFlags = job && job.payload && job.payload.options && typeof job.payload.options === 'object'
            ? job.payload.options
            : {};
        const fields = [
            'JOB',
            String(job.id || ''),
            String(job.jobKey || ''),
            String(job.scope || ''),
            String(job.strategy || ''),
            String(job.targetVersion || ''),
            String(job.sourceVersion || ''),
            job.preserveCurrent ? '1' : '0',
            job.requireDrain ? '1' : '0',
            Array.isArray(job.drainNodeIds) ? job.drainNodeIds.join(',') : '',
            String(job.kind || ''),
            String(job.executionPhase || ''),
            optionFlags.syncAnnouncements ? '1' : '0',
            optionFlags.runVerification === false ? '0' : '1',
            optionFlags.allowAutoRollback ? '1' : '0',
            optionFlags.includeDeployTemplates ? '1' : '0',
        ];
        process.stdout.write(`${fields.join('\t')}\n`);
        return;
    }

    printJson({ ok: true, job });
}

function printJob(job, format) {
    if (!job) {
        if (format === 'tsv') {
            process.stdout.write('NONE\n');
            return;
        }
        printJson({ ok: true, job: null });
        return;
    }

    if (format === 'tsv') {
        const fields = [
            'JOB',
            String(job.id || ''),
            String(job.jobKey || ''),
            String(job.status || ''),
            String(job.executionPhase || ''),
            String(job.claimAgentId || ''),
            String(job.startedAt || 0),
            String(job.finishedAt || 0),
        ];
        process.stdout.write(`${fields.join('\t')}\n`);
        return;
    }

    printJson({ ok: true, job });
}

function printRuntime(runtime, format, options = {}) {
    if (format !== 'tsv') {
        printJson({ ok: true, runtime });
        return;
    }

    const nodeIdFilter = new Set(normalizeNodeIdList(options.nodeIds));
    const nodes = Array.isArray(runtime && runtime.clusterNodes) ? runtime.clusterNodes : [];
    if (nodes.length === 0) {
        process.stdout.write('NONE\n');
        return;
    }

    let printed = 0;
    for (const node of nodes) {
        const nodeId = String(node && node.nodeId || '').trim();
        if (!nodeId) continue;
        if (nodeIdFilter.size > 0 && !nodeIdFilter.has(nodeId)) continue;
        const fields = [
            'NODE',
            nodeId,
            node.connected ? '1' : '0',
            node.draining ? '1' : '0',
            String(Number.parseInt(node.assignedCount, 10) || 0),
            String(node.status || ''),
            String(Number.parseInt(node.updatedAt, 10) || 0),
            String(node.version || ''),
        ];
        process.stdout.write(`${fields.join('\t')}\n`);
        printed += 1;
    }

    if (printed === 0) {
        process.stdout.write('NONE\n');
    }
}

async function handleHeartbeat(args) {
    const agentId = String(args['agent-id'] || args.agentId || process.env.UPDATE_AGENT_ID || '').trim();
    if (!agentId) {
        throw new Error('agent-id is required');
    }

    const runtime = await saveAgentHeartbeat({
        nodeId: agentId,
        role: args.role || 'host_agent',
        status: args.status || 'idle',
        version: args.version || version,
        managedNodeIds: normalizeNodeIdList(args['managed-node-ids'] || args.managedNodeIds || ''),
        jobId: args['job-id'] || args.jobId || 0,
        jobStatus: args['job-status'] || args.jobStatus || '',
        targetVersion: args['target-version'] || args.targetVersion || '',
    });

    printJson({ ok: true, runtime });
}

async function handleClaim(args) {
    const agentId = String(args['agent-id'] || args.agentId || process.env.UPDATE_AGENT_ID || '').trim();
    if (!agentId) {
        throw new Error('agent-id is required');
    }

    const job = await claimNextUpdateJob(agentId);
    await saveAgentHeartbeat({
        nodeId: agentId,
        role: 'host_agent',
        status: job ? 'claimed' : 'idle',
        version,
        managedNodeIds: normalizeNodeIdList(args['managed-node-ids'] || args.managedNodeIds || ''),
        jobId: job ? job.id : 0,
        jobStatus: job ? job.status : '',
        targetVersion: job ? job.targetVersion : '',
    });
    await saveActiveJobRuntime(job);
    printClaim(job, String(args.format || 'json').trim());
}

async function handleSetJobStatus(args) {
    const jobId = String(args['job-id'] || args.jobId || '').trim();
    const status = String(args.status || '').trim();
    const agentId = String(args['agent-id'] || args.agentId || process.env.UPDATE_AGENT_ID || '').trim();
    if (!jobId) {
        throw new Error('job-id is required');
    }
    if (!status) {
        throw new Error('status is required');
    }

    const executionPhase = normalizeExecutionPhase(args.phase || args['execution-phase'] || '', '');
    const now = Date.now();
    const resultPayload = parseJson(args['result-json'] || args.resultJson || '', null);
    const verificationPayload = parseJson(args['verification-json'] || args.verificationJson || '', null);
    const rollbackPayload = parseJson(args['rollback-payload-json'] || args.rollbackPayloadJson || '', null);
    const preflightPayload = parseJson(args['preflight-json'] || args.preflightJson || '', null);
    const failureCategory = String(args['failure-category'] || args.failureCategory || '').trim();
    if (resultPayload && failureCategory && !resultPayload.failureCategory) {
        resultPayload.failureCategory = failureCategory;
    }
    const patch = {
        status,
        claimAgentId: agentId,
        progressPercent: args.progress || args['progress-percent'],
        summaryMessage: args.summary || '',
        errorMessage: args.error || '',
        result: resultPayload,
        verification: verificationPayload,
        rollbackPayload,
        preflight: preflightPayload,
    };
    if (executionPhase) {
        patch.executionPhase = executionPhase;
    }
    if (status === 'running') {
        patch.startedAt = now;
    }
    if (status === 'succeeded' || status === 'failed' || status === 'cancelled') {
        patch.finishedAt = now;
        if (patch.progressPercent === undefined) {
            patch.progressPercent = status === 'succeeded' ? 100 : 0;
        }
    }

    const job = await updateUpdateJob(jobId, patch);
    if (!job) {
        throw new Error(`job not found: ${jobId}`);
    }

    const logMessage = String(args['log-message'] || args.logMessage || patch.summaryMessage || '').trim();
    if (logMessage) {
        await appendUpdateJobLog({
            jobId: job.id,
            phase: executionPhase || patch.executionPhase || job.executionPhase || 'queued',
            level: args['log-level'] || args.logLevel || (status === 'failed' ? 'error' : 'info'),
            message: logMessage,
            payload: parseJson(args['log-payload-json'] || args.logPayloadJson || '', null)
                || resultPayload
                || verificationPayload
                || rollbackPayload
                || preflightPayload
                || null,
        });
    }

    await saveActiveJobRuntime(
        status === 'running' || status === 'claimed' ? job : null,
        { lastError: status === 'failed' ? patch.errorMessage : '' },
    );
    if (agentId) {
        await saveAgentHeartbeat({
            nodeId: agentId,
            role: 'host_agent',
            status: status === 'failed' ? 'error' : (status === 'succeeded' ? 'idle' : status),
            version,
            managedNodeIds: normalizeNodeIdList(args['managed-node-ids'] || args.managedNodeIds || ''),
            jobId: status === 'succeeded' || status === 'failed' || status === 'cancelled' ? 0 : job.id,
            jobStatus: job.status,
            targetVersion: job.targetVersion,
        });
    }

    printJson({ ok: true, job });
}

async function handleSyncAnnouncements(args) {
    const projectRoot = path.resolve(__dirname, '../..');
    const runtime = createAnnouncementRuntime({
        fsRef: fs,
        pathRef: path,
        projectRoot,
    });
    const result = await runtime.materializeAnnouncements({
        createdBy: String(args['created-by'] || args.createdBy || 'update_agent').trim() || 'update_agent',
        sourceTypes: normalizeNodeIdList(args['source-types'] || args.sourceTypes || ''),
        limit: args.limit,
        dryRun: parseBoolean(args['dry-run'] || args.dryRun, false),
        markInstalled: args['mark-installed'] || args.markInstalled || '',
    });
    printJson({ ok: true, result });
}

async function handleSetNodeDrain(args) {
    const nodeId = String(args['node-id'] || args.nodeId || '').trim();
    if (!nodeId) {
        throw new Error('node-id is required');
    }

    const draining = parseBoolean(args.draining, true);
    const runtime = await saveClusterNodeDrainState(nodeId, draining, {
        updatedBy: args['updated-by'] || args.updatedBy || args['agent-id'] || args.agentId || 'update-agent',
    });
    const node = (runtime.clusterNodes || []).find(item => String(item.nodeId || '').trim() === nodeId) || null;
    printJson({ ok: true, node, runtime });
}

async function handleGetRuntime(args) {
    const runtime = await getSystemUpdateRuntime();
    printRuntime(runtime, String(args.format || 'json').trim(), {
        nodeIds: args['node-ids'] || args.nodeIds || '',
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const command = String(args._[0] || '').trim();
    if (!command) {
        throw new Error('command is required');
    }

    await initMysql();
    try {
        switch (command) {
            case 'heartbeat':
                await handleHeartbeat(args);
                break;
            case 'claim':
                await handleClaim(args);
                break;
            case 'set-job-status':
                await handleSetJobStatus(args);
                break;
            case 'set-node-drain':
                await handleSetNodeDrain(args);
                break;
            case 'get-runtime':
                await handleGetRuntime(args);
                break;
            case 'sync-announcements':
                await handleSyncAnnouncements(args);
                break;
            case 'get-job': {
                const job = await getUpdateJobById(args['job-id'] || args.jobId || args._[1] || '');
                printJob(job, String(args.format || 'json').trim());
                break;
            }
            default:
                throw new Error(`unknown command: ${command}`);
        }
    } finally {
        await closeMysql().catch(() => {});
    }
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
        process.exit(1);
    });
}

module.exports = {
    parseArgs,
};
