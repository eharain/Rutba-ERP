const fs = require('fs');
const path = require('path');

const distServerDir = path.resolve(__dirname, '..', 'dist', 'server');
const pkgPath = path.join(distServerDir, 'package.json');

if (!fs.existsSync(distServerDir)) {
  fs.mkdirSync(distServerDir, { recursive: true });
}

const content = JSON.stringify({ type: 'commonjs' }, null, 2) + '\n';
fs.writeFileSync(pkgPath, content, 'utf8');
console.log('[api-pro] ensured dist/server/package.json');
