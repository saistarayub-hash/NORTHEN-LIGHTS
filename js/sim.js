/* ============================================================
   NORTHERN LIGHTS RUN — sim.js
   Game state + update loop: speed ramp 16→46, player state
   machine (ground / air / roof / fly / dead), ramps → rideable
   train roofs, oncoming trains, collisions, pickups, power-ups
   (magnet / shield / ×2 / jetpack / sneakers), hoverboard
   inventory, keys + second chance, distance multiplier ladder,
   milestones, near-miss, emotes.
   Renderer-agnostic: all FX go through G.fx (set by world).
   ============================================================ */
import {
  getKeys, setKeys, getBoards, setBoards,
} from './store.js';
import { spawnNext, setSpeedRef, mulberry, PATTERNS as spawnerPatterns } from './spawner.js';

export const CFG = {
  laneW: 2.2,
  roadHalf: 3.55,
  playerZ: 6,
  zFar: 74,
  speedStart: 16,
  speedMax: 46,
  accel: 0.36,
  grav: -30,
  jumpV: 11.4,
  rollTime: 0.55,
  roofY: 3.35,
  jetAlt: 5.4,
  stripe: 4,
};

export const EMOTE_CD = { move: 18, phew: 6, jackpot: 8, fire: 12, soda: 5, board: 6, ouch: 8 };

export const G = {
  mode: 'menu',           // menu | play | sc | dead
  t: 0,
  dist: 0,
  speed: 9,
  score: 0,
  buds: 0,
  streak: 0,
  streakBest: 0,
  comboMult: 1,
  streakT: 0,
  magnetT: 0,
  x2T: 0,
  shield: false,
  invulnT: 0,
  sneakerT: 0,
  jetT: 0,
  onBoard: false,
  boardT: 0,
  boardsInv: 2,
  keys: 0,
  distMult: 1,
  shake: 0, shakeX: 0, shakeY: 0,
  timeScale: 1,
  crashT: 0,
  overFired: false,
  scT: 0,
  milestone: 500,
  auroraBoost: 0,
  camPitch: 0,
  camJet: 0,
  punch: 0,
  flashFlag: 0,
  crownOwner: null,
  statsBB: 0,             // boards broken this run
  statsKS: 0,             // key saves this run
  player: {
    lane: 1, x: 0, y: 0, vy: 0,
    rolling: false, rollT: 0,
    alive: true, rot: 0, runPhase: 0, lean: 0,
    jumpBuf: 0, trailT: 0,
    state: 'ground',      // ground | air | roof | fly | dead
    onRoofOb: null,
    squash: 1,
  },
  obstacles: [],
  pickups: [],
  nextPatZ: 0,
  nextKeyZ: 0,
  introQueue: [],
  fx: null,               // { burst, pop, recycleOb, recyclePk, arcs } set by world
  emote: { text: '', age: 99, dur: 1.4 },
  emoteCd: { move: -99, phew: -99, jackpot: -99, fire: -99, soda: -99, board: -99, ouch: -99 },
  onGameOver: null,
  onPickup: null,
};

