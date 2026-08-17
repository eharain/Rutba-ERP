'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const targetBase = process.env.TARGET_BASE_URL || 'http://localhost:4010';
const listenPort = Number(process.env.PROXY_PORT || 4020);
const logBody = String(process.env.PROXY_LOG_BODY || 'false').toLowerCase() === 'true';

const targetUrl = new URL(targetBase);
const client = targetUrl.protocol === 'https:' ? https : http;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeText(buffer) {
  if (!buffer || !buffer.length) return '';
  const text = buffer.toString('utf8');
  return text.length > 1200 ? `${text.slice(0, 1200)}...<truncated>` : text;
}

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  const incomingBody = await readBody(req);

  const headers = { ...req.headers };
  headers.host = targetUrl.host;
  headers['content-length'] = String(incomingBody.length);

  const options = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    method: req.method,
    path: req.url,
    headers,
  };

  const outbound = client.request(options, (upstream) => {
    const responseChunks = [];

    res.writeHead(upstream.statusCode || 500, upstream.headers);
    upstream.on('data', (chunk) => {
      responseChunks.push(chunk);
      res.write(chunk);
    });

    upstream.on('end', () => {
      res.end();
      const ms = Date.now() - start;
      const status = upstream.statusCode || 0;
      const marker = status >= 400 ? 'FAIL' : 'PASS';
      const appHeader = req.headers['x-rutba-app'] || '-';
      const adminHeader = req.headers['x-rutba-app-admin'] || '-';
      console.log(`${marker} ${req.method} ${req.url} -> ${status} (${ms}ms) [app=${appHeader} admin=${adminHeader}]`);
      if (logBody) {
        const reqBodyText = safeText(incomingBody);
        const resBodyText = safeText(Buffer.concat(responseChunks));
        if (reqBodyText) console.log(`  req: ${reqBodyText}`);
        if (resBodyText) console.log(`  res: ${resBodyText}`);
      }
    });
  });

  outbound.on('error', (err) => {
    const ms = Date.now() - start;
    console.error(`ERROR ${req.method} ${req.url} -> ${err.message} (${ms}ms)`);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'Proxy upstream error', message: err.message }));
  });

  if (incomingBody.length) {
    outbound.write(incomingBody);
  }
  outbound.end();
});

server.listen(listenPort, () => {
  console.log(`Strapi proxy listening on http://localhost:${listenPort}`);
  console.log(`Forwarding to ${targetBase}`);
  console.log(`Body logging: ${logBody}`);
});
