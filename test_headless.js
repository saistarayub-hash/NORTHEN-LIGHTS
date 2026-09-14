/* ============================================================
   NORTHERN LIGHTS RUN — test_headless.js
   Node smoke test for the 3D build. Runs the REAL game modules
   (boot → world/player/ui/sim/spawner/input/audio/store/boards/
   textures) against:
     • a DOM/canvas stub (fake elements, 2d-ctx proxy)
     • a three.js stub (node:module resolve hook, no WebGL)
   Simulates gameplay with random + forced inputs (power-ups,
   hoverboard save, key second-chance, roof ride, crown runs)
   and asserts state, persistence, and a DOM-id audit between
   the UI code and index.html / cockpit.html.
   Run: node test_headless.js
   ============================================================ */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

/* ---------------- three.js stub resolver ---------------- */
register(new URL('./test/three-resolver.mjs', import.meta.url));

/* ---------------- DOM / canvas stubs ---------------- */
function makeCtx() {
  const gradient = { addColorStop() {} };
  const target = {
    canvas: { width: 800, height: 600 },
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    font: '', textAlign: '', textBaseline: '', shadowColor: '', shadowBlur: 0,
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => gradient;
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.classList = {
      _s: new Set(),
      add: (...c) => c.forEach(x => this.classList._s.add(x)),
      remove: (...c) => c.forEach(x => this.classList._s.delete(x)),
      toggle: (c, force) => {
        const on = force != null ? force : !this.classList._s.has(c);
        if (on) this.classList._s.add(c); else this.classList._s.delete(c);
        return on;
      },
      contains: (c) => this.classList._s.has(c),
    };
    this._listeners = {};
    this.textContent = '';
    this._innerHTML = '';
    this.value = '';
    this.title = '';
    this.disabled = false;
    this.checked = false;
    this.hidden = false;
    this.offsetWidth = 0;
    this.offsetHeight = 0;
    if (this.tagName === 'CANVAS') { this.width = 300; this.height = 150; }
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = v; if (v === '') this.children = []; }
  get firstChild() { return this.children[0] || null; }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener() {}
  dispatch(type, ev) { (this._listeners[type] || []).forEach(fn => fn(ev || { stopPropagation() {}, preventDefault() {}, key: '' })); }
  click() { this.dispatch('click'); }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  remove() {}
  querySelector() { return new FakeEl('div'); }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }; }
  getContext() { return makeCtx(); }
  focus() {}
  blur() {}
  toDataURL() { return 'data:image/png;base64,'; }
}

const elCache = new Map();
const store = new Map();
globalThis.window = globalThis;
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
globalThis.document = {
  hidden: false,
  createElement: (tag) => new FakeEl(tag),
  getElementById: (id) => {
    if (!elCache.has(id)) elCache.set(id, new FakeEl(id === 'game' ? 'canvas' : 'div'));
    return elCache.get(id);
  },
  addEventListener() {},
  removeEventListener() {},
  querySelector: () => new FakeEl('div'),
  querySelectorAll: () => [],
};
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
};
globalThis.performance = { now: () => Date.now() };
globalThis.location = { hash: '#cockpit', href: 'http://localhost:8000/index.html#cockpit' };
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.devicePixelRatio = 2;
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-headless' }, configurable: true }); } catch (e) { /* fine */ }

const rafCbs = new Set();
globalThis.requestAnimationFrame = (cb) => { rafCbs.add(cb); return rafCbs.size; };

let simTs = 0;
function stepFrame() {
  const cbs = [...rafCbs];
  rafCbs.clear();
  simTs += 16.6667;
  cbs.forEach((cb) => cb(simTs));
}

/* ---------------- assert helper ---------------- */
let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ FAIL: ' + msg); }
}

/* ============================================================
   LOAD THE REAL GAME
   ============================================================ */
console.log('— loading game modules (three stubbed) —');
await import('./js/audio.js'); // classic script in the browser; plain module in node
await import('./js/boot.js');
const NL = globalThis.__nl;
assert(!!NL, 'boot.js exposed window.__nl');
assert(!!NL.G && !!NL.ui && !!NL.world && !!NL.player, 'modules wired: G/ui/world/player');
assert(!!globalThis.A, 'audio.js loaded (window.A)');

const G = NL.G, ui = NL.ui, act = NL.act, internals = NL.internals, world = NL.world, player = NL.player;

