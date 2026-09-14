/* ============================================================
   NORTHERN LIGHTS RUN — spawner.js
   Pure pattern library + tiered spawner. No imports (zero
   cycles): sim.js passes an `api` with addObstacle/addPickup.
   Ported from engine.js patterns; adds ramps + rideable train
   roofs, oncoming trains, Sodaze, jetpack/sneaker nodes, keys.
   ============================================================ */

export function mulberry(seed) {
  let t = seed;
  return function () {
    t |= 0; t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* Each pattern fn(zw, api) places objects and returns its depth. */
const P = {
  budsLine(zw, api) {
    const lane = api.irand(0, 2);
    for (let i = 0; i < 6; i++) api.addPickup('bud', lane, zw + i * 2.3, 0.95);
    return 6 * 2.3;
  },

  budsArc(zw, api) {
    const lane = api.irand(0, 2);
    api.addObstacle('fence', lane, zw + 7, { h: 1.05, y0: 0, w: 1.95 });
    for (let i = 0; i < 7; i++) {
      const f = i / 6;
      api.addPickup('bud', lane, zw + f * 13, 0.95 + Math.sin(f * Math.PI) * 1.05);
    }
    return 14;
  },

  budsWeave(zw, api) {
    let lane = api.irand(0, 2);
    for (let i = 0; i < 9; i++) {
      api.addPickup('bud', lane, zw + i * 2.4, 0.95);
      lane = api.clamp(lane + api.pick([-1, 1]), 0, 2);
    }
    return 9 * 2.4;
  },

  fenceSingle(zw, api) {
    const l1 = api.irand(0, 2);
    api.addObstacle('fence', l1, zw + 3, { h: 1.05, y0: 0, w: 1.95 });
    const l2 = (l1 + api.irand(1, 2)) % 3;
    for (let i = 0; i < 4; i++) api.addPickup('bud', l2, zw + 1 + i * 2.2, 0.95);
    return 12;
  },

  fenceDouble(zw, api) {
    const free = api.irand(0, 2);
    for (let l = 0; l < 3; l++) if (l !== free) api.addObstacle('fence', l, zw + 3, { h: 1.05, y0: 0, w: 1.95 });
    for (let i = 0; i < 5; i++) api.addPickup('bud', free, zw + 0.5 + i * 2.2, 0.95);
    return 12;
  },

  cratePair(zw, api) {
    const free = api.irand(0, 2);
    for (let l = 0; l < 3; l++) if (l !== free) api.addObstacle('crate', l, zw + 4, { h: 2.5, y0: 0, w: 1.7 });
    api.addPickup('gold', free, zw + 4.4, 0.95);
    for (let i = 0; i < 3; i++) api.addPickup('bud', free, zw + 0.5 + i * 2.2, 0.95);
    return 12;
  },

  /* overhead hanging leaf signs: roll under the panel (posts at
     lane edges, panel bottom at y=1.25) */
  signDuck(zw, api) {
    const lanes = Math.random() < 0.5 ? [api.irand(0, 2)] : [api.irand(0, 1), api.irand(1, 2)];
    const set = [...new Set(lanes)];
    set.forEach(l => api.addObstacle('sign', l, zw + 4, { panel: true }));
    set.forEach(l => { for (let i = 0; i < 3; i++) api.addPickup('bud', l, zw + 3.2 + i * 0.8, 0.5); });
    return 12;
  },

  /* ramp -> rideable parked train roof with a roof coin line.
     Placement uses CURRENT speed so the speed-adaptive launch
     lands the player on the roof (see sim.launchFromRamp). */
  trainRoof(zw, api) {
    const lane = api.irand(0, 2);
    const speed = G_SPEED_REF();
    const T = api.clamp(14 / speed, 0.72, 1.05); // flight time to roof
    const D = speed * T;                          // ramp -> roof center
    const trainZ = zw + 14 + D;
    const depth = 13;
    api.addObstacle('ramp', lane, zw + 10, { w: 2.0, h: 0.5 });
    api.addObstacle('train', lane, trainZ, { w: 2.05, h: 3.35, y0: 0, depth, roof: true });
    // roof coin line
    for (let i = 0; i < 7; i++) {
      api.addPickup('bud', lane, trainZ - depth / 2 + 1.4 + i * 1.6, 3.35 + 0.95);
    }
    // side-lane lure
    const adj = api.clamp(lane + api.pick([-1, 1]), 0, 2);
    for (let i = 0; i < 6; i++) api.addPickup('bud', adj, zw + 4 + i * 2.2, 0.95);
    return (trainZ - zw) + depth / 2;
  },

  /* classic parked-train pass-through (roof ride optional) */
  trainSingle(zw, api) {
    const lane = api.irand(0, 2);
    const depth = 12;
    api.addObstacle('train', lane, zw + 8, { w: 2.05, h: 3.35, y0: 0, depth, roof: true });
    const adj = api.clamp(lane + api.pick([-1, 1]), 0, 2);
    for (let i = 0; i < 6; i++) api.addPickup('bud', adj, zw + 3 + i * 2.2, 0.95);
    return 22;
  },

  trainDouble(zw, api) {
    const free = api.irand(0, 2);
    const others = [0, 1, 2].filter(l => l !== free);
    api.addObstacle('train', others[0], zw + 8, { w: 2.05, h: 3.35, y0: 0, depth: 13, roof: true });
    api.addObstacle('train', others[1], zw + 12, { w: 2.05, h: 3.35, y0: 0, depth: 11, roof: true });
    for (let i = 0; i < 7; i++) api.addPickup('bud', free, zw + 3 + i * 2.4, 0.95);
    api.addObstacle('fence', free, zw + 21, { h: 1.05, y0: 0, w: 1.95 });
    for (let i = 0; i < 4; i++) api.addPickup('bud', free, zw + 19.5 + i * 2.2, 0.95 + Math.sin(i / 3 * Math.PI) * 0.9);
    return 26;
  },

  /* ONCOMING moving train in one lane: horn + headlight. Coins in
     the free lanes. Never overlaps a roof section (tier spacing). */
  oncoming(zw, api) {
    const lane = api.irand(0, 2);
    const free = [0, 1, 2].filter(l => l !== lane);
    api.addObstacle('trainOn', lane, zw + 62, { w: 2.05, h: 3.35, y0: 0, depth: 10, speed: 13 + api.rand(0, 4) });
    for (let i = 0; i < 7; i++) api.addPickup('bud', free[api.irand(0, 1)], zw + 4 + i * 2.4, 0.95);
    api.addObstacle('fence', free[0], zw + 20, { h: 1.05, y0: 0, w: 1.95 });
    return 30;
  },

  gauntlet(zw, api) {
    const order = [0, 1, 2].sort(() => Math.random() - 0.5);
    order.forEach((l, i) => {
      api.addObstacle('fence', l, zw + 3 + i * 7.5, { h: 1.05, y0: 0, w: 1.95 });
      for (let j = 0; j < 4; j++) api.addPickup('bud', l, zw + 1.2 + i * 7.5 + j * 2, 0.95 + Math.sin(j / 3 * Math.PI) * 1.0);
    });
    return 3 + 2 * 7.5 + 8;
  },

  powerNode(zw, api) {
    const lane = api.irand(0, 2);
    api.addPickup(api.pick(['magnet', 'shield', 'x2', 'jet', 'sneaker']), lane, zw + 2, 1.0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = api.laneX(lane) + Math.cos(a) * 1.1;
      const laneF = px / api.laneW + 1;
      api.addPickup('bud', laneF, zw + 2 + Math.sin(a) * 1.2, 0.95);
    }
    return 10;
  },

  /* a few Sodaze cans in a line */
  sodaze(zw, api) {
    const lane = api.irand(0, 2);
    const n = api.irand(3, 4);
    for (let i = 0; i < n; i++) api.addPickup('soda', lane, zw + 2 + i * 1.6, 0.95);
    const free = api.clamp(lane + api.pick([-1, 1]), 0, 2);
    for (let i = 0; i < 4; i++) api.addPickup('bud', free, zw + 1 + i * 2.2, 0.95);
    return 10;
  },

  rest(zw, api) {
    for (let i = 0; i < 3; i++) api.addPickup('bud', api.irand(0, 2), zw + 2 + i * 3.5, 0.95);
    return 12;
  },
};

/* speed reference hook (sim sets it) so patterns can place
   speed-adaptive train roofs without importing sim */
let _speedRef = 16;
export function setSpeedRef(v) { _speedRef = v; }
function G_SPEED_REF() { return _speedRef; }

const POOLS = [
  { min: 0,  list: ['budsLine', 'fenceSingle', 'budsArc', 'budsWeave', 'rest', 'powerNode'] },
  { min: 17, list: ['cratePair', 'signDuck', 'fenceDouble', 'budsArc', 'budsWeave', 'powerNode', 'sodaze'] },
  { min: 24, list: ['trainRoof', 'oncoming', 'gauntlet', 'cratePair', 'signDuck', 'sodaze'] },
  { min: 30, list: ['trainDouble', 'trainRoof', 'oncoming', 'gauntlet', 'cratePair', 'signDuck', 'powerNode'] },
];

/* G needs: introQueue, nextPatZ, speed, zFar, nextKeyZ, keyArmed */
export function spawnNext(G, api) {
  let name;
  if (G.introQueue.length) name = G.introQueue.shift();
  else {
    const tier = POOLS.filter(p => G.speed >= p.min).pop();
    name = api.pick(tier.list);
  }
  const depth = P[name](G.nextPatZ, api) || 10;
  const gap = api.clamp(G.speed * 0.62, 11, 26);
  G.nextPatZ += depth + gap;

  // rare key drops (distance based, own cadence)
  if (G.dist + G.zFar > (G.nextKeyZ || 0)) {
    const kz = G.dist + 46;
    const lane = api.irand(0, 2);
    api.addPickup('key', lane, kz, 1.0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const px = api.laneX(lane) + Math.cos(a) * 1.2;
      api.addPickup('bud', px / api.laneW + 1, kz + Math.sin(a) * 1.3, 1.0);
    }
    G.nextKeyZ = G.dist + 950 + api.rand(0, 450);
  }
}

export const INTRO_PLAY = ['budsLine', 'fenceSingle', 'budsArc', 'cratePair', 'budsWeave', 'powerNode', 'signDuck', 'trainRoof', 'sodaze'];
export const INTRO_MENU = ['budsLine', 'budsArc', 'fenceSingle', 'cratePair'];
export const PATTERNS = P;
