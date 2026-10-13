// Removes everything under public/sounds/ or public/textures/ that the folder's pack.json does
// not name. A whole copied folder holds thousands of files; the game uses only the listed ones.
//
//   npm run sounds:prune
//   npm run textures:prune
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = process.argv[2];
if (folder !== 'sounds' && folder !== 'textures') {
  console.error('Usage: node scripts/prune-pack.mjs sounds | textures');
  process.exit(1);
}
const out = fileURLToPath(new URL(`../public/${folder}/`, import.meta.url));
const pack = JSON.parse(fs.readFileSync(path.join(out, 'pack.json'), 'utf8'));

// every file name anywhere in pack.json ("a.ogg", ["a.ogg"], { file: "a.png", tint: "#fff" })
const keep = new Set(['pack.json']);
(function collect(v) {
  if (typeof v === 'string') {
    if (/\.[a-z0-9]{2,4}$/i.test(v)) keep.add(v);
  } else if (v && typeof v === 'object') Object.values(v).forEach(collect);
})(pack);

let removed = 0, bytes = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(p);
      if (!fs.readdirSync(p).length) fs.rmdirSync(p);
    } else if (!keep.has(path.relative(out, p).split(path.sep).join('/'))) {
      bytes += fs.statSync(p).size;
      fs.unlinkSync(p);
      removed++;
    }
  }
}
walk(out);
console.log(`Removed ${removed} unused file(s) (${(bytes / 1048576).toFixed(1)} MB). Kept: pack.json and the ${keep.size - 1} file(s) it names.`);