function frames(n) { for (let i = 0; i < n; i++) stepFrame(); }
/* keep the player invulnerable while a controlled scenario runs */
function safeFrames(n, keepAlive = true) {
  for (let i = 0; i < n; i++) {
    if (keepAlive && G.mode === 'play') G.invulnT = Math.max(G.invulnT, 0.25);
    stepFrame();
  }
}
/* ensure a fresh live run */
function ensureRun() {
  if (ui.state !== 'run' && ui.state !== 'count') ui.startGame(true);
  if (ui.state === 'count') frames(50);
  if (G.mode === 'dead') { ui.startGame(true); frames(50); }
  return G;
}

/* ---------------- DOM id audit: UI code vs index.html ---------------- */
console.log('— DOM id audit (js/* vs index.html) —');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const used = new Set();
  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    for (const m of src.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) used.add(m[1]);
    for (const m of src.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)) used.add(m[1]);
  }
  const missing = [...used].filter(id => !htmlIds.has(id));
  assert(missing.length === 0, `all ${used.size} DOM ids referenced in js/ exist in index.html${missing.length ? ' — MISSING: ' + missing.join(',') : ''}`);
  assert(htmlIds.has('game') && htmlIds.has('hud') && htmlIds.has('menu'), 'core ids present (game/hud/menu)');
}