export const LANE_X = (l) => (l - 1) * CFG.laneW;
const _rng = mulberry(20260914);
const rand = (a, b) => a + _rng() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(_rng() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------------- spawner api ---------------- */
export const SPAWN_API = {
  laneW: CFG.laneW,
  laneX: LANE_X,
  rand, irand, pick, clamp,
  addObstacle(type, lane, zw, spec) {
    if (G.obstacles.length > 40) return;
    const depth = spec.depth != null ? spec.depth
      : type === 'train' ? 12 : type === 'trainOn' ? 10 : type === 'ramp' ? 2.4 : 0.5;
    const ob = {
      type, lane, x: LANE_X(lane), zw, depth,
      w: spec.w != null ? spec.w : 2.0,
      y0: spec.y0 || 0, h: spec.h != null ? spec.h : 1.05,
      roof: !!spec.roof, speed: spec.speed || 0,
      passed: false, hit: false, mesh: null, seed: Math.random() * 10,
      boxes: null,
    };
    // collision boxes (signs have posts + overhead panel)
    if (type === 'sign') {
      ob.boxes = [
        { dx: 0, w: 2.1, y0: 1.25, h: 1.3 },        // overhead panel — roll under
        { dx: -0.93, w: 0.18, y0: 0, h: 2.55 },     // posts
        { dx: 0.93, w: 0.18, y0: 0, h: 2.55 },
      ];
    } else if (type !== 'ramp') {
      ob.boxes = [{ dx: 0, w: ob.w, y0: ob.y0, h: ob.h }];
    } else {
      ob.boxes = [];
    }
    G.obstacles.push(ob);
    if (G.fx) G.fx.acquireOb(ob);
  },
  addPickup(type, lane, zw, y, extra) {
    if (G.pickups.length > 90) return;
    const pk = {
      type, x: LANE_X(lane), laneF: lane, zw, y: y || 0.95,
      taken: false, seed: Math.random() * 10, mesh: null, _m: 0,
      ...(extra || {}),
    };
    G.pickups.push(pk);
    if (G.fx) G.fx.acquirePk(pk);
  },
};

/* ---------------- world reset ---------------- */
export function resetWorld(mode) {
  G.mode = mode;
  G.dist = 0; G.t = 0;
  G.speed = mode === 'menu' ? 9 : CFG.speedStart;
  G.score = 0; G.buds = 0;
  G.streak = 0; G.streakBest = 0; G.comboMult = 1; G.streakT = 0;
  G.magnetT = 0; G.x2T = 0; G.shield = false; G.invulnT = 0;
  G.sneakerT = 0; G.jetT = 0;
  G.onBoard = false; G.boardT = 0;
  G.boardsInv = getBoards();
  G.keys = getKeys();
  G.distMult = 1;
  G.shake = 0; G.timeScale = 1; G.crashT = 0; G.overFired = false; G.scT = 0;
  G.milestone = 500; G.auroraBoost = 0; G.camPitch = 0; G.camJet = 0; G.punch = 0;
  G.flashFlag = 0; G.crownOwner = null;
  G.statsBB = 0; G.statsKS = 0;
  // recycle any live 3D meshes before clearing the arrays
  if (G.fx) {
    for (let i = 0; i < G.obstacles.length; i++) G.fx.recycleOb(G.obstacles[i]);
    for (let i = 0; i < G.pickups.length; i++) G.fx.recyclePk(G.pickups[i]);
  }
  G.obstacles.length = 0;
  G.pickups.length = 0;
  G.player.rolling = false;
  G.player.onRoofOb = null;
  G.emote.age = 99;
  Object.keys(G.emoteCd).forEach(k => { G.emoteCd[k] = -99; });
  const pl = G.player;
  pl.lane = 1; pl.x = 0; pl.y = 0; pl.vy = 0;
  pl.alive = true; pl.rot = 0; pl.runPhase = 0; pl.lean = 0; pl.jumpBuf = 0;
  pl.state = 'ground'; pl.squash = 1;
  G.nextPatZ = mode === 'play' ? 26 : 20;
  G.nextKeyZ = G.dist + 500 + rand(0, 300);
  G.introQueue = mode === 'play'
    ? ['budsLine', 'fenceSingle', 'budsArc', 'cratePair', 'budsWeave', 'powerNode', 'signDuck', 'sodaze', 'trainRoof']
    : [];
}

/* ---------------- emotes (speech bubble) ---------------- */
export function say(cat, text) {
  const cd = EMOTE_CD[cat] || 8;
  if (G.t - G.emoteCd[cat] >= cd) {
    G.emoteCd[cat] = G.t;
    G.emote.text = text;
    G.emote.age = 0;
    G.fx && G.fx.emotePing && G.fx.emotePing();
  }
}

/* ---------------- actions ---------------- */
export const act = {
  move(dir) {
    const pl = G.player;
    if (!pl.alive || G.mode === 'dead') return;
    const nl = clamp(pl.lane + dir, 0, 2);
    if (nl !== pl.lane) {
      pl.lane = nl;
      if (pl.state === 'roof') {
        // lane change on a roof: keep riding only if the new lane has a roof there
        const zr = CFG.playerZ;
        const has = G.obstacles.some(o => o.roof && !o.hit && o.lane === nl &&
          Math.abs(o.zw - (G.dist + zr)) < o.depth / 2 + 0.8);
        if (!has) pl.state = 'air', pl.vy = 0, pl.onRoofOb = null; // drop off the edge
      }
      const A = window.A;
      if (A) A.sfx.lane();
    }
  },

  jump() {
    const pl = G.player;
    if (!pl.alive || G.mode === 'dead') return;
    const A = window.A;
    if (pl.state === 'ground' || pl.state === 'roof') {
      const v = CFG.jumpV * (G.sneakerT > 0 ? 1.35 : 1);
      pl.state = 'air';
      pl.vy = v;
      pl.rolling = false;
      pl.onRoofOb = null;
      pl.squash = 1.1;
      if (G.fx) G.fx.burst('dust', pl.x, 0.05, G.dist + CFG.playerZ, 6, { sp0: 1, sp1: 3, vy0: 0.5, vy1: 2, life: 0.4, s0: 0.1, s1: 0.22 });
      if (G.sneakerT > 0 && G.fx) G.fx.ring(pl.x, pl.y + 0.1, G.dist + CFG.playerZ, '#ffd25f');
      if (A) A.sfx.jump();
    } else if (pl.state === 'air') {
      pl.jumpBuf = 0.12;
    }
  },

  roll() {
    const pl = G.player;
    if (!pl.alive || G.mode === 'dead') return;
    const A = window.A;
    if (pl.state === 'air') {
      pl.vy = Math.min(pl.vy, -14); // fast-fall
    }
    pl.rolling = true;
    pl.rollT = CFG.rollTime;
    if (A) A.sfx.roll();
  },

  /* F key / double-tap: deploy hoverboard */
  board() {
    const pl = G.player;
    if (!pl.alive || G.mode === 'dead' || G.mode !== 'play') return;
    if (G.onBoard || G.boardsInv <= 0) return;
    G.onBoard = true;
    G.boardT = 30;
    const A = window.A;
    if (A) A.sfx.board();
    if (G.fx) G.fx.burst('spark', pl.x, 1.0, G.dist + CFG.playerZ, 10, { spr: 'sparkTeal', life: 0.5, sp0: 1, sp1: 5, vy0: 1, vy1: 4 });
  },
};

/* ---------------- ramp launch (speed adaptive) ---------------- */
export function launchV(speed) {
  const T = clamp(14 / speed, 0.72, 1.05);
  return (CFG.roofY + 15 * T * T) / T;
}

/* ---------------- crash / saves ---------------- */
function crash(ob) {
  const pl = G.player;
  pl.alive = false;
  pl.state = 'dead';
  pl.vy = 7;
  pl.rot = 0;
  G.mode = 'dead';
  G.crashT = 0;
  G.timeScale = 0.28;
  G.shake = 18;
  G.flashFlag = 1;
  G.streakBest = Math.max(G.streakBest, G.streak);
  G.onBoard = false; G.boardT = 0;
  say('ouch', 'OUCH!!');
  const A = window.A;
  if (A) { A.musicStop(0.3); A.musicDuck(true); A.sfx.crash(); }
  const fz = G.dist + CFG.playerZ;
  if (G.fx) {
    G.fx.burst('leaf', pl.x, 1.1, fz, 16, { sp0: 3, sp1: 9, vy0: 2, vy1: 9, life: 1.0, s0: 0.1, s1: 0.22 });
    G.fx.burst('spark', pl.x, 1.0, fz, 14, { spr: 'sparkGreen', life: 0.7, sp0: 2, sp1: 10, vy0: 1, vy1: 8 });
    G.fx.burst('dust', pl.x, 0.4, fz, 10, { sp0: 1, sp1: 5, vy0: 0.5, vy1: 3, life: 0.8, s0: 0.15, s1: 0.4 });
  }
  if (ob) ob.hit = true;
}

function boardSave(ob) {
  G.onBoard = false;
  G.boardT = 0;
  G.boardsInv = Math.max(0, G.boardsInv - 1);
  setBoards(G.boardsInv);
  G.statsBB++;
  G.invulnT = 1.0;
  G.shake = 10;
  const pl = G.player;
  const A = window.A;
  if (A) A.sfx.boardBreak();
  say('board', 'BOARD SAVED!');
  if (G.fx) {
    G.fx.burst('spark', pl.x, 0.7, G.dist + CFG.playerZ, 18, { spr: 'sparkWhite', life: 0.6, sp0: 2, sp1: 8, vy0: 1, vy1: 6 });
    G.fx.burst('dust', pl.x, 0.3, G.dist + CFG.playerZ, 8, { sp0: 1, sp1: 4, vy0: 0.5, vy1: 2.5, life: 0.5 });
    G.fx.pop('BOARD SAVED!', pl.x, 2.2, G.dist + CFG.playerZ, '#35e0d0', true);
  }
  if (ob) ob.hit = true;
}

function shieldSave(ob) {
  G.shield = false;
  G.invulnT = 1.2;
  G.shake = 8;
  const pl = G.player;
  const A = window.A;
  if (A) A.sfx.power();
  if (G.fx) {
    G.fx.burst('spark', pl.x, 1.1, G.dist + CFG.playerZ, 18, { spr: 'sparkTeal', life: 0.6, sp0: 3, sp1: 8, vy0: 1, vy1: 6 });
    G.fx.pop('SHIELD SAVED YOU!', pl.x, 2.2, G.dist + CFG.playerZ, '#7dffa8', true);
  }
  if (ob) ob.hit = true;
}

function startSecondChance(ob) {
  G.keys = Math.max(0, G.keys - 1);
  setKeys(G.keys);
  G.statsKS++;
  G.mode = 'sc';
  G.scT = 2.6;
  G.timeScale = 0.22;
  G.shake = 12;
  G.flashFlag = 1;
  const A = window.A;
  if (A) A.sfx.secondChance();
  // clear the road ahead
  for (const o of G.obstacles) {
    const zr = o.zw - G.dist;
    if (zr > 0.5 && zr < 36) o.hit = true;
  }
  const pl = G.player;
  say('ouch', 'OUCH!!');
  if (G.fx) G.fx.pop('🔑 SECOND CHANCE!', pl.x, 2.6, G.dist + CFG.playerZ, '#ffd25f', true);
  if (ob) ob.hit = true;
}

function handleHit(ob) {
  const pl = G.player;
  if (G.onBoard && G.boardT > 0) boardSave(ob);
  else if (G.shield) shieldSave(ob);
  else if (G.keys > 0) startSecondChance(ob);
  else crash(ob);
}

/* ---------------- collisions ---------------- */
function collide(dt) {
  const pl = G.player;
  const pz = G.dist + CFG.playerZ;
  const bodyTop = pl.y + (pl.rolling ? 0.95 : 1.95);
  const bodyBot = pl.y + 0.02;

  for (let i = G.obstacles.length - 1; i >= 0; i--) {
    const ob = G.obstacles[i];
    const zr = ob.zw - G.dist;
    if (zr < -(ob.depth / 2 + 0.8)) {
      G.obstacles.splice(i, 1);
      if (G.fx) G.fx.recycleOb(ob);
      continue;
    }
    if (zr > CFG.zFar + 24) continue;

    // near-miss bonus
    if (!ob.passed && zr < CFG.playerZ) {
      ob.passed = true;
      if (!ob.hit && pl.alive && G.mode === 'play' && ob.type !== 'fence' && ob.type !== 'ramp' && ob.type !== 'sign') {
        const dx = Math.abs(pl.x - ob.x);
        if (dx > 1.0 && dx < 2.4) {
          addScore(40, pl.x, 1.9, pz, 'NEAR MISS +40', '#35e0d0');
          const A = window.A;
          if (A) A.sfx.near();
          say('phew', 'PHEW!');
        }
      }
    }

    if (ob.hit || !pl.alive || G.invulnT > 0 || G.mode === 'menu') continue;
    if (Math.abs(zr - CFG.playerZ) > ob.depth / 2 + 0.45) continue;
    if (!ob.boxes || !ob.boxes.length) continue;

    let hit = false;
    for (let b = 0; b < ob.boxes.length; b++) {
      const box = ob.boxes[b];
      if (Math.abs(pl.x - (ob.x + box.dx)) > box.w / 2 + 0.42) continue;
      if (bodyBot < box.y0 + box.h && bodyTop > box.y0 + 0.08) { hit = true; break; }
    }
    if (hit) { handleHit(ob); if (!pl.alive) break; }
  }

  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    const zr = pk.zw - G.dist;
    if (zr < -1 || pk.taken) {
      G.pickups.splice(i, 1);
      if (G.fx) G.fx.recyclePk(pk);
      continue;
    }
    if (zr > CFG.zFar) continue;
    pk._m = 0;

    // magnet vacuum
    if (G.magnetT > 0 && pl.alive && zr < 8 && zr > 0.5 && (pk.type === 'bud' || pk.type === 'gold')) {
      const k = Math.min(1, dt * 9);
      pk.x += (pl.x - pk.x) * k;
      pk.y += (0.9 + pl.y - pk.y) * k;
      pk.zw += (pz - pk.zw) * Math.min(1, dt * 5);
      pk._m = 1;
    }

    if (!pl.alive || G.mode === 'menu' && zr > 1.5) continue;
    if (Math.abs(zr - CFG.playerZ) > 1.05) continue;
    if (Math.abs(pl.x - pk.x) > 0.95) continue;
    if (Math.abs(pk.y - (pl.y + 0.85)) > 1.15) continue;

    pk.taken = true;
    G.pickups.splice(i, 1);
    if (G.fx) G.fx.recyclePk(pk);
    collect(pk);
  }
}

