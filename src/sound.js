// Sound effects. Every sound is synthesised here, so the game needs no audio files; a sound
// pack (see loadPack) can replace any of them with recordings. The audio context starts on the
// first user gesture.
let ctx = null;
let master = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(seconds) {
  const a = audio();
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}

// Filtered noise burst with an exponential fade.
function burst({ dur, freq, q = 1, type = 'lowpass', gain = 0.6, sweep = 0 }) {
  const a = audio();
  if (!a) return;
  const src = noise(dur);
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, a.currentTime + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  src.connect(f).connect(g).connect(master);
  src.start();
}

function tone({ from, to, dur, gain = 0.5, type = 'sine' }) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, a.currentTime);
  o.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(a.currentTime + dur);
}

// Digging sounds by material (the same names a sound pack uses: dig/<material>N).
const DIG = {
  stone: () => burst({ dur: 0.16, freq: 900, sweep: 300, gain: 0.5 }),
  grass: () => burst({ dur: 0.2, freq: 1400, type: 'bandpass', q: 0.7, gain: 0.4, sweep: 600 }),
  gravel: () => burst({ dur: 0.22, freq: 700, sweep: 250, gain: 0.55 }),
  sand: () => burst({ dur: 0.22, freq: 2600, type: 'highpass', gain: 0.2, sweep: 1200 }),
  snow: () => burst({ dur: 0.2, freq: 3200, type: 'highpass', gain: 0.16, sweep: 1500 }),
  cloth: () => burst({ dur: 0.14, freq: 500, gain: 0.4, sweep: 200 }),
  wood: () => {
    burst({ dur: 0.1, freq: 700, gain: 0.4 });
    tone({ from: 190, to: 110, dur: 0.11, gain: 0.35 });
  },
  glass: () => {
    burst({ dur: 0.25, freq: 4200, type: 'highpass', gain: 0.3 });
    tone({ from: 2600, to: 2100, dur: 0.18, gain: 0.12 });
    tone({ from: 3400, to: 3000, dur: 0.12, gain: 0.08 });
  },
};

// The built-in sounds, by name. dig, place and step take a material name.
const synth = {
  dig: (material) => (DIG[material] || DIG.stone)(),
  place: (material) => {
    burst({ dur: 0.08, freq: material === 'wood' ? 380 : 500, gain: 0.5 });
    tone({ from: 180, to: 110, dur: 0.09, gain: 0.3 });
  },
  swing: () => burst({ dur: 0.18, freq: 1800, type: 'bandpass', q: 0.8, gain: 0.25, sweep: 500 }),
  flint: () => {
    burst({ dur: 0.05, freq: 5200, type: 'highpass', gain: 0.4 });
    setTimeout(() => burst({ dur: 0.07, freq: 3800, type: 'highpass', gain: 0.3 }), 70);
  },
  fuse: (seconds) => burst({ dur: seconds, freq: 4200, type: 'bandpass', q: 0.6, gain: 0.16, sweep: 6500 }),
  boom: (distance) => {
    const k = Math.max(0.15, 1 - distance / 90);
    burst({ dur: 1.5, freq: 900, sweep: 60, gain: 1.4 * k });
    tone({ from: 95, to: 28, dur: 1.2, gain: 1.1 * k });
    tone({ from: 55, to: 22, dur: 1.6, gain: 0.8 * k, type: 'triangle' });
  },
  hurt: () => tone({ from: 320, to: 140, dur: 0.22, gain: 0.4, type: 'square' }),
  step: () => burst({ dur: 0.25, freq: 600, type: 'bandpass', q: 0.4, gain: 0.18, sweep: 2400 }),
  pick: () => tone({ from: 660, to: 880, dur: 0.07, gain: 0.2, type: 'triangle' }),
  bow: () => {
    tone({ from: 240, to: 130, dur: 0.16, gain: 0.3, type: 'triangle' });
    burst({ dur: 0.12, freq: 2400, type: 'bandpass', q: 0.9, gain: 0.2, sweep: 900 });
  },
  thud: () => {
    burst({ dur: 0.06, freq: 700, gain: 0.4 });
    tone({ from: 150, to: 80, dur: 0.08, gain: 0.25 });
  },
  // a skeleton taking a blow, and falling apart
  bones: () => {
    for (let i = 0; i < 2; i++) setTimeout(() => tone({ from: 900 - i * 220, to: 500 - i * 120, dur: 0.05, gain: 0.2, type: 'square' }), i * 55);
  },
  rattle: () => {
    for (let i = 0; i < 5; i++) setTimeout(() => tone({ from: 1000 - i * 130, to: 420, dur: 0.06, gain: 0.2, type: 'square' }), i * 70);
  },
  hit: () => {
    burst({ dur: 0.07, freq: 1400, gain: 0.35 });
    tone({ from: 210, to: 90, dur: 0.12, gain: 0.3, type: 'sawtooth' });
  },
  pop: () => tone({ from: 520, to: 180, dur: 0.16, gain: 0.3, type: 'triangle' }),
  eat: () => {
    for (let i = 0; i < 3; i++) setTimeout(() => burst({ dur: 0.07, freq: 1300, type: 'bandpass', q: 1.5, gain: 0.35 }), i * 110);
  },
  level: () => {
    tone({ from: 660, to: 660, dur: 0.12, gain: 0.22, type: 'triangle' });
    setTimeout(() => tone({ from: 990, to: 990, dur: 0.22, gain: 0.22, type: 'triangle' }), 120);
  },
  // a portal taking hold: a hollow drone that climbs for as long as it takes
  portal: (seconds = 4) => {
    tone({ from: 70, to: 210, dur: seconds, gain: 0.3, type: 'sawtooth' });
    tone({ from: 104, to: 330, dur: seconds, gain: 0.16, type: 'triangle' });
    burst({ dur: seconds, freq: 300, type: 'bandpass', q: 2.5, gain: 0.22, sweep: 2600 });
  },
  // and letting go on the other side
  travel: () => {
    tone({ from: 300, to: 46, dur: 1.4, gain: 0.34, type: 'sawtooth' });
    burst({ dur: 1.6, freq: 2400, type: 'bandpass', q: 1.2, gain: 0.3, sweep: 180 });
  },
};