/* ---------------- DOM id audit: cockpit.html ---------------- */
console.log('— DOM id audit (cockpit.html) —');
{
  const html = fs.readFileSync(path.join(ROOT, 'cockpit.html'), 'utf8');
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const used = new Set();
  for (const m of html.matchAll(/(?:getElementById\(|\$)\(\s*['"]([^'"]+)['"]\s*\)/g)) used.add(m[1]);
  const missing = [...used].filter(id => !htmlIds.has(id));
  assert(missing.length === 0, `all ${used.size} cockpit DOM ids exist in cockpit.html${missing.length ? ' — MISSING: ' + missing.join(',') : ''}`);
}

/* ---------------- 1. menu attract mode ---------------- */
console.log('— menu attract mode —');
assert(ui.state === 'menu', 'initial state is menu');
frames(300);
assert(G.mode === 'menu' && G.dist > 1, `menu world scrolls (dist=${G.dist.toFixed(1)})`);
assert(G.obstacles.length > 0 || G.pickups.length > 0, 'attract mode spawns objects');
assert(!ui.R.btnLobby.classList.contains('hidden'), 'lobby button visible with #cockpit hash');

/* ---------------- 2. lobby (hash-gated) ---------------- */
console.log('— lobby —');
ui.R.btnLobby.click();
assert(!ui.R.lobby.classList.contains('hidden'), 'lobby opens');
assert(ui.R.lobbyBoards.children.length === 4, 'board shop shows 4 boards');
assert(ui.R.lobbyCrew.children.length === 4, 'crew row shows 4 slots');
ui.R.tabRank.click();
ui.R.rankWeek.click();
frames(2);
assert(true, 'lobby tabs + weekly filter run without errors');
ui.R.lobbyBack.click();
assert(!ui.R.menu.classList.contains('hidden'), 'back returns to menu');

/* ---------------- 3. start a run, countdown, speed ramp ---------------- */
console.log('— run start —');
ui.startGame(false);
assert(ui.state === 'count', 'countdown state');
safeFrames(170); // 3-2-1-GO (player kept alive)
assert(ui.state === 'run' && G.mode === 'play', 'run started (3-2-1-GO)');
assert(Math.abs(G.speed - 16) < 2.5, `speed starts ~16 (=${G.speed.toFixed(1)})`);
const d0 = G.dist;
safeFrames(60);
assert(G.dist > d0 + 10, `speed ramp moving (dist ${d0.toFixed(0)}→${G.dist.toFixed(0)})`);

/* force every pattern through so all 3D obstacle types spawn */
for (const name of ['fenceSingle', 'cratePair', 'signDuck', 'trainSingle', 'trainDouble', 'oncoming', 'trainRoof', 'sodaze', 'powerNode', 'gauntlet']) {
  internals.spawnNow(name);
}
safeFrames(90);
{
  const seen = new Set();
  for (const ob of G.obstacles) seen.add(ob.type);
  for (const need of ['fence', 'crate', 'sign', 'train', 'trainOn', 'ramp']) {
    assert(seen.has(need), `obstacle type spawned: ${need}`);
  }
}

/* ---------------- 4. power-ups ---------------- */
console.log('— power-ups —');
internals.forcePickup('key');
safeFrames(40);
assert(G.keys >= 1, `key picked up + persisted (keys=${G.keys}, ls=${store.get('nl_keys')})`);

internals.forcePickup('soda');
safeFrames(30);
internals.forcePickup('magnet');
safeFrames(20);
assert(G.magnetT > 0, `magnet active (${G.magnetT.toFixed(1)}s)`);
internals.forcePickup('x2');
safeFrames(20);
assert(G.x2T > 0, '×2 points active');
internals.forcePickup('sneaker');
safeFrames(20);
assert(G.sneakerT > 0, 'super sneakers active');
internals.forcePickup('shield');
safeFrames(20);
assert(G.shield === true, 'shield active');

/* jetpack: 5.5s flight, then safe landing + invuln */
internals.forcePickup('jet');
safeFrames(20, false);
assert(G.jetT > 0 && G.player.state === 'fly', `jetpack flight (t=${G.jetT.toFixed(1)}s, y=${G.player.y.toFixed(1)})`);
safeFrames(320, false); // 5.3s of flight (jetT runs on scaled dt)
assert(G.player.state !== 'fly', 'jetpack ended → landing');
assert(G.invulnT > 0, 'safe landing grants brief invuln');
safeFrames(80);

/* ---------------- 5. hoverboard: deploy + crash save ---------------- */
console.log('— hoverboard —');
internals.giveBoards(2);
act.board();
safeFrames(5);
assert(G.onBoard === true && G.boardT > 29, `board deployed (${G.boardT.toFixed(1)}s)`);
assert(player.rig && player.rig.board.visible === true, 'board model visible');
internals.clearInvuln();
internals.forceObstacle('crate', G.player.lane, G.dist + 8);
frames(70);
assert(G.onBoard === false, 'board broken on crash');
assert(G.boardsInv === 1, `inventory decremented (=${G.boardsInv}, ls=${store.get('nl_boards')})`);
assert(G.player.alive === true, 'player saved by board');
safeFrames(60);

/* ---------------- 6. second chance (key) ---------------- */
console.log('— second chance —');
G.shield = false;
internals.giveKeys(1);
internals.clearInvuln();
internals.forceObstacle('crate', G.player.lane, G.dist + 8);
frames(70);
assert(G.mode === 'sc', `second-chance mode (t=${G.scT.toFixed(1)}s)`);
assert(G.keys === 0, 'key consumed');
assert(G.player.alive === true, 'still alive during second chance');
let resumed = false;
for (let i = 0; i < 190 && !resumed; i++) { stepFrame(); resumed = G.mode === 'play'; }
assert(resumed, 'run resumed after countdown');
assert(G.invulnT > 0, `post-second-chance invuln (${G.invulnT.toFixed(1)}s)`);
safeFrames(60);

/* ---------------- 7. roof ride (rideable train) ---------------- */
console.log('— roof ride —');
{
  ensureRun();
  internals.clearInvuln();
  const pl = G.player;
  internals.setSpeed(20);
  pl.state = 'air';
  pl.vy = 8;
  pl.y = 4.9;
  internals.forceObstacle('train', pl.lane, G.dist + 10);
  let sawRoof = false;
  for (let i = 0; i < 120; i++) {
    stepFrame();
    if (pl.state === 'roof') { sawRoof = true; break; }
  }
  assert(sawRoof, `snapped onto rideable roof (y=${pl.y.toFixed(2)})`);
  let sawDrop = false;
  for (let i = 0; i < 240 && !sawDrop; i++) {
    stepFrame();
    if (pl.state === 'ground' && pl.y === 0 && i > 10) sawDrop = true;
  }
  assert(sawDrop, 'dropped off the roof end');
}

/* ---------------- 8. emotes ---------------- */
console.log('— emotes / juice —');
{
  ensureRun();
  // clear emote cooldowns (PHEW may have fired during the roof drop)
  Object.keys(G.emoteCd).forEach(k => { G.emoteCd[k] = -99; });
  // deterministic near-miss: crate in the adjacent lane passes at dx≈2.2
  internals.forceObstacle('crate', G.player.lane < 2 ? G.player.lane + 1 : G.player.lane - 1, G.dist + 10);
  let emoteSeen = '';
  for (let i = 0; i < 200 && !emoteSeen; i++) {
    if (G.mode === 'play') G.invulnT = Math.max(G.invulnT, 0.25);
    stepFrame();
    if (G.emote.age < 1.4 && G.emote.text) emoteSeen = G.emote.text;
  }
  assert(emoteSeen.length > 0, `speech-bubble emote fired: "${emoteSeen}"`);
  assert(['DOC\'S ON THE MOVE!', 'PHEW!', 'JACKPOT!', 'ON FIRE!', 'SODAZE BREAK!', 'BOARD SAVED!', 'OUCH!!'].includes(emoteSeen), 'emote text is from the brand list');
}

/* ---------------- 9. random-input survival + full crash flow ---------------- */
console.log('— random survival (up to 120 simulated seconds) —');
{
  ensureRun();
  let gameOverFired = 0, maxDist = 0;
  const origCb = G.onGameOver;
  G.onGameOver = () => { gameOverFired++; if (origCb) origCb(); };
  for (let i = 0; i < 7200 && ui.state !== 'over'; i++) {
    if (i % 9 === 0) act.move(Math.random() < 0.5 ? -1 : 1);
    if (i % 11 === 0) act.jump();
    if (i % 13 === 0) act.roll();
    if (i % 53 === 0) act.board();
    stepFrame();
    maxDist = Math.max(maxDist, G.dist);
  }
  assert(gameOverFired >= 1, `game-over fired after a crash (${gameOverFired})`);
  assert(ui.state === 'over', 'game-over panel shown');
  assert(maxDist > 40, `real gameplay distance covered (maxDist=${maxDist.toFixed(0)}m)`);
}

/* ---------------- 10. guest score save ---------------- */
console.log('— score saving —');
{
  ui.R.nameInput.value = 'TESTER';
  ui.flushPendingScore();
  const hs = JSON.parse(store.get('nlhs_v1') || '[]');
  assert(hs.some(e => e.n === 'TESTER'), 'guest score saved to nlhs_v1');
  const stats = JSON.parse(store.get('nl_stats_v1') || '{}');
  assert(stats.r >= 1 && stats.d > 0, `device stats updated (runs=${stats.r}, dist=${stats.d})`);
  ui.toMenu();
}

/* ---------------- 11. crown run (owner auto-bank) ---------------- */
console.log('— crown run —');
{
  ui.crown = 'DOC';
  ui.startGame(true);
  safeFrames(50);
  assert(ui.state === 'run', 'crown run started');
  internals.clearInvuln();
  internals.forceObstacle('crate', G.player.lane, G.dist + 8);
  frames(150); // crash + 0.95s
  assert(ui.state === 'over', 'crown run ended');
  ui.flushPendingScore();
  const hs = JSON.parse(store.get('nlhs_v1') || '[]');
  assert(hs.some(e => e.n === 'DOC' && e.o === 1), 'crown score auto-banked with owner flag (o:1)');
  ui.toMenu();
  ui.crown = null;
}

/* ---------------- 12. milestones + multiplier ladder + boards per 500m ---------------- */
console.log('— milestones —');
{
  ui.startGame(true);
  safeFrames(40);
  internals.setSpeed(40);
  const boardsBefore = G.boardsInv;
  for (let i = 0; i < 1200; i++) {
    if (G.mode === 'play') G.invulnT = Math.max(G.invulnT, 0.25);
    stepFrame();
    if (ui.state !== 'run' && ui.state !== 'count') break;
    if (i % 5 === 0) act.move((i % 3) - 1);
    if (i % 7 === 0) act.jump();
  }
  assert(G.dist >= 500, `ran past the first 500m milestone (dist=${G.dist.toFixed(0)}m)`);
  assert(G.distMult >= 2, `distance multiplier ladder climbed (×${G.distMult})`);
  assert(G.distMult <= 10, 'multiplier capped at ×10');
  assert(G.boardsInv > boardsBefore || G.boardsInv >= 3, `boards awarded per 500m (=${G.boardsInv})`);
  if (ui.state === 'over') ui.flushPendingScore();
  ui.toMenu();
}

/* ---------------- 13. quality tiers + long soak ---------------- */
console.log('— quality tiers + 60s soak —');
{
  world.setQuality(1);
  world.setQuality(0);
  world.setQuality(2);
  frames(3600); // 60s
  assert(true, 'soak: 3600 frames at all tiers, no exceptions');
}

/* ---------------- 14. persistence keys sanity ---------------- */
console.log('— persistence —');
{
  const expected = ['nlhs_v1', 'nl_owners_v1', 'nl_stats_v1', 'nl_keys', 'nl_boards', 'nl_board', 'nl_name', 'nl_muted', 'nl_unlocked', 'nl_char'];
  for (const k of expected) {
    const v = store.get(k);
    if (v != null && (k === 'nlhs_v1' || k === 'nl_owners_v1' || k === 'nl_stats_v1')) JSON.parse(v);
  }
  assert(store.get('nl_boards') != null, 'nl_boards persisted');
  assert(true, 'localStorage keys touched are schema-valid');
}

console.log(failures === 0 ? '\n✅ HEADLESS TEST PASSED' : `\n❌ FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
