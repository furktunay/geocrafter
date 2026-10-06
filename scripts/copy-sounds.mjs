// Copies the sounds listed in public/sounds/pack.json out of the Minecraft installation on this
// computer into public/sounds/. The launcher keeps its assets as hash-named objects; the newest
// index file says which object is which sound. Nothing is downloaded.
//
//   npm run sounds                      (the launcher's default folder)
//   npm run sounds -- "/path/to/assets" (another launcher: the folder holding indexes/ and objects/)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/sounds/', import.meta.url));
const home = os.homedir();
const places = [
  process.argv[2],
  path.join(home, 'Library/Application Support/minecraft/assets'), // macOS
  process.env.APPDATA && path.join(process.env.APPDATA, '.minecraft/assets'), // Windows
  path.join(home, '.minecraft/assets'), // Linux
].filter(Boolean);
const assets = places.find((dir) => fs.existsSync(path.join(dir, 'indexes')) && fs.existsSync(path.join(dir, 'objects')));
if (!assets) {
  console.error('Bu bilgisayarda Minecraft kurulumu bulunamadı. Bakılan yerler:');
  for (const p of places) console.error(`  ${p}`);
  console.error('Oyunu kurup bir kez açtıktan sonra tekrar dene, ya da assets klasörünün yolunu ver:');
  console.error('  npm run sounds -- "/yol/assets"');
  process.exit(1);
}

const indexes = fs.readdirSync(path.join(assets, 'indexes'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ f, at: fs.statSync(path.join(assets, 'indexes', f)).mtimeMs }))
  .sort((a, b) => b.at - a.at);
if (!indexes.length) {
  console.error(`${assets}/indexes boş: oyunu bir kez açıp kapat, sonra tekrar dene.`);
  process.exit(1);
}
const objects = JSON.parse(fs.readFileSync(path.join(assets, 'indexes', indexes[0].f), 'utf8')).objects || {};
const pack = JSON.parse(fs.readFileSync(path.join(out, 'pack.json'), 'utf8'));
const wanted = new Set(Object.values(pack).flat().filter((v) => typeof v === 'string'));

let copied = 0;
const missing = [];
for (const file of wanted) {
  const entry = objects[`minecraft/sounds/${file}`];
  const from = entry && path.join(assets, 'objects', entry.hash.slice(0, 2), entry.hash);
  if (!from || !fs.existsSync(from)) {
    missing.push(file);
    continue;
  }
  const to = path.join(out, file);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
}
console.log(`${copied} ses dosyası kopyalandı (${indexes[0].f}) -> public/sounds/`);
if (missing.length) console.log(`Kurulumda bulunamayan ${missing.length} dosya üretilen sesiyle kalacak: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''}`);