// ---------------------------------------------------------------- sound pack
// Optional recordings in public/sounds/, listed in public/sounds/pack.json: each name above maps
// to one file or to a list of variants (one is picked at random). dig, place and step can also
// be given per material ("dig.grass"). The folder layout follows the usual resource-pack one
// (dig/stone1.ogg, random/explode1.ogg, ...), so the sounds folder of such a pack drops in as it
// is. Whatever is missing keeps its built-in sound. "gain" scales the whole pack.

const pack = new Map(); // name -> AudioBuffer[]
let packGain = 1;
let packAsked = false;
const VARIED = new Set(['dig', 'place', 'step', 'swing', 'hit', 'hurt', 'eat']); // a little pitch change each time

// A dev server answers unknown paths with the page itself, so "200 OK" alone proves nothing.
const isAudio = (res) => res.ok && !(res.headers.get('content-type') || '').includes('text/html');

async function loadPack() {
  if (packAsked || !ctx) return;
  packAsked = true;
  const base = `${import.meta.env.BASE_URL}sounds/`;
  const url = (file) => base + file.split('/').map(encodeURIComponent).join('/');
  try {
    const res = await fetch(`${base}pack.json`);
    if (!res.ok) return;
    const json = await res.json();
    if (typeof json.gain === 'number') packGain = json.gain;
    const entries = Object.entries(json)
      .map(([name, files]) => [name, [].concat(files || []).filter((f) => typeof f === 'string')])
      .filter(([name, files]) => name.split('.')[0] in synth && files.length);
    // nothing copied into the folder yet: one request settles it
    if (!entries.length || !isAudio(await fetch(url(entries[0][1][0]), { method: 'HEAD' }))) return;
    const cache = new Map(); // one decode per file, however many names use it
    const load = (file) => {
      if (!cache.has(file)) {
        cache.set(file, fetch(url(file)).then((r) => (isAudio(r) ? r.arrayBuffer() : null)).then((b) => b && ctx.decodeAudioData(b)).catch(() => null));
      }
      return cache.get(file);
    };
    let missing = 0;
    await Promise.all(entries.map(async ([name, files]) => {
      const list = (await Promise.all(files.map(load))).filter(Boolean);
      missing += files.length - list.length;
      if (list.length) pack.set(name, list);
    }));
    if (missing) console.warn(`sound pack: ${missing} listed file(s) not found; their built-in sounds stay`);
  } catch (e) {
    console.warn('sound pack unreadable', e);
  }
}

// Play a recording from the pack; false if it has none for this sound.
function recorded(name, arg) {
  const material = typeof arg === 'string' ? arg : '';
  let list = pack.get(`${name}.${material}`) || pack.get(name);
  let rate = 1;
  if (!list && name === 'place') {
    list = pack.get(`dig.${material}`) || pack.get('dig'); // putting a block down: the digging sound, lower
    rate = 0.8;
  }
  const a = audio();
  if (!list || !a) return false;
  const src = a.createBufferSource();
  src.buffer = list[(Math.random() * list.length) | 0];
  src.playbackRate.value = rate * (VARIED.has(name) ? 0.94 + Math.random() * 0.12 : 1);
  const g = a.createGain();
  // an explosion far away is quieter, whichever way it is made
  g.gain.value = 1.6 * packGain * (name === 'boom' ? Math.max(0.15, 1 - arg / 90) : 1);
  src.connect(g).connect(master);
  src.start();
  return true;
}

export const sfx = {
  unlock: () => {
    audio();
    loadPack();
  },
};
for (const name of Object.keys(synth)) {
  sfx[name] = (arg) => {
    if (!recorded(name, arg)) synth[name](arg);
  };
}
