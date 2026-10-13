// Copies the images listed in public/textures/pack.json out of the Minecraft installation on
// this computer into public/textures/. They live inside the game's own jar (a zip archive);
// the newest installed version is used. Nothing is downloaded.
//
//   npm run textures                         (the launcher's default folder)
//   npm run textures -- "/path/to/version.jar"
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/textures/', import.meta.url));
const home = os.homedir();
const roots = [
  path.join(home, 'Library/Application Support/minecraft/versions'), // macOS
  process.env.APPDATA && path.join(process.env.APPDATA, '.minecraft/versions'), // Windows
  path.join(home, '.minecraft/versions'), // Linux
].filter(Boolean);

let jar = process.argv[2];
if (!jar) {
  const jars = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const v of fs.readdirSync(root)) {
      const p = path.join(root, v, `${v}.jar`);
      if (fs.existsSync(p)) jars.push({ p, at: fs.statSync(p).mtimeMs });
    }
  }
  jars.sort((a, b) => b.at - a.at);
  jar = jars[0] && jars[0].p;
}
if (!jar || !fs.existsSync(jar)) {
  console.error('No Minecraft installation found on this computer. Looked in:');
  for (const r of roots) console.error(`  ${r}`);
  console.error('Install the game and start it once, then try again, or give the path of a version file:');
  console.error('  npm run textures -- "/path/to/versions/1.x/1.x.jar"');
  process.exit(1);
}

const pack = JSON.parse(fs.readFileSync(path.join(out, 'pack.json'), 'utf8'));
const wanted = new Set();
(function collect(v) {
  if (typeof v === 'string') {
    if (/\.png$/i.test(v)) wanted.add(v);
  } else if (v && typeof v === 'object') Object.values(v).forEach(collect);
})(pack);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'geocrafter-'));
const inside = [...wanted].map((f) => `assets/minecraft/textures/${f}`);
try {
  // unzip where there is one; bsdtar (macOS, Windows) also reads zip archives
  try {
    execFileSync('unzip', ['-o', '-q', jar, ...inside, '-d', tmp], { stdio: 'ignore' });
  } catch (e) {
    if (!fs.existsSync(path.join(tmp, 'assets'))) execFileSync('tar', ['-xf', jar, '-C', tmp, ...inside], { stdio: 'ignore' });
  }
} catch (e) {
  // some files may be missing from this version; whatever came out is copied below
}
let copied = 0;
const missing = [];
for (const file of wanted) {
  const from = path.join(tmp, 'assets/minecraft/textures', file);
  if (!fs.existsSync(from)) {
    missing.push(file);
    continue;
  }
  const to = path.join(out, file);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Copied ${copied} image(s) (${path.basename(jar)}) -> public/textures/`);
if (missing.length) console.log(`${missing.length} file(s) not in this version keep the game's own drawing: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''}`);
