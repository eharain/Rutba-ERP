#!/usr/bin/env node
/**
 * Thin CLI over `createBridge`. Everything process-shaped lives here — arg
 * parsing, signal handling, exit codes — so the library stays hostable by
 * something that already owns the process (the Electron main process, §11).
 *
 *   node bin/bridge.js --upstream http://localhost:4020 --port 4030
 *   RUTBA_BRIDGE_UPSTREAM=http://localhost:4020 npm start
 */

import { createBridge } from '../index.js';
import { VERSION } from '../lib/version.js';

const USAGE = `rutba sync-bridge ${VERSION} — transparent pass-through proxy

  --upstream <url>   base URL of the real API   (env RUTBA_BRIDGE_UPSTREAM)
  --port <n>         port to listen on          (env RUTBA_BRIDGE_PORT, default 4030)
  --host <addr>      interface to bind          (env RUTBA_BRIDGE_HOST, default 127.0.0.1)
  --log <level>      off | summary | headers    (env RUTBA_BRIDGE_LOG, default summary)
  --status-path <p>  the bridge's own route     (default /bridge/status)
  --version, --help
`;

function parseArgs(argv) {
    const options = {};
    const flags = {
        '--upstream': 'upstream',
        '--port': 'port',
        '--host': 'host',
        '--log': 'log',
        '--status-path': 'statusPath',
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') return { help: true };
        if (arg === '--version' || arg === '-v') return { version: true };

        const eq = arg.indexOf('=');
        const name = eq < 0 ? arg : arg.slice(0, eq);
        const key = flags[name];
        if (!key) throw new Error(`unknown argument: ${arg}`);

        const value = eq < 0 ? argv[++i] : arg.slice(eq + 1);
        if (value === undefined) throw new Error(`${name} needs a value`);
        options[key] = value;
    }
    return { options };
}

async function main() {
    let parsed;
    try {
        parsed = parseArgs(process.argv.slice(2));
    } catch (err) {
        console.error(`sync-bridge: ${err.message}\n\n${USAGE}`);
        process.exitCode = 2;
        return;
    }

    if (parsed.help) { console.log(USAGE); return; }
    if (parsed.version) { console.log(VERSION); return; }

    let bridge;
    try {
        bridge = createBridge(parsed.options);
        await bridge.listen();
    } catch (err) {
        console.error(`sync-bridge: ${err.message}`);
        console.error(USAGE);
        process.exitCode = 1;
        return;
    }

    let closing = false;
    const shutdown = async (signal) => {
        if (closing) return;
        closing = true;
        console.log(`[bridge] ${signal} — shutting down`);
        await bridge.close();
        process.exitCode = 0;
    };
    process.on('SIGINT', () => { shutdown('SIGINT'); });
    process.on('SIGTERM', () => { shutdown('SIGTERM'); });
}

main();
