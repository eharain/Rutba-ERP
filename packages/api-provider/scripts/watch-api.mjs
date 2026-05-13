#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const apiDir = path.join(packageRoot, 'api');
const endpointsDir = path.join(packageRoot, 'endpoints');

const TAG = '\x1b[36m[api-provider:watch]\x1b[0m';
const ERR = '\x1b[31m[api-provider:watch]\x1b[0m';

const DEBOUNCE_MS = 200;
let pending = null;
let running = false;
let queuedAgain = false;

function runScaffold(reason) {
    if (running) {
        queuedAgain = true;
        return;
    }
    running = true;
    console.log(`${TAG} scaffolding (${reason})`);

    const child = spawn('node', [path.join(__dirname, 'scaffold-endpoint-providers.mjs')], {
        cwd: packageRoot,
        stdio: 'inherit',
        env: process.env,
    });

    child.on('exit', (code) => {
        running = false;
        if (code) console.error(`${ERR} scaffolder exited with code ${code}`);
        if (queuedAgain) {
            queuedAgain = false;
            runScaffold('queued change');
        }
    });

    child.on('error', (err) => {
        running = false;
        console.error(`${ERR} ${err.message}`);
    });
}

function schedule(reason) {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
        pending = null;
        runScaffold(reason);
    }, DEBOUNCE_MS);
}

function watchDir(dir, label) {
    if (!fs.existsSync(dir)) {
        console.warn(`${TAG} skipping ${label} — directory does not exist`);
        return;
    }
    try {
        const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            if (!filename.endsWith('.js')) return;
            schedule(`${label}/${String(filename).replace(/\\/g, '/')}`);
        });
        watcher.on('error', (err) => console.error(`${ERR} ${label}: ${err.message}`));
        console.log(`${TAG} watching ${label}`);
    } catch (err) {
        console.error(`${ERR} unable to watch ${label}: ${err.message}`);
    }
}

runScaffold('initial');
watchDir(apiDir, 'api');
watchDir(endpointsDir, 'endpoints');

function cleanup() {
    if (pending) clearTimeout(pending);
    process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
