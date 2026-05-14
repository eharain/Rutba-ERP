#!/usr/bin/env node
/**
 * api-provider watcher — opt-in process for developers actively editing
 * `packages/api-provider/api/`. Re-runs the scaffolder when descriptors change.
 *
 * Not invoked by any dev/build/start flow. Run it yourself in a side terminal
 * while you're touching api descriptors:
 *
 *   npm run watch --workspace=@rutba/api-provider
 *
 * Otherwise the scaffolder runs once at process startup via `load-env.js` —
 * that's enough for downstream apps to see your descriptor changes after a
 * server restart.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const apiDir = path.join(packageRoot, 'api');

const DEBOUNCE_MS = 500;
let timer = null;

function runScaffold() {
    const child = spawn('node', [path.join(__dirname, 'scaffold-endpoint-providers.mjs')], {
        cwd: packageRoot,
        stdio: 'inherit',
        env: process.env,
    });
    child.on('exit', (code) => {
        if (code) console.error(`[api-provider:watch] scaffolder exited with code ${code}`);
    });
}

function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = null;
        runScaffold();
    }, DEBOUNCE_MS);
}

if (!fs.existsSync(apiDir)) {
    console.error(`[api-provider:watch] api directory missing: ${apiDir}`);
    process.exit(1);
}

console.log(`[api-provider:watch] watching ${apiDir}`);
runScaffold();
fs.watch(apiDir, { recursive: true }, (_eventType, filename) => {
    if (!filename || !filename.endsWith('.js')) return;
    schedule();
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
