#!/usr/bin/env node
/**
 * Static server for the video-maker A/B harness.
 *
 * On start it materializes `baseline.js` — the renderer as it was at the v2
 * checkpoint named in docs/todo/video-studio-timeline-plan.md — straight out
 * of git history, so the page can import the old and the new side by side and
 * byte-compare their frames. The baseline file is generated, never committed;
 * override the ref with AB_BASELINE_REF when comparing against something else.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = Number(process.env.PORT) || 4890;
const HARNESS = __dirname;
const PKG = path.resolve(__dirname, '..');
const REPO = path.resolve(PKG, '..', '..');
const BASELINE_REF = process.env.AB_BASELINE_REF || '90e15fa';

const baselinePath = path.join(HARNESS, 'baseline.js');
const src = execSync(`git show ${BASELINE_REF}:packages/video-maker/index.js`, { cwd: REPO, maxBuffer: 16e6 });
fs.writeFileSync(baselinePath, src);
console.log(`baseline.js <- ${BASELINE_REF} (${src.length} bytes)`);

const ROUTES = {
    '/': () => [path.join(HARNESS, 'ab.html'), 'text/html'],
    '/ab.html': () => [path.join(HARNESS, 'ab.html'), 'text/html'],
    '/baseline.js': () => [baselinePath, 'text/javascript'],
    '/current.js': () => [path.join(PKG, 'index.js'), 'text/javascript'],
};

http.createServer((req, res) => {
    const route = ROUTES[new URL(req.url, 'http://x').pathname];
    if (!route) { res.writeHead(404); res.end('not found'); return; }
    try {
        const [file, type] = route();
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
        res.end(fs.readFileSync(file));
    } catch (e) {
        res.writeHead(500);
        res.end(String(e.message));
    }
}).listen(PORT, () => console.log(`video-maker A/B harness on http://localhost:${PORT}/`));
