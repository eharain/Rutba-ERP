#!/usr/bin/env node
'use strict';

/**
 * scripts/hostinger/ssh.js — Reusable SSH / SFTP helpers for Hostinger
 *
 * Exports:
 *   connect()            → Promise<Client>   (ready SSH connection)
 *   exec(conn, cmd)      → Promise<{ code, stdout, stderr }>
 *   withConnection(fn)   → runs fn(conn), auto-closes
 *   uploadFile(conn, localPath, remotePath) → Promise<void>
 *   writeRemoteFile(conn, remotePath, content) → Promise<void>
 */

const { Client } = require('ssh2');
const fs = require('fs');
const { SSH } = require('./hostinger.config');

/**
 * Open a ready SSH connection.
 * @returns {Promise<Client>}
 */
function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => resolve(conn))
      .on('error', reject)
      .connect(SSH);
  });
}

/**
 * Execute a command over SSH and collect output.
 * @param {Client} conn
 * @param {string} cmd
 * @param {{ stream?: boolean }} opts  If stream=true, pipe stdout/stderr live.
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function exec(conn, cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', (d) => {
        stdout += d;
        if (opts.stream) process.stdout.write(d);
      });
      stream.stderr.on('data', (d) => {
        stderr += d;
        if (opts.stream) process.stderr.write(d);
      });
      stream.on('close', (code) => resolve({ code: code || 0, stdout, stderr }));
    });
  });
}

/**
 * Open a connection, run `fn(conn)`, then close.
 * @param {(conn: Client) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withConnection(fn) {
  const conn = await connect();
  try {
    return await fn(conn);
  } finally {
    conn.end();
  }
}

/**
 * Upload a local file to a remote path via SFTP.
 * @param {Client} conn
 * @param {string} localPath
 * @param {string} remotePath
 * @returns {Promise<void>}
 */
function uploadFile(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const rs = fs.createReadStream(localPath);
      const ws = sftp.createWriteStream(remotePath);
      ws.on('close', () => { sftp.end(); resolve(); });
      ws.on('error', reject);
      rs.pipe(ws);
    });
  });
}

/**
 * Write string content to a remote file via SFTP.
 * @param {Client} conn
 * @param {string} remotePath
 * @param {string} content
 * @returns {Promise<void>}
 */
function writeRemoteFile(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile(remotePath, content, (writeErr) => {
        sftp.end();
        if (writeErr) return reject(writeErr);
        resolve();
      });
    });
  });
}

module.exports = { connect, exec, withConnection, uploadFile, writeRemoteFile };
