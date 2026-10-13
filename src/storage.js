// Everything the game keeps in the browser lives under 'geocrafter:'. The project had two
// earlier names, and what was saved under them is moved over once, before anything reads it
// (main.js imports this file first).
const EARLIER = ['streetcraft:', 'plateaucraft:'];

try {
  for (const key of Object.keys(localStorage)) {
    const prefix = EARLIER.find((p) => key.startsWith(p));
    if (!prefix) continue;
    const now = `geocrafter:${key.slice(prefix.length)}`;
    if (localStorage.getItem(now) === null) localStorage.setItem(now, localStorage.getItem(key));
    localStorage.removeItem(key);
  }
} catch (e) {
  // storage blocked or full: nothing to move, and the game runs without saving
}
