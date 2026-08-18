#!/usr/bin/env node
'use strict';

/**
 * scripts/js/dev-stop.js — Stop only Rutba's dev servers
 *
 * dev-stop.bat ran `taskkill /f /im node.exe`, which kills EVERY Node process
 * on the machine: editor language servers, agents, unrelated projects, and any
 * npm install in flight — the last of which leaves half-written node_modules
 * and the EPERM failures that follow.
 *
 * This instead resolves the owning PID of each port the manifest claims (plus
 * the gateway's shadow range and status port) and kills only those trees.
 * Nothing outside Rutba's own port allocation is touched.
 *
 * Normally you do not need this at all: `npm run dev` runs in one window and
 * Ctrl-C cleans up after itself. It exists for the case where a previous run
 * was killed abruptly and left a port held.
 */

const { execSync, spawnSync } = require('child_process');
const { services } = require('./dev-runtime');
const { SHADOW_OFFSET, STATUS_PORT } = require('./dev-gateway');

function rutbaPorts() {
  const ports = new Set([STATUS_PORT]);
  for (const s of services()) {
    if (!s.port) continue;
    ports.add(s.port);
    if (s.kind === 'app') ports.add(s.port + SHADOW_OFFSET);
  }
  return ports;
}

/** port → Set<pid>, from `netstat -ano` LISTENING rows. */
function listeners(ports) {
  let out = '';
  try {
    out = execSync('netstat -ano -p TCP', { encoding: 'utf8', windowsHide: true });
  } catch {
    console.error('Could not run netstat — nothing stopped.');
    return new Map();
  }

  const found = new Map();
  for (const line of out.split('\n')) {
    if (!/LISTENING/i.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    const local = cols[1] || '';
    const pid = Number(cols[cols.length - 1]);
    const port = Number(local.slice(local.lastIndexOf(':') + 1));
    if (!pid || pid === 0 || !ports.has(port)) continue;
    if (!found.has(port)) found.set(port, new Set());
    found.get(port).add(pid);
  }
  return found;
}

function main() {
  const found = listeners(rutbaPorts());

  if (!found.size) {
    console.log('No Rutba dev servers are listening — nothing to stop.');
    return;
  }

  const pids = new Set();
  for (const [port, set] of [...found].sort((a, b) => a[0] - b[0])) {
    for (const pid of set) {
      pids.add(pid);
      console.log(`  :${port}  pid ${pid}`);
    }
  }

  for (const pid of pids) {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore', shell: true, windowsHide: true,
    });
  }

  console.log(`\nStopped ${pids.size} process tree(s) across ${found.size} port(s).`);
  console.log('Node processes outside Rutba\'s port range were left alone.');
}

main();