function collect(pk) {
  const pl = G.player;
  const pz = G.dist + CFG.playerZ;
  const px = pk.x;
  const A = window.A;
  if (G.mode === 'menu') {
    if (G.fx) G.fx.burst('spark', px, pk.y, pz, 5, { spr: 'sparkGreen', life: 0.4, sp0: 1, sp1: 4, vy0: 1, vy1: 4 });
    return;
  }

  if (pk.type === 'bud' || pk.type === 'gold') {
    G.streakT = 1.4;
    G.streak++;
    G.streakBest = Math.max(G.streakBest, G.streak);
    const newMult = Math.min(5, 1 + Math.floor(G.streak / 8));
    if (newMult > G.comboMult) { G.punch = 1; }
    G.comboMult = newMult;
    const base = pk.type === 'gold' ? 150 : 25;
    const val = Math.round(base * G.comboMult * (G.x2T > 0 ? 2 : 1));
    G.score += val;
    if (pk.type === 'gold') {
      G.buds += 5;
      if (A) A.sfx.gold();
      say('jackpot', 'JACKPOT!');
      if (G.fx) {
        G.fx.burst('spark', px, pk.y, pz, 16, { spr: 'sparkGold', life: 0.8, sp0: 2, sp1: 8, vy0: 2, vy1: 7 });
        G.fx.pop('+' + val, px, pk.y + 0.7, pz, '#ffd25f');
      }
    } else {
      G.buds += 1;
      if (A) A.sfx.pickup(G.streak % 15);
      if (G.comboMult >= 5) say('fire', 'ON FIRE!');
      if (G.fx) {
        G.fx.burst('spark', px, pk.y, pz, 7, { spr: 'sparkGreen', life: 0.5, sp0: 1.5, sp1: 5, vy0: 1, vy1: 5 });
        G.fx.pop('+' + val, px, pk.y + 0.7, pz, '#7dffa8');
      }
    }
    if (G.onPickup) G.onPickup(pk.type);
  } else if (pk.type === 'soda') {
    const val = 50 * (G.x2T > 0 ? 2 : 1);
    G.score += val;
    G.buds += 3;
    if (A) A.sfx.soda();
    say('soda', 'SODAZE BREAK!');
    if (G.fx) {
      G.fx.burst('spark', px, pk.y, pz, 10, { spr: 'sparkGold', life: 0.6, sp0: 1.5, sp1: 6, vy0: 1, vy1: 6 });
      G.fx.pop('+' + val, px, pk.y + 0.7, pz, '#ff9f43');
    }
  } else if (pk.type === 'key') {
    G.keys++;
    setKeys(G.keys);
    if (A) A.sfx.key();
    if (G.fx) {
      G.fx.burst('spark', px, pk.y, pz, 14, { spr: 'sparkGold', life: 0.7, sp0: 1.5, sp1: 6, vy0: 1, vy1: 6 });
      G.fx.pop('🔑 KEY SECURED!', px, pk.y + 0.9, pz, '#ffd25f', true);
    }
  } else {
    if (A) A.sfx.power();
    if (pk.type === 'magnet') {
      G.magnetT = 8;
      if (G.fx) { G.fx.pop('BUD MAGNET!', px, pk.y + 0.8, pz, '#35e0d0', true); G.fx.burst('spark', px, pk.y, pz, 12, { spr: 'sparkTeal', life: 0.7, sp0: 2, sp1: 7, vy0: 1, vy1: 6 }); }
    } else if (pk.type === 'shield') {
      G.shield = true;
      if (G.fx) { G.fx.pop('SHIELD UP!', px, pk.y + 0.8, pz, '#7dffa8', true); G.fx.burst('spark', px, pk.y, pz, 12, { spr: 'sparkWhite', life: 0.7, sp0: 2, sp1: 7, vy0: 1, vy1: 6 }); }
    } else if (pk.type === 'x2') {
      G.x2T = 10;
      if (G.fx) { G.fx.pop('DOUBLE POINTS!', px, pk.y + 0.8, pz, '#ffd25f', true); G.fx.burst('spark', px, pk.y, pz, 12, { spr: 'sparkGold', life: 0.7, sp0: 2, sp1: 7, vy0: 1, vy1: 6 }); }
    } else if (pk.type === 'jet') {
      G.jetT = 5.5;
      if (pl.state !== 'fly') {
        pl.state = 'fly';
        pl.rolling = false;
        pl.onRoofOb = null;
      }
      if (A) A.sfx.jet();
      spawnSkyLine();
      if (G.fx) { G.fx.pop('JETPACK!', px, pk.y + 0.9, pz, '#ff5fd0', true); G.fx.burst('spark', px, pk.y, pz, 14, { spr: 'sparkMagenta', life: 0.7, sp0: 2, sp1: 7, vy0: 1, vy1: 6 }); }
    } else if (pk.type === 'sneaker') {
      G.sneakerT = 12;
      if (G.fx) { G.fx.pop('SUPER SNEAKERS!', px, pk.y + 0.9, pz, '#ffd25f', true); G.fx.burst('spark', px, pk.y, pz, 12, { spr: 'sparkGold', life: 0.7, sp0: 2, sp1: 7, vy0: 1, vy1: 6 }); G.fx.ring(px, pl.y + 0.15, pz, '#ffd25f'); }
    }
  }
}

