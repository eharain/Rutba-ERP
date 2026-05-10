import fs from 'fs';
import path from 'path';

const root = path.resolve('packages/api-provider/api');
const includeArg = process.argv[2];
const include = includeArg ? new Set(includeArg.split(',').map(s => s.trim()).filter(Boolean)) : null;
const files = fs.readdirSync(root)
  .filter(f => f.endsWith('.js'))
  .filter(f => !include || include.has(f));

const blockPattern = /\n\s*(fetch|post|put|del|patch)\w*\s*:\s*(async\s*)?\([^\)]*\)\s*=>\s*\{[\s\S]*?authApi\.[\s\S]*?\n\s*\},?/g;
const oneLinePattern = /\n\s*(fetch|post|put|del|patch)\w*\s*:\s*(async\s*)?\([^\)]*\)\s*=>\s*authApi\.[^\n]*,?/g;
const objectAssignPattern = /\nObject\.assign\([^\)]*\{[\s\S]*?authApi\.[\s\S]*?\}\);?/g;

let changed = [];
for (const file of files) {
  const p = path.join(root, file);
  let text = fs.readFileSync(p, 'utf8');
  const original = text;

  text = text.replace(objectAssignPattern, '\n');
  text = text.replace(blockPattern, '\n');
  text = text.replace(oneLinePattern, '\n');

  // Remove duplicate commas caused by deletions
  text = text.replace(/,\s*,/g, ',');
  // Normalize extra blank lines inside endpoint objects
  text = text.replace(/\n{3,}/g, '\n\n');

  if (text !== original) {
    fs.writeFileSync(p, text, 'utf8');
    changed.push(file);
  }
}

console.log(`Changed ${changed.length} files`);
for (const f of changed) console.log(f);
