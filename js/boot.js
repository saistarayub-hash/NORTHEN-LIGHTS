/* ============================================================
   NORTHERN LIGHTS RUN — boot.js
   Entry point: three.js renderer + auto quality tiers
   (DPR cap 2 → degrade to 1, fog/particle budgets on slow
   frames), scene assembly (world, player, fx), input wiring,
   the 60fps loop, FPS meter, resize, audio unlock.
   three.js loads as an ES module via the importmap CDN.
   ============================================================ */
import * as THREE from 'three';
import { G, CFG, resetWorld, update as simUpdate, act, internals } from './sim.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createUI } from './ui.js';
import { attachInput } from './input.js';
import { boardById } from './boards.js';
import { getChar, lsGet, KEYS } from './store.js';

/* board selector hook (read by player.js) */
window.__nl_board = () => boardById(lsGet(KEYS.BOARD, 'aurora'));

/* audio unlock on first gesture (audio.js is a classic script) */
function unlockAudio() {
  const A = window.A;
  if (!A) return;
  A.unlock();
  A.setMute(A.muted);
}
document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });

/* ---------------- renderer / scene / camera ---------------- */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 500);

/* ---------------- modules ---------------- */
const world = createWorld(scene, camera, renderer, null);
G.fx = world.fx;
const player = createPlayer(scene, camera);
player.setChar(getChar());
const ui = createUI(world.project, {
  onTierChange: () => { },
  resetCam: () => player.reset(),
});

attachInput({
  getState: () => ui.state,
  onPause: () => ui.togglePause(),
  onMenuEnter: () => {
    const A = window.A;
    if (A) A.sfx.ui();
    ui.startGame(false);
  },
  onOverEnter: () => {
    ui.flushPendingScore();
    ui.startGame(true);
  },
});

ui.boot();
world.setQuality(2);

/* ---------------- resize ---------------- */
function onResize() { world.resize && world.resize(); }
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
world.resize();

/* ---------------- loop ---------------- */
let lastTs = 0;
let fpsEMA = 16.7, fpsFrames = 0, tier = 2, fpsEmit = 0;

function loop(ts) {
  requestAnimationFrame(loop);
  const dtRaw = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  const dt = Math.max(0.001, dtRaw);

  /* fps watchdog + auto quality tiers */
  fpsEMA += (dtRaw * 1000 - fpsEMA) * 0.05;
  fpsFrames++;
  if (tier > 0 && fpsFrames > 300 && fpsEMA > 22) {
    tier--;
    fpsFrames = 0;
    fpsEMA = 16.7;
    world.setQuality(tier);
  }
  fpsEmit -= dt;
  if (fpsEmit <= 0) {
    fpsEmit = 0.25;
    ui.setFps(1000 / Math.max(1, fpsEMA));
  }

  const st = ui.state;
  ui.tick(dt);

  const simming = st === 'run' || st === 'over' || st === 'menu' || st === 'sc' || st === 'count';
  if (simming) simUpdate(dt);
  if (st !== 'pause') world.update(dt);

  ui.update(dt);
  player.update(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame((t) => { lastTs = t; requestAnimationFrame(loop); });

/* ---------------- test / dev handle ---------------- */
window.__nl = {
  THREE,
  G, CFG, act, internals,
  ui, world, player, renderer, scene, camera,
  resetWorld,
  startGame: () => ui.startGame(false),
  fpsEMA: () => fpsEMA,
  tier: () => tier,
};