/* coin line at jetpack altitude, following the flight path */
function spawnSkyLine() {
  const pl = G.player;
  const z0 = G.dist + 10;
  for (let i = 0; i < 46; i++) {
    const lane = i % 3;
    SPAWN_API.addPickup('bud', lane, z0 + i * 2.6, CFG.jetAlt + 0.5);
  }
  SPAWN_API.addPickup('gold', pl.lane, z0 + 46 * 2.6, CFG.jetAlt + 0.5);
}

function addScore(v, x, y, z, text, col) {
  G.score += v;
  if (text && G.fx) G.fx.pop(text, x, y, z, col, false);
}

/* ---------------- milestones ---------------- */
function milestones() {
  if (G.mode !== 'play') return;
  if (G.dist < G.milestone) return;
  const mark = G.milestone;
  G.milestone += 500;
  const newMult = Math.min(10, 1 + Math.floor(G.dist / 500));
  if (newMult !== G.distMult) G.distMult = newMult;
  const A = window.A;
  if (A) A.sfx.milestone();
  G.auroraBoost = 1;
  const pl = G.player;
  if (G.fx) {
    G.fx.pop(`${mark} m — DISTANCE ×${G.distMult}!`, pl.x, 2.8, G.dist + CFG.playerZ + 6, '#a06bff', true);
    G.fx.burst('confetti', pl.x, 2.5, G.dist + CFG.playerZ + 8, 42, { sp0: 2, sp1: 10, vy0: 2, vy1: 9, life: 1.1, s0: 0.08, s1: 0.16 });
  }
  if (G.distMult >= 10) say('move', "DOC'S ON THE MOVE!");
  // +1 board per 500 m (cap 3), persisted
  if (G.boardsInv < 3) {
    G.boardsInv++;
    setBoards(G.boardsInv);
    if (G.fx) G.fx.pop('+1 BOARD', pl.x, 3.5, G.dist + CFG.playerZ + 4, '#35e0d0', false);
  }
}

