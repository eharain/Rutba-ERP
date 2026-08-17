#!/usr/bin/env node
'use strict';

/**
 * Issue and manage API tokens without the Strapi admin panel.
 *
 * Usage:
 *   node scripts/api-token.js list
 *   node scripts/api-token.js mint <name> [--type=full-access|read-only]
 *                                         [--days=<n>] [--description="..."]
 *   node scripts/api-token.js reveal <name|id>
 *   node scripts/api-token.js revoke <name|id>
 *
 * The access key is printed once, by `mint`. It is stored hashed, plus an
 * encrypted copy `reveal` can decrypt with the same ENCRYPTION_KEY — the same
 * arrangement Strapi uses, so tokens minted here work in both backends.
 *
 * Anything printed here is a credential. It lands in your shell history and
 * your terminal scrollback: treat the output accordingly.
 */

const tokens = require('../src/policy/tokens');
const { getDb, closeDb } = require('../src/db/connection');

function parseArgs(argv) {
  const out = { command: null, target: null, type: 'full-access', days: null, description: '' };
  for (const arg of argv) {
    if (arg.startsWith('--type=')) out.type = arg.slice('--type='.length);
    else if (arg.startsWith('--days=')) out.days = Number(arg.slice('--days='.length));
    else if (arg.startsWith('--description=')) out.description = arg.slice('--description='.length);
    else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
    else if (!out.command) out.command = arg;
    else if (!out.target) out.target = arg;
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!out.command) out.command = 'list';
  if (!['list', 'mint', 'reveal', 'revoke'].includes(out.command)) {
    throw new Error(`unknown command '${out.command}' — expected list, mint, reveal or revoke`);
  }
  if (out.command !== 'list' && !out.target) throw new Error(`${out.command} needs a token name`);
  return out;
}

function printRow(t) {
  const expiry = t.expiresAt ? new Date(t.expiresAt).toISOString().slice(0, 10) : 'never';
  const used = t.lastUsedAt ? new Date(t.lastUsedAt).toISOString().slice(0, 10) : 'never used';
  console.log(`  ${String(t.id).padStart(3)}  ${t.type.padEnd(12)} expires ${expiry.padEnd(10)} ${used.padEnd(11)} ${t.name}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[token] database: ${getDb().client.config.connection.database}`);

  if (args.command === 'list') {
    const rows = await tokens.list();
    console.log(`[token] ${rows.length} token(s)`);
    rows.forEach(printRow);
    return 0;
  }

  if (args.command === 'mint') {
    const { token, accessKey } = await tokens.mint({
      name: args.target,
      description: args.description,
      type: args.type,
      lifespanDays: args.days,
    });
    console.log(`[token] minted '${token.name}' (${token.type}, expires ${token.expiresAt ? new Date(token.expiresAt).toISOString() : 'never'})`);
    console.log('[token] access key — copy it now, it is not printed again:\n');
    console.log(accessKey);
    console.log('');
    return 0;
  }

  if (args.command === 'reveal') {
    const { token, accessKey } = await tokens.reveal(args.target);
    console.log(`[token] '${token.name}' (${token.type})\n`);
    console.log(accessKey);
    console.log('');
    return 0;
  }

  const removed = await tokens.revoke(args.target);
  console.log(`[token] revoked '${removed.name}' (id ${removed.id}) — anything using it now gets 401`);
  return 0;
}

main()
  .then(async (code) => { await closeDb(); process.exit(code); })
  .catch(async (err) => {
    console.error(`[token] ${err.message}`);
    try { await closeDb(); } catch { /* already closing */ }
    process.exit(1);
  });
