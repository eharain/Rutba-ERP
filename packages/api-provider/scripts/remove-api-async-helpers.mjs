import fs from 'fs';
import path from 'path';

const apiDir = path.resolve('packages/api-provider/api');
const files = fs.readdirSync(apiDir).filter((f) => f.endsWith('.js'));

const asyncMethodPattern = /\n\s*[A-Za-z_$][\w$]*\s*:\s*async\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s*\},?/g;
const staleAsyncCommentPattern = /\n\s*\/\*\*\s*Async:[\s\S]*?\*\/\s*/g;

let changed = [];
for (const file of files) {
  const fullPath = path.join(apiDir, file);
  const original = fs.readFileSync(fullPath, 'utf8');
  let text = original;

  text = text.replace(asyncMethodPattern, '\n');
  text = text.replace(staleAsyncCommentPattern, '\n');

  text = text.replace(/,\s*,/g, ',');
  text = text.replace(/\n{3,}/g, '\n\n');

  if (text !== original) {
    fs.writeFileSync(fullPath, text, 'utf8');
    changed.push(file);
  }
}

console.log(`Removed async helpers/comments in ${changed.length} files`);
for (const f of changed) console.log(f);