/* ---------------- update ---------------- */
export function update(dt) {
  const pl = G.player;
  const ts = dt * G.timeScale;
  G.t += ts;

  /* --- modes / speed --- */
  if (G.mode === 'play') {
    G.speed = Math.min(CFG.speedMax, G.speed + CFG.accel * dt);
    G.timeScale += (1 - G.timeScale) * Math.min(1, dt * 2.2);
  } else if (G.mode === 'menu') {
    G.speed += (9 - G.speed) * Math.min(1, dt * 2);
  } else if (G.mode === 'dead') {
    G.speed = Math.max(0, G.speed - dt * 34);
    G.crashT += dt;
    G.timeScale += (1 - G.timeScale) * Math.min(1, dt * 1.4);
    if (G.crashT > 0.95 && !G.overFired) {
      G.overFired = true;
      if (G.onGameOver) G.onGameOver();
    }
  } else if (G.mode === 'sc') {
    G.scT -= dt;
    if (G.scT <= 0) {
      G.mode = 'play';
      G.timeScale = 0.3;
      G.invulnT = Math.max(G.invulnT, 1.5);
      say('phew', 'PHEW!');
    }
  }
  G.dist += G.speed * ts;

  /* --- spawn --- */
  setSpeedRef(G.speed);
  while (G.nextPatZ < G.dist + CFG.zFar) spawnNext(G, SPAWN_API);

  /* --- moving obstacles (oncoming trains: extra motion + horn) --- */
  const A0 = window.A;
  for (let i = 0; i < G.obstacles.length; i++) {
    const ob = G.obstacles[i];
    if (ob.speed) {
      ob.zw -= ob.speed * ts;
      const zr = ob.zw - G.dist;
      if (!ob.horned && zr < 38 && zr > 0) {
        ob.horned = true;
        if (A0 && G.mode === 'play') A0.sfx.horn();
      }
    }
  }

  /* --- player lateral --- */
  const targetX = LANE_X(pl.lane);
  const k = Math.min(1, ts * 13);
  const prevX = pl.x;
  pl.x += (targetX - pl.x) * k;
  pl.lean += ((pl.x - prevX) * 3.4 - pl.lean) * Math.min(1, dt * 12);

  /* --- player vertical / state machine --- */
  const fz = G.dist + CFG.playerZ;
  if (pl.alive) {
    if (pl.state === 'ground') {
      pl.y = 0;
      if (pl.rolling) {
        pl.rollT -= ts;
        if (pl.rollT <= 0) pl.rolling = false;
      }
      // ramp launch
      if (G.mode !== 'menu' && !pl.rolling) {
        for (let i = 0; i < G.obstacles.length; i++) {
          const ob = G.obstacles[i];
          if (ob.type !== 'ramp' || ob.hit) continue;
          const zr = ob.zw - G.dist;
          if (Math.abs(zr - CFG.playerZ) < 1.2 && Math.abs(pl.x - ob.x) < ob.w / 2 + 0.2) {
            ob.hit = true; // one-shot trigger
            pl.state = 'air';
            pl.vy = launchV(G.speed);
            pl.onRoofOb = null;
            G.camPitch = 1;
            const A = window.A;
            if (A) A.sfx.launch();
            if (G.fx) G.fx.burst('dust', pl.x, 0.1, fz, 10, { sp0: 1, sp1: 5, vy0: 0.5, vy1: 3, life: 0.5 });
            break;
          }
        }
      }
    } else if (pl.state === 'air') {
      pl.vy += CFG.grav * ts;
      pl.y += pl.vy * ts;
      if (pl.rolling) { pl.rollT -= ts; if (pl.rollT <= 0) pl.rolling = false; }
      // roof snap (descending over a rideable train)
      if (pl.vy < 0 && pl.y <= CFG.roofY + 1.6 && pl.y >= CFG.roofY - 0.1) {
        for (let i = 0; i < G.obstacles.length; i++) {
          const ob = G.obstacles[i];
          if (!ob.roof || ob.hit) continue;
          const zr = ob.zw - G.dist;
          if (Math.abs(pl.x - ob.x) < ob.w / 2 + 0.35 &&
              zr > CFG.playerZ - ob.depth / 2 - 0.8 &&
              zr < CFG.playerZ + ob.depth / 2 + 0.8) {
            pl.state = 'roof';
            pl.onRoofOb = ob;
            pl.y = CFG.roofY;
            pl.vy = 0;
            pl.squash = 0.88;
            const A = window.A;
            if (A) A.sfx.land();
            G.shake = Math.max(G.shake, 1.4);
            if (G.fx) G.fx.burst('dust', pl.x, CFG.roofY + 0.02, fz, 8, { sp0: 1, sp1: 4, vy0: 0.3, vy1: 2, life: 0.45, s0: 0.1, s1: 0.26 });
            break;
          }
        }
      }
      if (pl.y <= 0) {
        pl.y = 0; pl.vy = 0;
        pl.state = 'ground';
        pl.squash = 0.82;
        const A = window.A;
        if (A) A.sfx.land();
        G.shake = Math.max(G.shake, 1.6);
        if (G.fx) G.fx.burst('dust', pl.x, 0.05, fz, 8, { sp0: 1, sp1: 4, vy0: 0.5, vy1: 2.2, life: 0.45, s0: 0.1, s1: 0.26 });
        if (pl.jumpBuf > 0) { pl.jumpBuf = 0; act.jump(); }
      }
    } else if (pl.state === 'roof') {
      const ob = pl.onRoofOb;
      if (!ob || ob.hit) {
        pl.state = 'air'; pl.vy = 0; pl.onRoofOb = null;
      } else {
        const zr = ob.zw - G.dist;
        if (zr < -ob.depth / 2 - 0.4) {
          // reached the roof's end — drop off
          pl.state = 'air';
          pl.vy = 0;
          pl.onRoofOb = null;
          say('phew', 'PHEW!');
        } else {
          pl.y = CFG.roofY;
          if (pl.rolling) { pl.rollT -= ts; if (pl.rollT <= 0) pl.rolling = false; }
        }
      }
    } else if (pl.state === 'fly') {
      pl.y += (CFG.jetAlt - pl.y) * Math.min(1, ts * 2.2);
      pl.vy = 0;
      if (G.jetT <= 0) {
        // safe landing: clear the road ahead + brief invuln
        pl.state = 'air';
        pl.vy = 0;
        G.invulnT = Math.max(G.invulnT, 1.2);
        for (let i = 0; i < G.obstacles.length; i++) {
          const o = G.obstacles[i];
          const zr = o.zw - G.dist;
          if (zr > 0 && zr < 26) o.hit = true;
        }
        if (G.fx) G.fx.pop('SAFE LANDING', pl.x, 2.4, fz, '#7dffa8', true);
      }
    }
    pl.jumpBuf = Math.max(0, pl.jumpBuf - dt);
    pl.runPhase += G.speed * ts * 1.55;
    G.invulnT = Math.max(0, G.invulnT - dt);
  } else {
    // crash tumble
    pl.vy += CFG.grav * ts * 0.8;
    pl.y = Math.max(0, pl.y + pl.vy * ts);
    pl.rot += ts * 9;
  }
  // squash-and-stretch recovery
  pl.squash += (1 - pl.squash) * Math.min(1, dt * 9);

  /* --- camera helpers --- */
  G.camPitch += (0 - G.camPitch) * Math.min(1, dt * 1.8);
  const jetTarget = pl.state === 'fly' ? 1 : 0;
  G.camJet += (jetTarget - G.camJet) * Math.min(1, dt * 3);
  G.punch = Math.max(0, G.punch - dt * 2.2);

  /* --- streak / combo decay --- */
  if (G.streakT > 0) {
    G.streakT -= ts;
    if (G.streakT <= 0) { G.streak = 0; G.comboMult = 1; }
  }

  /* --- power timers --- */
  if (G.magnetT > 0) {
    G.magnetT -= ts;
    pl.trailT -= dt;
    if (pl.trailT <= 0) {
      pl.trailT = 0.07;
      if (G.fx) G.fx.burst('spark', pl.x, 1.2, fz, 1, { spr: 'sparkTeal', life: 0.35, sp0: 0.2, sp1: 1.2, vy0: 0.5, vy1: 2, g: 0, s0: 0.08, s1: 0.14 });
    }
  }
  if (G.x2T > 0) {
    G.x2T -= ts;
    pl.trailT -= dt;
    if (pl.trailT <= 0) {
      pl.trailT = 0.09;
      if (G.fx) G.fx.burst('spark', pl.x, 0.9, fz, 1, { spr: 'sparkGold', life: 0.35, sp0: 0.2, sp1: 1.2, vy0: 0.5, vy1: 2, g: 0, s0: 0.08, s1: 0.14 });
    }
  }
  if (G.sneakerT > 0) G.sneakerT -= ts;
  if (G.jetT > 0) G.jetT -= ts;
  if (G.onBoard && G.boardT > 0) {
    G.boardT -= ts;
    if (G.boardT <= 0) {
      G.boardT = 0;
      G.onBoard = false; // ride finished
    }
  }

  /* --- score from distance (× distance multiplier ladder) --- */
  if (G.mode === 'play') G.score += G.speed * ts * 2 * G.distMult * (G.x2T > 0 ? 2 : 1);

  milestones();
  G.auroraBoost = Math.max(0, G.auroraBoost - dt * 0.5);

  collide(dt);

  /* --- emote lifetime --- */
  G.emote.age += dt;

  /* --- shake --- */
  G.shake = Math.max(0, G.shake - dt * 26) * Math.pow(0.0018, dt);
  G.shakeX = rand(-1, 1) * G.shake;
  G.shakeY = rand(-1, 1) * G.shake * 0.7;
}

