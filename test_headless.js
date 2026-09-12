/* Headless smoke test: runs the real sprites.js + engine.js in Node
   with stubbed DOM/canvas, simulating frames and random inputs. */
'use strict';

const fs = require('fs');
const path = require('path');

// ---- stub canvas 2d context that tolerates any call ----
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
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
        return () => gradient;
      }
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined; // any other method = no-op
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

function makeCanvas() {
  return { width: 300, height: 150, style: {}, getContext: () => makeCtx(), addEventListener() {}, };
}

// ---- stub DOM/window ----
global.window = global;
global.document = {
  createElement: (tag) => makeCanvas(),
  getElementById: () => null,
  addEventListener() {},
};
global.performance = { now: () => Date.now() };
global.localStorage = { getItem: () => null, setItem() {} };
let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; };

// canvas prototype guard used nowhere now; Image not referenced

// ---- load real game code ----
const load = (f) => new Function(fs.readFileSync(path.join(__dirname, 'js', f), 'utf8')).call(global);
load('audio.js');
load('sprites.js');
load('engine.js');

console.log('modules loaded:', { A: !!global.A, S: !!global.S, E: !!global.E });

const S = global.S, E = global.E, G = E.G;
S.init();
S.buildSky(800, 600);
console.log('sprites built', { bud: !!S.bud, auroras: S.auroras.length });

const ctx = makeCtx();
let errs = 0;
function frame(i, dt) {
  try {
    E.update(dt);
    E.render(ctx);
  } catch (e) {
    errs++;
    console.error(`FRAME ${i} ERROR:`, e.stack.split('\n').slice(0, 4).join(' | '));
    if (errs > 5) process.exit(1);
  }
}

// ---- menu attract mode ----
E.resetWorld('menu');
for (let i = 0; i < 900; i++) frame(i, 1 / 60);
console.log('menu mode ok — obstacles:', G.obstacles.length, 'pickups:', G.pickups.length, 'decors:', G.decors.length, 'mode:', G.mode);

// ---- play mode with random inputs ----
E.resetWorld('play');
let gameOverFired = 0;
G.onGameOver = () => { gameOverFired++; };
const acts = [() => E.act.move(-1), () => E.act.move(1), () => E.act.jump(), () => E.act.roll()];
let crashed = false;
for (let i = 0; i < 7200; i++) { // 120 simulated seconds
  if (i % 9 === 0) acts[(Math.random() * acts.length) | 0]();
  frame(i, 1 / 60);
  if (G.mode === 'dead') crashed = true;
  if (gameOverFired && i % 120 === 0) { /* keep simming behind panel */ }
}
console.log('play mode ok — crashed:', crashed, 'gameOverFired:', gameOverFired);
console.log('final: score', Math.floor(G.score), 'dist', Math.floor(G.dist), 'm  speed', G.speed.toFixed(1), 'buds', G.buds);
console.log('counts — obstacles:', G.obstacles.length, 'pickups:', G.pickups.length, 'decors:', G.decors.length, 'pops:', G.pops === undefined ? 'n/a' : '');
console.log(errs === 0 ? '✅ SMOKE TEST PASSED' : '❌ FAILURES: ' + errs);
process.exit(errs === 0 ? 0 : 1);