/* ---------------- test / debug hooks ---------------- */
export const internals = {
  clamp,
  forcePickup(type) {
    SPAWN_API.addPickup(type, G.player.lane, G.dist + CFG.playerZ + 0.4, 0.95);
  },
  giveKeys(n) { G.keys = n; setKeys(n); },
  giveBoards(n) { G.boardsInv = n; setBoards(n); },
  setSpeed(v) { G.speed = v; },
  clearInvuln() { G.invulnT = 0; },
  /* tests: place a named pattern (or raw obstacle) ahead of the player */
  spawnNow(name) {
    if (spawnerPatterns[name]) {
      setSpeedRef(G.speed);
      spawnerPatterns[name](G.dist + 26, SPAWN_API);
      G.nextPatZ = Math.max(G.nextPatZ, G.dist + 70);
    }
  },
  forceObstacle(type, lane, zw) {
    const laneN = lane != null ? lane : G.player.lane;
    SPAWN_API.addObstacle(type, laneN, zw != null ? zw : G.dist + 7,
      type === 'train' || type === 'trainOn'
        ? { w: 2.05, h: 3.35, y0: 0, depth: 13, roof: type === 'train', speed: type === 'trainOn' ? 14 : 0 }
        : { w: 1.9, h: 1.05, y0: 0 });
  },
};
