/* ============================================================
   NORTHERN LIGHTS RUN — engine.js
   Pseudo-3D endless runner: world sim, spawner, collisions,
   particles, juice, and the renderer.
   Exposes window.E = { CFG, G, act, resetWorld, update, render }
   ============================================================ */
(function () {
  'use strict';

  const CFG = {
    laneW: 2.2,          // world units between lane centers
    roadHalf: 3.55,      // road half width in units
    camH: 3.2,           // camera height above ground
    playerZ: 6,          // player's fixed distance ahead of camera
    zFar: 74,            // spawn/draw horizon distance
    speedStart: 15,
    speedMax: 40,
    accel: 0.30,         // units/s per second
    grav: -30,
    jumpV: 11.4,
    rollTime: 0.55,
    stripe: 4,           // road dash spacing
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  const G = {
    mode: 'menu',        // menu | play | dead
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
    shake: 0,
    shakeX: 0,
    shakeY: 0,
    timeScale: 1,
    crashT: 0,
    overFired: false,
    milestone: 500,
    auroraBoost: 0,
    flashFlag: 0,
    onGameOver: null,
    onPickup: null,      // (type) -> void  (main uses for HUD pop)
    quality: 1,          // 1 = full, 0.6 = reduced particle budget
    W: 0, H: 0, F: 600, cx: 0, horizonY: 0, camX: 0,
    player: {
      lane: 0, x: 0, y: 0, vy: 0,
      rolling: false, rollT: 0, jumping: false,
      alive: true, rot: 0, runPhase: 0, lean: 0,
      jumpBuf: 0, trailT: 0,
    },
    obstacles: [],
    pickups: [],
    decors: [],
    nextPatZ: 0,
    decorZ: 0,
    introQueue: [],
  };

  const LANE_X = (l) => (l - 1) * CFG.laneW; // lane 0,1,2 -> x

  /* ================= projection ================= */
  function proj(x, y, z) {
    const s = G.F / Math.max(z, 0.35);
    return { x: G.cx + (x - G.camX) * s, y: G.horizonY + (CFG.camH - y) * s, s };
  }

  /* ================= particles ================= */
  const MAXP = 420;
  const parts = [];
  for (let i = 0; i < MAXP; i++) parts.push({ on: false });
  let pCursor = 0;

  function addPart(o) {
    const budget = G.quality >= 1 ? MAXP : MAXP * 0.6 | 0;
    for (let n = 0; n < budget; n++) {
      const p = parts[pCursor];
      pCursor = (pCursor + 1) % budget;
      if (!p.on) { Object.assign(p, o, { on: true, age: 0 }); return p; }
    }
    return null;
  }

  function burst(kind, x, y, z, n, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(opt.sp0 || 2, opt.sp1 || 7);
      addPart({
        kind, x, y, z,
        vx: Math.cos(a) * sp * (opt.vx || 1),
        vy: rand(opt.vy0 != null ? opt.vy0 : 1, opt.vy1 != null ? opt.vy1 : 6),
        vz: rand(-2, 2),
        g: opt.g != null ? opt.g : -14,
        life: rand(0.35, opt.life || 0.75),
        size: rand(opt.s0 || 0.06, opt.s1 || 0.16),
        rot: rand(0, 6.3), vr: rand(-8, 8),
        spr: opt.spr || null, col: opt.col || null,
      });
    }
  }

  const pops = [];
  function addPop(text, x, y, z, col, big) {
    pops.push({ text, x, y, z, col: col || '#7dffa8', big: !!big, age: 0, life: 0.9 });
    if (pops.length > 24) pops.shift();
  }

  /* ================= world reset ================= */
  function resetWorld(mode) {
    G.mode = mode;
    G.dist = 0;
    G.t = 0;
    G.speed = mode === 'menu' ? 9 : CFG.speedStart;
    G.score = 0; G.buds = 0; G.streak = 0; G.streakBest = 0; G.comboMult = 1; G.streakT = 0;
    G.magnetT = 0; G.x2T = 0; G.shield = false; G.invulnT = 0;
    G.shake = 0; G.timeScale = 1; G.crashT = 0; G.overFired = false;
    G.milestone = 500; G.auroraBoost = 0; G.flashFlag = 0;
    G.obstacles.length = 0;
    G.pickups.length = 0;
    G.decors.length = 0;
    parts.forEach(p => p.on = false);
    pops.length = 0;
    const pl = G.player;
    pl.lane = 1; pl.x = 0; pl.y = 0; pl.vy = 0;
    pl.rolling = false; pl.rollT = 0; pl.jumping = false;
    pl.alive = true; pl.rot = 0; pl.runPhase = 0; pl.lean = 0; pl.jumpBuf = 0;
    G.camX = 0;
    G.decorZ = 12;
    if (mode === 'play') {
      G.nextPatZ = 26;
      G.introQueue = ['budsLine', 'fenceSingle', 'budsArc', 'cratePair', 'budsWeave', 'powerNode'];
    } else {
      G.nextPatZ = 20;
      G.introQueue = [];
    }
  }

  /* ================= patterns ================= */
  // Each pattern fn(zw) places objects at world-z `zw` and returns its depth.
  const P = {
    budsLine(zw) {
      const lane = irand(0, 2);
      for (let i = 0; i < 6; i++) addPickup('bud', lane, zw + i * 2.3, 0.95);
      return 6 * 2.3;
    },
    budsArc(zw) {
      const lane = irand(0, 2);
      addObstacle('fence', lane, zw + 7, 0.35);
      for (let i = 0; i < 7; i++) {
        const f = i / 6;
        addPickup('bud', lane, zw + f * 13, 0.95 + Math.sin(f * Math.PI) * 1.05);
      }
      return 14;
    },
    budsWeave(zw) {
      let lane = irand(0, 2);
      for (let i = 0; i < 9; i++) {
        addPickup('bud', lane, zw + i * 2.4, 0.95);
        lane = clamp(lane + pick([-1, 1]), 0, 2);
      }
      return 9 * 2.4;
    },
    fenceSingle(zw) {
      const l1 = irand(0, 2);
      addObstacle('fence', l1, zw + 3, 0.35);
      const l2 = (l1 + irand(1, 2)) % 3;
      for (let i = 0; i < 4; i++) addPickup('bud', l2, zw + 1 + i * 2.2, 0.95);
      return 12;
    },
    fenceDouble(zw) {
      const free = irand(0, 2);
      for (let l = 0; l < 3; l++) if (l !== free) addObstacle('fence', l, zw + 3, 0.35);
      for (let i = 0; i < 5; i++) addPickup('bud', free, zw + 0.5 + i * 2.2, 0.95);
      return 12;
    },
    cratePair(zw) {
      const free = irand(0, 2);
      for (let l = 0; l < 3; l++) if (l !== free) addObstacle('crate', l, zw + 4, 1.3);
      addPickup('gold', free, zw + 4.4, 0.95);
      for (let i = 0; i < 3; i++) addPickup('bud', free, zw + 0.5 + i * 2.2, 0.95);
      return 12;
    },
    signDuck(zw) {
      const lanes = Math.random() < 0.5 ? [irand(0, 2)] : [irand(0, 1), irand(1, 2)];
      const set = [...new Set(lanes)];
      set.forEach(l => addObstacle('sign', l, zw + 4, 0.5));
      set.forEach(l => { for (let i = 0; i < 3; i++) addPickup('bud', l, zw + 3.2 + i * 0.8, 0.5); });
      return 12;
    },
    trainSingle(zw) {
      const lane = irand(0, 2);
      addObstacle('train', lane, zw + 8, 12);
      const adj = clamp(lane + pick([-1, 1]), 0, 2);
      for (let i = 0; i < 6; i++) addPickup('bud', adj, zw + 3 + i * 2.2, 0.95);
      return 22;
    },
    trainDouble(zw) {
      const free = irand(0, 2);
      const others = [0, 1, 2].filter(l => l !== free);
      addObstacle('train', others[0], zw + 8, 13);
      addObstacle('train', others[1], zw + 12, 11);
      for (let i = 0; i < 7; i++) addPickup('bud', free, zw + 3 + i * 2.4, 0.95);
      addObstacle('fence', free, zw + 21, 0.35); // hop while trains run beside
      for (let i = 0; i < 4; i++) addPickup('bud', free, zw + 19.5 + i * 2.2, 0.95 + Math.sin(i / 3 * Math.PI) * 0.9);
      return 26;
    },
    gauntlet(zw) {
      const order = [0, 1, 2].sort(() => Math.random() - 0.5);
      order.forEach((l, i) => {
        addObstacle('fence', l, zw + 3 + i * 7.5, 0.35);
        for (let j = 0; j < 4; j++) addPickup('bud', l, zw + 1.2 + i * 7.5 + j * 2, 0.95 + Math.sin(j / 3 * Math.PI) * 1.0);
      });
      return 3 + 2 * 7.5 + 8;
    },
    powerNode(zw) {
      const lane = irand(0, 2);
      addPickup(pick(['magnet', 'shield', 'x2']), lane, zw + 2, 1.0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        // ring around power-up in world lane coords
        const px = LANE_X(lane) + Math.cos(a) * 1.1;
        const laneF = px / CFG.laneW + 1;
        addPickup('bud', laneF, zw + 2 + Math.sin(a) * 1.2, 0.95);
      }
      return 10;
    },
    rest(zw) { // breathing room with side-jump buds
      for (let i = 0; i < 3; i++) addPickup('bud', irand(0, 2), zw + 2 + i * 3.5, 0.95);
      return 12;
    },
  };

  const POOLS = [
    { min: 0,  list: ['budsLine', 'fenceSingle', 'budsArc', 'budsWeave', 'rest', 'powerNode'] },
    { min: 17, list: ['cratePair', 'signDuck', 'fenceDouble', 'budsArc', 'budsWeave', 'powerNode'] },
    { min: 24, list: ['trainSingle', 'gauntlet', 'cratePair', 'signDuck', 'fenceDouble'] },
    { min: 30, list: ['trainDouble', 'trainSingle', 'gauntlet', 'cratePair', 'signDuck'] },
  ];

  function spawnNext() {
    let name;
    if (G.introQueue.length) name = G.introQueue.shift();
    else {
      const tier = POOLS.filter(p => G.speed >= p.min).pop();
      name = pick(tier.list);
    }
    const depth = P[name](G.nextPatZ) || 10;
    const gap = clamp(G.speed * 0.62, 11, 26);
    G.nextPatZ += depth + gap;
  }

  function addObstacle(type, lane, zw, depth) {
    const spec = {
      fence: { w: 1.95, h: 1.05, y0: 0 },
      crate: { w: 1.7, h: 2.5, y0: 0 },
      sign:  { w: 2.1, h: 2.55, y0: 0 },
      train: { w: 2.05, h: 3.35, y0: 0 },
    }[type];
    G.obstacles.push({
      type, lane, x: LANE_X(lane), zw, depth,
      w: spec.w, h: spec.h, y0: spec.y0,
      passed: false, hit: false, seed: Math.random() * 10,
    });
  }

  function addPickup(type, lane, zw, y) {
    if (G.pickups.length > 90) return;
    G.pickups.push({
      type, x: LANE_X(lane), laneF: lane, zw, y: y || 0.95,
      taken: false, seed: Math.random() * 10,
    });
  }

  function spawnDecor() {
    while (G.decorZ < G.dist + CFG.zFar + 10) {
      const zw = G.decorZ;
      // trees both sides
      for (const side of [-1, 1]) {
        if (Math.random() < 0.75) {
          G.decors.push({
            type: 'tree', zw,
            x: side * (CFG.roadHalf + rand(1.0, 3.6)),
            s: rand(0.8, 2.0), seed: Math.random() * 10,
          });
        }
      }
      if (Math.random() < 0.4) {
        const side = Math.random() < 0.5 ? -1 : 1;
        G.decors.push({ type: 'lamp', zw: zw + 2, x: side * (CFG.roadHalf + 0.7), s: 1, seed: 0 });
      }
      // branding arch gate every ~420 units
      if (Math.floor(zw / 420) !== Math.floor((zw + 7) / 420)) {
        G.decors.push({ type: 'gate', zw: zw + 4, x: 0, s: 1, seed: 0 });
      }
      G.decorZ += 7;
    }
  }

  /* ================= actions ================= */
  const act = {
    move(dir) {
      const pl = G.player;
      if (!pl.alive || G.mode === 'dead') return;
      const nl = clamp(pl.lane + dir, 0, 2);
      if (nl !== pl.lane) {
        pl.lane = nl;
        A.sfx.lane();
      }
    },
    jump() {
      const pl = G.player;
      if (!pl.alive || G.mode === 'dead') return;
      if (!pl.jumping && !pl.rolling) {
        pl.jumping = true;
        pl.vy = CFG.jumpV;
        pl.rolling = false;
        A.sfx.jump();
        burst('dust', pl.x, 0.05, G.dist + CFG.playerZ, 6, { sp0: 1, sp1: 3, vy0: 0.5, vy1: 2, life: 0.4, s0: 0.1, s1: 0.22 });
      } else {
        pl.jumpBuf = 0.12; // buffer for landing
      }
    },
    roll() {
      const pl = G.player;
      if (!pl.alive || G.mode === 'dead') return;
      if (pl.jumping) { pl.vy = Math.min(pl.vy, -14); } // fast-fall into roll
      pl.rolling = true;
      pl.rollT = CFG.rollTime;
      A.sfx.roll();
    },
  };

  /* ================= crash ================= */
  function crash(ob) {
    const pl = G.player;
    pl.alive = false;
    pl.vy = 7;
    pl.rot = 0;
    G.mode = 'dead';
    G.crashT = 0;
    G.timeScale = 0.28;
    G.shake = 18;
    G.flashFlag = 1;
    G.streakBest = Math.max(G.streakBest, G.streak);
    A.musicStop(0.3);
    A.musicDuck(true);
    A.sfx.crash();
    burst('leaf', pl.x, 1.1, G.dist + CFG.playerZ, 16, { sp0: 3, sp1: 9, vy0: 2, vy1: 9, life: 1.0, s0: 0.1, s1: 0.22 });
    burst('spark', pl.x, 1.0, G.dist + CFG.playerZ, 14, { sp0: 2, sp1: 10, vy0: 1, vy1: 8, life: 0.7, spr: 'sparkGreen' });
    burst('dust', pl.x, 0.4, G.dist + CFG.playerZ, 10, { sp0: 1, sp1: 5, vy0: 0.5, vy1: 3, life: 0.8, s0: 0.15, s1: 0.4 });
    if (ob) ob.hit = true;
  }

  function shieldSave() {
    G.shield = false;
    G.invulnT = 1.2;
    G.shake = 8;
    const pl = G.player;
    A.sfx.power();
    burst('spark', pl.x, 1.1, G.dist + CFG.playerZ, 18, { sp0: 3, sp1: 8, vy0: 1, vy1: 6, life: 0.6, spr: 'sparkTeal' });
    addPop('SHIELD SAVED YOU!', pl.x, 2.2, G.dist + CFG.playerZ, '#7dffa8', true);
  }

  /* ================= collision & pickup ================= */
  function collide(dt) {
    const pl = G.player;
    const pz = G.dist + CFG.playerZ;
    const bodyTop = pl.y + (pl.rolling ? 0.95 : 1.95);
    const bodyBot = pl.y + 0.02;

    for (let i = 0; i < G.obstacles.length; i++) {
      const ob = G.obstacles[i];
      const zr = ob.zw - G.dist;
      if (zr < -(ob.depth / 2 + 0.6)) { G.obstacles.splice(i--, 1); continue; }
      if (zr > CFG.zFar + 20) continue;

      // near-miss: passing in an adjacent lane
      if (!ob.passed && zr < CFG.playerZ) {
        ob.passed = true;
        if (!ob.hit && pl.alive && G.mode === 'play') {
          const dx = Math.abs(pl.x - ob.x);
          if (dx > 1.0 && dx < 2.4 && ob.type !== 'fence') {
            addScore(40, pl.x, 1.9, pz, 'NEAR MISS +40', '#35e0d0');
            A.sfx.near();
          }
        }
      }

      if (ob.hit || !pl.alive || G.invulnT > 0) continue;
      if (Math.abs(zr - CFG.playerZ) > ob.depth / 2 + 0.45) continue;
      if (Math.abs(pl.x - ob.x) > (ob.w / 2 + 0.42)) continue;
      if (bodyBot < ob.y0 + ob.h && bodyTop > ob.y0 + 0.08) {
        if (G.shield) { shieldSave(); ob.hit = true; }
        else crash(ob);
      }
    }

    for (let i = 0; i < G.pickups.length; i++) {
      const pk = G.pickups[i];
      const zr = pk.zw - G.dist;
      if (zr < -1 || pk.taken) { G.pickups.splice(i--, 1); continue; }
      if (zr > CFG.zFar) continue;

      // magnet pull
      if (G.magnetT > 0 && pl.alive && zr < 8 && zr > 0.5 && (pk.type === 'bud' || pk.type === 'gold')) {
        const k = Math.min(1, dt * 9);
        pk.x += (pl.x - pk.x) * k;
        pk.y += (0.9 + pl.y - pk.y) * k;
        pk.zw += (pz - pk.zw) * Math.min(1, dt * 5);
      }

      if (!pl.alive) continue;
      if (Math.abs(zr - CFG.playerZ) > 1.05) continue;
      if (Math.abs(pl.x - pk.x) > 0.95) continue;
      if (Math.abs(pk.y - (pl.y + 0.85)) > 1.15) continue;

      // collected!
      pk.taken = true;
      collect(pk);
    }
  }

  function collect(pk) {
    const pz = G.dist + CFG.playerZ;
    const px = pk.x;
    if (G.mode === 'menu') { // attract mode: pure eye candy
      burst('spark', px, pk.y, pz, 5, { spr: 'sparkGreen', life: 0.4, sp0: 1, sp1: 4, vy0: 1, vy1: 4 });
      return;
    }
    if (pk.type === 'bud' || pk.type === 'gold') {
      G.streakT = 1.4;
      G.streak++;
      G.streakBest = Math.max(G.streakBest, G.streak);
      G.comboMult = Math.min(5, 1 + Math.floor(G.streak / 8));
      const base = pk.type === 'gold' ? 150 : 25;
      const val = Math.round(base * G.comboMult * (G.x2T > 0 ? 2 : 1));
      G.score += val;
      if (pk.type === 'gold') {
        G.buds += 5;
        A.sfx.gold();
        burst('spark', px, pk.y, pz, 16, { spr: 'sparkGold', life: 0.8, sp0: 2, sp1: 8, vy0: 2, vy1: 7 });
        addPop('+' + val, px, pk.y + 0.7, pz, '#ffd25f');
      } else {
        G.buds += 1;
        A.sfx.pickup(G.streak % 15);
        burst('spark', px, pk.y, pz, 7, { spr: 'sparkGreen', life: 0.5, sp0: 1.5, sp1: 5, vy0: 1, vy1: 5 });
        addPop('+' + val, px, pk.y + 0.7, pz, '#7dffa8');
      }
      if (G.onPickup) G.onPickup(pk.type);
    } else {
      A.sfx.power();
      if (pk.type === 'magnet') {
        G.magnetT = 8;
        addPop('BUD MAGNET!', px, pk.y + 0.8, pz, '#35e0d0', true);
        burst('spark', px, pk.y, pz, 12, { spr: 'sparkTeal', life: 0.7, sp0: 2, sp1: 7, vy0: 1, vy1: 6 });
      } else if (pk.type === 'shield') {
        G.shield = true;
        addPop('SHIELD UP!', px, pk.y + 0.8, pz, '#7dffa8', true);
        burst('spark', px, pk.y, pz, 12, { spr: 'sparkWhite', life: 0.7, sp0: 2, sp1: 7, vy0: 1, vy1: 6 });
      } else if (pk.type === 'x2') {
        G.x2T = 10;
        addPop('DOUBLE POINTS!', px, pk.y + 0.8, pz, '#ffd25f', true);
        burst('spark', px, pk.y, pz, 12, { spr: 'sparkGold', life: 0.7, sp0: 2, sp1: 7, vy0: 1, vy1: 6 });
      }
    }
  }

  function addScore(v, x, y, z, text, col) {
    G.score += v;
    if (text) addPop(text, x, y, z, col, false);
  }

  /* ================= update ================= */
  function update(dt) {
    const pl = G.player;
    const ts = dt * G.timeScale;
    G.t += ts;

    // speed & distance
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
    }
    G.dist += G.speed * ts;

    // player lateral
    const targetX = LANE_X(pl.lane);
    const k = Math.min(1, ts * 13);
    const prevX = pl.x;
    pl.x += (targetX - pl.x) * k;
    pl.lean += ((pl.x - prevX) * 3.4 - pl.lean) * Math.min(1, dt * 12);

    // vertical
    if (pl.alive) {
      if (pl.jumping) {
        pl.vy += CFG.grav * ts;
        pl.y += pl.vy * ts;
        if (pl.y <= 0) {
          pl.y = 0; pl.vy = 0; pl.jumping = false;
          A.sfx.land();
          G.shake = Math.max(G.shake, 1.6);
          burst('dust', pl.x, 0.05, G.dist + CFG.playerZ, 8, { sp0: 1, sp1: 4, vy0: 0.5, vy1: 2.2, life: 0.45, s0: 0.1, s1: 0.26 });
          if (pl.jumpBuf > 0) { pl.jumpBuf = 0; act.jump(); }
        }
      }
      pl.jumpBuf = Math.max(0, pl.jumpBuf - dt);
      if (pl.rolling) {
        pl.rollT -= ts;
        if (pl.rollT <= 0) pl.rolling = false;
      }
      pl.runPhase += G.speed * ts * 1.55;
      G.invulnT = Math.max(0, G.invulnT - dt);
    } else {
      // tumble
      pl.vy += CFG.grav * ts * 0.8;
      pl.y = Math.max(0, pl.y + pl.vy * ts);
      pl.rot += ts * 9;
    }

    // camera
    G.camX += (pl.x * 0.42 - G.camX) * Math.min(1, ts * 5);

    // streak / combo decay
    if (G.streakT > 0) {
      G.streakT -= ts;
      if (G.streakT <= 0) { G.streak = 0; G.comboMult = 1; }
    }

    // power timers
    if (G.magnetT > 0) {
      G.magnetT -= ts;
      pl.trailT -= dt;
      if (pl.trailT <= 0) { pl.trailT = 0.07; burst('spark', pl.x, 1.2, G.dist + CFG.playerZ, 1, { spr: 'sparkTeal', life: 0.35, sp0: 0.2, sp1: 1.2, vy0: 0.5, vy1: 2, g: 0, s0: 0.08, s1: 0.14 }); }
    }
    if (G.x2T > 0) {
      G.x2T -= ts;
      pl.trailT -= dt;
      if (pl.trailT <= 0) { pl.trailT = 0.09; burst('spark', pl.x, 0.9, G.dist + CFG.playerZ, 1, { spr: 'sparkGold', life: 0.35, sp0: 0.2, sp1: 1.2, vy0: 0.5, vy1: 2, g: 0, s0: 0.08, s1: 0.14 }); }
    }

    // score from distance
    if (G.mode === 'play') G.score += G.speed * ts * 2 * (G.x2T > 0 ? 2 : 1);

    // milestones
    if (G.mode === 'play' && G.dist >= G.milestone) {
      addPop(G.milestone + ' m ✦', 0, 2.6, G.dist + CFG.playerZ + 4, '#a06bff', true);
      A.sfx.milestone();
      G.auroraBoost = 1;
      G.milestone += 500;
    }
    G.auroraBoost = Math.max(0, G.auroraBoost - dt * 0.5);

    // spawn
    while (G.nextPatZ < G.dist + CFG.zFar) spawnNext();
    spawnDecor();

    collide(dt);

    // speed streak particles
    if (G.mode === 'play' && G.speed > 23 && Math.random() < dt * (G.speed - 20) * 0.9 * G.quality) {
      const side = Math.random() < 0.5 ? -1 : 1;
      addPart({
        kind: 'streak',
        x: side * rand(4.2, 8.5), y: rand(0.6, 4.4), z: G.dist + rand(CFG.playerZ + 4, CFG.zFar),
        vx: 0, vy: 0, vz: 0, g: 0,
        life: rand(0.25, 0.5), size: rand(0.05, 0.1),
        rot: 0, vr: 0, spr: null, col: 'rgba(180,255,220,0.5)',
      });
    }

    // particles
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.on) continue;
      p.age += ts;
      if (p.age >= p.life) { p.on = false; continue; }
      p.x += p.vx * ts;
      p.y += p.vy * ts;
      p.z += p.vz * ts;
      p.vy += (p.g || 0) * ts;
      p.rot += p.vr * ts;
      if (p.y < 0 && p.kind !== 'streak') { p.y = 0; p.vy *= -0.4; p.vx *= 0.8; }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const pp = pops[i];
      pp.age += dt;
      pp.y += dt * 1.1;
      if (pp.age >= pp.life) pops.splice(i, 1);
    }

    // shake
    G.shake = Math.max(0, G.shake - dt * 26) * Math.pow(0.0018, dt);
    G.shakeX = rand(-1, 1) * G.shake;
    G.shakeY = rand(-1, 1) * G.shake * 0.7;
  }

  /* ================= lazy decor sprites ================= */
  const decorCache = {};
  function ensureDecorSprites() {
    if (decorCache.trees) return;
    decorCache.trees = [0.85, 1.2, 1.6].map(sc => {
      const w = 90 * sc, h = 150 * sc;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      // trunk
      x.fillStyle = '#241a33';
      x.fillRect(w / 2 - w * 0.05, h * 0.82, w * 0.1, h * 0.18);
      // 3 canopy triangles with aurora rim
      const cols = ['#123524', '#0f4a2e', '#0d3a44'];
      for (let i = 0; i < 3; i++) {
        const ty = h * (0.62 - i * 0.22);
        const tw = w * (0.46 - i * 0.1);
        x.fillStyle = cols[i];
        x.beginPath();
        x.moveTo(w / 2, ty - h * 0.3);
        x.lineTo(w / 2 - tw, ty);
        x.lineTo(w / 2 + tw, ty);
        x.closePath();
        x.fill();
        x.strokeStyle = 'rgba(80,230,200,0.30)';
        x.lineWidth = 2;
        x.stroke();
      }
      return c;
    });
    // gate arch banner
    const gw = 640, gh = 150;
    const gc = document.createElement('canvas');
    gc.width = gw; gc.height = gh;
    const gx = gc.getContext('2d');
    gx.fillStyle = 'rgba(8,10,30,0.92)';
    roundRect(gx, 4, 4, gw - 8, gh - 8, 26);
    gx.fill();
    gx.strokeStyle = '#3dff88';
    gx.lineWidth = 5;
    gx.shadowColor = '#3dff88';
    gx.shadowBlur = 18;
    gx.stroke();
    gx.shadowBlur = 0;
    gx.fillStyle = '#7dffa8';
    gx.font = '400 64px Righteous, Arial Black, sans-serif';
    gx.textAlign = 'center';
    gx.textBaseline = 'middle';
    gx.shadowColor = 'rgba(61,255,136,0.9)';
    gx.shadowBlur = 22;
    gx.fillText('NORTHERN LIGHTS', gw / 2, gh / 2 + 2);
    gx.shadowBlur = 0;
    gx.font = '900 22px Nunito, sans-serif';
    gx.fillStyle = '#a06bff';
    gx.fillText('✦ HERBAL WELLNESS · LENASIA ✦', gw / 2, gh - 26);
    decorCache.gate = gc;
  }
  function roundRect(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }

  /* ================= render helpers ================= */
  function drawBox(x, ctx, ob, zN, zF, w, y0, y1, colF, colS, colT, outline) {
    const xL = x - w / 2, xR = x + w / 2;
    const fFL = proj(xL, y0, zF), fFR = proj(xR, y0, zF), fTL = proj(xL, y1, zF), fTR = proj(xR, y1, zF);
    const nFL = proj(xL, y0, zN), nFR = proj(xR, y0, zN), nTL = proj(xL, y1, zN), nTR = proj(xR, y1, zN);
    // far face
    ctx.fillStyle = colS;
    quad(ctx, fFL, fFR, fTR, fTL);
    // visible side
    const visL = (x - G.camX) > 0; // camera left of box -> see its left side... camera at camX; if box right of camera we see left face
    if (visL) {
      ctx.fillStyle = colS;
      quad(ctx, fFL, nFL, nTL, fTL);
    } else {
      ctx.fillStyle = colS;
      quad(ctx, fFR, nFR, nTR, fTR);
    }
    // top (only if below camera)
    if (y1 < CFG.camH) {
      ctx.fillStyle = colT;
      quad(ctx, fTL, fTR, nTR, nTL);
    }
    // near face
    ctx.fillStyle = colF;
    quad(ctx, nFL, nFR, nTR, nTL);
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(1, nTL.s * 0.03);
      ctx.beginPath();
      ctx.moveTo(nFL.x, nFL.y); ctx.lineTo(nFR.x, nFR.y); ctx.lineTo(nTR.x, nTR.y); ctx.lineTo(nTL.x, nTL.y); ctx.closePath();
      ctx.stroke();
    }
    return { nFL, nFR, nTL, nTR };
  }

  function quad(ctx, a, b, c, d) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  /* ================= render ================= */
  function render(ctx) {
    const W = G.W, H = G.H, hy = G.horizonY;
    ensureDecorSprites();

    // ---- sky ----
    const sky = ctx.createLinearGradient(0, 0, 0, hy + 40);
    const hueShift = Math.sin(G.t * 0.05) * 8;
    sky.addColorStop(0, `rgb(${9 + hueShift | 0},10,${36})`);
    sky.addColorStop(0.55, '#141a45');
    sky.addColorStop(1, '#2a2470');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hy + 2);

    // stars
    if (S.stars) ctx.drawImage(S.stars, -G.camX * 2, 0);

    // auroras
    if (S.auroras) {
      ctx.globalCompositeOperation = 'screen';
      const boost = 0.75 + G.auroraBoost * 0.6;
      for (let i = 0; i < S.auroras.length; i++) {
        const a = S.auroras[i];
        const ox = Math.sin(G.t * (0.05 + i * 0.023) + i * 2) * W * 0.07 - G.camX * (1.2 + i * 0.6) - a.width * 0.2;
        const oy = hy - a.height * (0.86 - i * 0.06) + Math.sin(G.t * 0.1 + i) * 6;
        ctx.globalAlpha = (0.8 + Math.sin(G.t * 0.07 + i * 1.7) * 0.18) * boost;
        ctx.drawImage(a, ox, oy);
        ctx.drawImage(a, ox + a.width * 0.75, oy - 14);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // moon
    if (S.moon) ctx.drawImage(S.moon, W * 0.78 - G.camX * 1.5, hy * 0.08, 130, 130);

    // mountains (slow parallax scroll)
    if (S.mtn) {
      const mx = -((G.dist * 0.55) % S.mtn.width) - G.camX * 3;
      ctx.drawImage(S.mtn, mx, hy - S.mtn.height + 2);
      ctx.drawImage(S.mtn, mx + S.mtn.width, hy - S.mtn.height + 2);
    }

    // ---- ground ----
    const gr = ctx.createLinearGradient(0, hy, 0, H);
    gr.addColorStop(0, '#101433');
    gr.addColorStop(0.4, '#0c1129');
    gr.addColorStop(1, '#080b1e');
    ctx.fillStyle = gr;
    ctx.fillRect(0, hy, W, H - hy);

    // ---- apply shake to world ----
    ctx.save();
    ctx.translate(G.shakeX, G.shakeY);

    // ---- road ----
    const rn = proj(0, 0, 0.5), rf = proj(0, 0, CFG.zFar);
    const rnL = proj(-CFG.roadHalf, 0, 0.5), rnR = proj(CFG.roadHalf, 0, 0.5);
    const rfL = proj(-CFG.roadHalf, 0, CFG.zFar), rfR = proj(CFG.roadHalf, 0, CFG.zFar);
    const roadGrad = ctx.createLinearGradient(0, rf.y, 0, rn.y);
    roadGrad.addColorStop(0, '#191d3f');
    roadGrad.addColorStop(0.5, '#141735');
    roadGrad.addColorStop(1, '#1c2048');
    ctx.fillStyle = roadGrad;
    quad(ctx, rnL, rnR, rfR, rfL);

    // neon edge rails
    drawRail(ctx, -CFG.roadHalf, '#35e0d0');
    drawRail(ctx, CFG.roadHalf, '#ff5fd0');

    // lane dashes
    ctx.fillStyle = 'rgba(200,215,255,0.30)';
    const startZ = Math.floor(G.dist / CFG.stripe) * CFG.stripe;
    for (let zw = startZ; zw < G.dist + CFG.zFar; zw += CFG.stripe) {
      const z1 = zw - G.dist, z2 = z1 + CFG.stripe * 0.42;
      if (z2 < 0.5) continue;
      for (const lx of [-CFG.laneW / 2, CFG.laneW / 2]) {
        const a = proj(lx - 0.05, 0, Math.max(z1, 0.5)), b = proj(lx + 0.05, 0, Math.max(z1, 0.5));
        const c = proj(lx + 0.05, 0, z2), d = proj(lx - 0.05, 0, z2);
        quad(ctx, a, b, c, d);
      }
    }

    // ---- decors (far to near) ----
    for (let i = 0; i < G.decors.length; i++) {
      const d = G.decors[i];
      const zr = d.zw - G.dist;
      if (zr < 0.4 || zr > CFG.zFar) { continue; }
      drawDecor(ctx, d, zr);
    }
    // cull decor
    if (G.decors.length > 260) G.decors.splice(0, G.decors.length - 260);

    // ---- obstacles + pickups sorted far -> near, split around player ----
    const list = [];
    for (const ob of G.obstacles) {
      const zr = ob.zw - G.dist;
      if (zr > 0.4 && zr < CFG.zFar) list.push({ z: zr, ob });
    }
    for (const pk of G.pickups) {
      const zr = pk.zw - G.dist;
      if (!pk.taken && zr > 0.4 && zr < CFG.zFar) list.push({ z: zr, pk });
    }
    list.sort((a, b) => b.z - a.z);

    let playerDrawn = false;
    for (const item of list) {
      if (!playerDrawn && item.z < CFG.playerZ) { drawPlayer(ctx); playerDrawn = true; }
      if (item.ob) drawObstacle(ctx, item.ob, item.z);
      else drawPickup(ctx, item.pk, item.z);
    }
    if (!playerDrawn) drawPlayer(ctx);

    // ---- particles ----
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.on) continue;
      const zr = p.z - G.dist;
      if (zr < 0.3 || zr > CFG.zFar) continue;
      const pr = proj(p.x, p.y, zr);
      const lifeF = 1 - p.age / p.life;
      if (p.kind === 'streak') {
        const tail = proj(p.x, p.y, zr + 2.6);
        ctx.strokeStyle = p.col;
        ctx.lineWidth = Math.max(1, pr.s * p.size);
        ctx.beginPath();
        ctx.moveTo(pr.x, pr.y);
        ctx.lineTo(tail.x, tail.y);
        ctx.stroke();
      } else {
        const spr = p.spr ? S[p.spr] : S.sparkWhite;
        const sz = pr.s * p.size * (p.kind === 'dust' ? 1 + p.age * 2 : 1) * 2;
        ctx.globalAlpha = clamp(lifeF * 1.4, 0, 1);
        if (p.kind === 'leaf') {
          ctx.save();
          ctx.translate(pr.x, pr.y);
          ctx.rotate(p.rot);
          ctx.drawImage(S.leafGreen, -sz * 0.5, -sz * 0.5, sz, sz);
          ctx.restore();
        } else if (spr) {
          ctx.drawImage(spr, pr.x - sz, pr.y - sz, sz * 2, sz * 2);
        }
        ctx.globalAlpha = 1;
      }
    }

    // ---- popups ----
    for (const pp of pops) {
      const zr = pp.z - G.dist;
      if (zr < 0.5 || zr > CFG.zFar) continue;
      const pr = proj(pp.x, pp.y, zr);
      const f = pp.age / pp.life;
      const alpha = f < 0.75 ? 1 : 1 - (f - 0.75) / 0.25;
      const size = clamp(pr.s * (pp.big ? 0.62 : 0.4), 12, 64);
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${size}px Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = 'rgba(5,8,20,0.85)';
      ctx.strokeText(pp.text, pr.x, pr.y);
      ctx.fillStyle = pp.col;
      ctx.fillText(pp.text, pr.x, pr.y);
      ctx.globalAlpha = 1;
    }

    ctx.restore(); // shake
  }

  function drawRail(ctx, lx, col) {
    const a = proj(lx, 0.02, 0.5), b = proj(lx, 0.02, CFG.zFar);
    const w0 = Math.max(1.5, a.s * 0.09), w1 = Math.max(0.5, b.s * 0.09);
    const grd = ctx.createLinearGradient(a.x, 0, b.x, 0);
    grd.addColorStop(0, col);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = grd;
    ctx.lineWidth = w0;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawDecor(ctx, d, zr) {
    const p = proj(d.x, 0, zr);
    if (d.type === 'tree') {
      const h = p.s * 2.6 * d.s;
      const w = h * 0.6;
      ctx.drawImage(decorCache.trees[d.s > 1.4 ? 2 : d.s > 1.05 ? 1 : 0], p.x - w / 2, p.y - h, w, h);
    } else if (d.type === 'lamp') {
      const top = proj(d.x, 3.4, zr);
      ctx.strokeStyle = '#232a55';
      ctx.lineWidth = Math.max(1, p.s * 0.07);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
      const gs = p.s * 1.1;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(S.sparkTeal, top.x - gs, top.y - gs, gs * 2, gs * 2);
      ctx.globalAlpha = 1;
    } else if (d.type === 'gate') {
      // two poles + banner across the road
      const pl2 = proj(-CFG.roadHalf - 0.3, 0, zr), pr2 = proj(CFG.roadHalf + 0.3, 0, zr);
      const tl = proj(-CFG.roadHalf - 0.3, 4.6, zr), tr = proj(CFG.roadHalf + 0.3, 4.6, zr);
      ctx.fillStyle = '#151a3f';
      quad(ctx, pl2, tl, tr, pr2);
      const gw = tr.x - tl.x;
      const gh = gw * (150 / 640);
      ctx.drawImage(decorCache.gate, tl.x, tl.y - gh * 0.45, gw, gh);
      // pole glow
      ctx.globalAlpha = 0.5;
      ctx.drawImage(S.sparkGreen, tl.x - p.s * 0.8, tl.y - p.s * 0.8, p.s * 1.6, p.s * 1.6);
      ctx.drawImage(S.sparkGreen, tr.x - p.s * 0.8, tr.y - p.s * 0.8, p.s * 1.6, p.s * 1.6);
      ctx.globalAlpha = 1;
    }
  }

  function drawObstacle(ctx, ob, zr) {
    const zN = Math.max(0.6, zr - ob.depth / 2);
    const zF = zr + ob.depth / 2;
    const p = proj(ob.x, 0, zr);

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    quad(ctx, proj(ob.x - ob.w / 2, 0.01, zN), proj(ob.x + ob.w / 2, 0.01, zN),
      proj(ob.x + ob.w / 2, 0.01, zF), proj(ob.x - ob.w / 2, 0.01, zF));

    if (ob.type === 'fence') {
      drawBox(ob.x, ctx, ob, zN, zF, ob.w, 0.05, ob.h, '#182046', '#12173a', '#20295c', '#3dff88');
      // hazard stripes on near face (screen-oriented: top edge has smaller y)
      const ptl = proj(ob.x - ob.w / 2, ob.h, zN), pbr = proj(ob.x + ob.w / 2, 0.05, zN);
      const fw = pbr.x - ptl.x, fh = pbr.y - ptl.y;
      if (fw > 6 && fh > 4) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(ptl.x, ptl.y, fw, fh);
        ctx.clip();
        ctx.strokeStyle = 'rgba(61,255,136,0.75)';
        ctx.lineWidth = Math.max(2, fh * 0.18);
        const step = Math.max(3, fh * 0.55);
        for (let sx = ptl.x - fh; sx < pbr.x + fh; sx += step) {
          ctx.beginPath();
          ctx.moveTo(sx, pbr.y);
          ctx.lineTo(sx + fh, ptl.y);
          ctx.stroke();
        }
        ctx.restore();
        // top glow line
        ctx.strokeStyle = '#3dff88';
        ctx.lineWidth = Math.max(1.5, p.s * 0.05);
        ctx.beginPath();
        ctx.moveTo(ptl.x, ptl.y);
        ctx.lineTo(pbr.x, ptl.y);
        ctx.stroke();
      }
    } else if (ob.type === 'crate') {
      const c = drawBox(ob.x, ctx, ob, zN, zF, ob.w, 0.05, ob.h, '#241b45', '#181135', '#332659', '#a06bff');
      // leaf emblem on near face
      const emS = clamp(p.s * ob.w * 0.5, 8, 120);
      const emY = (c.nTL.y + c.nFL.y) / 2;
      if (emS > 8) {
        ctx.globalAlpha = 0.9;
        ctx.drawImage(S.leafGreen, p.x - emS / 2, emY - emS / 2, emS, emS);
        ctx.globalAlpha = 1;
      }
      // glow strip
      const g1 = proj(ob.x - ob.w / 2, ob.h * 0.72, zN), g2 = proj(ob.x + ob.w / 2, ob.h * 0.72, zN);
      ctx.strokeStyle = '#a06bff';
      ctx.lineWidth = Math.max(1, p.s * 0.045);
      ctx.beginPath(); ctx.moveTo(g1.x, g1.y); ctx.lineTo(g2.x, g2.y); ctx.stroke();
    } else if (ob.type === 'sign') {
      // posts
      drawBox(ob.x - ob.w / 2 + 0.12, ctx, ob, zN, zF, 0.16, 0, ob.h, '#1a2148', '#141938', '#252d5e', null);
      drawBox(ob.x + ob.w / 2 - 0.12, ctx, ob, zN, zF, 0.16, 0, ob.h, '#1a2148', '#141938', '#252d5e', null);
      // overhead panel: y 1.25 .. 2.55  (roll under it)
      const panel = drawBox(ob.x, ctx, ob, zN, zF, ob.w, 1.25, 2.55, '#0f4a2e', '#0b3524', '#136640', '#3dff88');
      // leaf icon centered
      const iw = clamp(p.s * ob.w * 0.42, 10, 140);
      const iy = (panel.nTL.y + panel.nTR.y) / 2;
      if (iw > 10) {
        ctx.globalAlpha = 0.95;
        ctx.drawImage(S.leafGreen, p.x - iw / 2, iy - iw / 2, iw, iw);
        ctx.globalAlpha = 1;
      }
      // dangling light
      const lp = proj(ob.x, 1.18, zN);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(S.sparkGold, lp.x - p.s * 0.35, lp.y - p.s * 0.35, p.s * 0.7, p.s * 0.7);
      ctx.globalAlpha = 1;
    } else if (ob.type === 'train') {
      drawBox(ob.x, ctx, ob, zN, zF, ob.w, 0.05, ob.h, '#2b1b52', '#1d1240', '#3a2a6b', '#a06bff');
      // near face: headlight + emblem
      const hl = proj(ob.x, ob.h * 0.32, zN);
      const hs = clamp(p.s * 0.9, 6, 90);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(S.sparkWhite, hl.x - hs, hl.y - hs, hs * 2, hs * 2);
      const emS = clamp(p.s * ob.w * 0.42, 8, 110);
      ctx.drawImage(S.leafGreen, p.x - emS / 2, p.y - p.s * ob.h * 0.78, emS, emS);
      ctx.globalAlpha = 1;
      // window strip along visible side
      const visL = (ob.x - G.camX) > 0;
      const xa = visL ? ob.x - ob.w / 2 : ob.x + ob.w / 2;
      const w1 = proj(xa, ob.h * 0.62, zN), w2 = proj(xa, ob.h * 0.62, zF);
      ctx.strokeStyle = 'rgba(80,230,255,0.9)';
      ctx.lineWidth = Math.max(1, p.s * 0.09);
      ctx.beginPath(); ctx.moveTo(w1.x, w1.y); ctx.lineTo(w2.x, w2.y); ctx.stroke();
      // roof edge
      const r1 = proj(xa, ob.h, zN), r2 = proj(xa, ob.h, zF);
      ctx.strokeStyle = 'rgba(255,95,208,0.8)';
      ctx.lineWidth = Math.max(1, p.s * 0.06);
      ctx.beginPath(); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.stroke();
    }
  }

  function drawPickup(ctx, pk, zr) {
    const bob = Math.sin(G.t * 3.1 + pk.seed * 7) * 0.12;
    const p = proj(pk.x, pk.y + bob, zr);
    let spr = S.bud, sz = clamp(p.s * 0.62, 8, 130);
    if (pk.type === 'gold') { spr = S.budGold; sz *= 1.25; }
    else if (pk.type === 'magnet') { spr = S.magnet; sz = clamp(p.s * 0.85, 12, 150); }
    else if (pk.type === 'shield') { spr = S.shield; sz = clamp(p.s * 0.85, 12, 150); }
    else if (pk.type === 'x2') { spr = S.x2; sz = clamp(p.s * 0.85, 12, 150); }
    // fake spin
    const spin = pk.type === 'bud' || pk.type === 'gold' ? Math.abs(Math.sin(G.t * 2.2 + pk.seed * 5)) * 0.35 + 0.65 : 1;
    const w = sz * 2 * spin;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(spr, p.x - w / 2, p.y - sz, w, sz * 2);
    ctx.globalAlpha = 1;
    // halo for power-ups
    if (pk.type !== 'bud' && pk.type !== 'gold') {
      ctx.globalAlpha = 0.5 + Math.sin(G.t * 5 + pk.seed) * 0.2;
      ctx.drawImage(S.sparkWhite, p.x - sz * 1.4, p.y - sz * 1.4, sz * 2.8, sz * 2.8);
      ctx.globalAlpha = 1;
    }
  }

  /* ================= player ================= */
  function drawPlayer(ctx) {
    const pl = G.player;
    const pz = G.dist + CFG.playerZ;
    const base = proj(pl.x, 0, pz);
    const u = base.s; // pixels per world unit
    const feet = proj(pl.x, pl.y, pz);

    // shadow
    const shR = clamp(u * 0.55 * (1 - pl.y * 0.18), 4, 90);
    ctx.globalAlpha = clamp(0.38 - pl.y * 0.09, 0.08, 0.38);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, shR, shR * 0.32, 0, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;

    // blink when invulnerable
    if (G.invulnT > 0 && Math.floor(G.invulnT * 14) % 2 === 0) return;

    ctx.save();
    ctx.translate(feet.x, feet.y);
    if (!pl.alive) ctx.rotate(pl.rot);
    ctx.scale(u, u);
    ctx.rotate(pl.lean * 0.5);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const rollF = pl.rolling ? clamp(pl.rollT / CFG.rollTime, 0, 1) : 0;

    if (pl.rolling && rollF > 0.15) {
      // ---- ball roll ----
      const r = 0.5;
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, -r, r * 1.15);
      g.addColorStop(0, '#3fe98a');
      g.addColorStop(0.7, '#149957');
      g.addColorStop(1, '#0a5c33');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -r, r, 0, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(125,255,168,0.8)';
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.save();
      ctx.translate(0, -r);
      ctx.rotate(-pl.runPhase * 0.8);
      ctx.drawImage(S.leafGreen, -0.3, -0.3, 0.6, 0.6);
      ctx.restore();
    } else {
      // ---- runner ----
      const ph = pl.runPhase;
      const air = pl.jumping;
      const bob = air ? 0 : Math.abs(Math.sin(ph)) * 0.045;
      const hipY = 0.92 + bob;
      const shY = 1.42 + bob;
      const legSw = air ? 0.35 : Math.sin(ph) * 0.42;
      const legSw2 = air ? -0.3 : Math.sin(ph + Math.PI) * 0.42;

      // legs
      ctx.strokeStyle = '#1b2140';
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      ctx.moveTo(-0.14, hipY); ctx.lineTo(-0.14 + legSw * 0.5, air ? 0.45 : Math.max(0.06, hipY - 0.72 + Math.abs(legSw) * 0.3)); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.14, hipY); ctx.lineTo(0.14 + legSw2 * 0.5, air ? 0.5 : Math.max(0.06, hipY - 0.72 + Math.abs(legSw2) * 0.3)); ctx.stroke();
      // shoes
      ctx.strokeStyle = '#e8f6ff';
      ctx.lineWidth = 0.1;
      const f1y = air ? 0.45 : Math.max(0.06, hipY - 0.72 + Math.abs(legSw) * 0.3);
      const f2y = air ? 0.5 : Math.max(0.06, hipY - 0.72 + Math.abs(legSw2) * 0.3);
      ctx.beginPath(); ctx.moveTo(-0.14 + legSw * 0.5 - 0.07, f1y); ctx.lineTo(-0.14 + legSw * 0.5 + 0.09, f1y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.14 + legSw2 * 0.5 - 0.07, f2y); ctx.lineTo(0.14 + legSw2 * 0.5 + 0.09, f2y); ctx.stroke();

      // torso hoodie
      const tg = ctx.createLinearGradient(-0.3, shY, 0.3, hipY);
      tg.addColorStop(0, '#2fe57f');
      tg.addColorStop(1, '#0e8f4d');
      ctx.fillStyle = tg;
      roundRect(ctx, -0.3, shY - 0.1, 0.6, hipY - shY + 0.28, 0.16);
      ctx.fill();
      // rim light
      ctx.strokeStyle = 'rgba(80,230,220,0.85)';
      ctx.lineWidth = 0.045;
      ctx.beginPath();
      ctx.moveTo(-0.28, shY + 0.05);
      ctx.lineTo(-0.3, hipY - 0.1);
      ctx.stroke();

      // arms
      ctx.strokeStyle = '#27c96f';
      ctx.lineWidth = 0.12;
      const armSw = air ? -0.6 : Math.sin(ph + Math.PI) * 0.5;
      const armSw2 = air ? -0.6 : Math.sin(ph) * 0.5;
      ctx.beginPath();
      ctx.moveTo(-0.3, shY); ctx.lineTo(-0.42 + armSw * 0.3, shY + 0.28); ctx.lineTo(-0.36 + armSw * 0.45, shY - 0.02 + (air ? -0.25 : 0)); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.3, shY); ctx.lineTo(0.42 + armSw2 * 0.3, shY + 0.28); ctx.lineTo(0.36 + armSw2 * 0.45, shY - 0.02 + (air ? -0.25 : 0)); ctx.stroke();

      // head + hood
      const hdY = shY - 0.32 + bob;
      ctx.fillStyle = '#ffd9b0';
      ctx.beginPath();
      ctx.arc(0.02, hdY, 0.2, 0, 7);
      ctx.fill();
      // hood rim
      ctx.strokeStyle = '#2fe57f';
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.arc(0, hdY, 0.22, Math.PI * 0.65, Math.PI * 2.05);
      ctx.stroke();
      // headphones band
      ctx.strokeStyle = '#35e0d0';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.arc(0.02, hdY, 0.235, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    // shield bubble
    if (G.shield) {
      ctx.strokeStyle = `rgba(125,255,168,${0.55 + Math.sin(G.t * 6) * 0.2})`;
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.arc(0, -0.9, 1.05, 0, 7);
      ctx.stroke();
      ctx.fillStyle = 'rgba(125,255,168,0.07)';
      ctx.fill();
    }

    ctx.restore();

    // magnet aura ring on ground
    if (G.magnetT > 0 && pl.alive) {
      const rr = u * (1.3 + Math.sin(G.t * 4) * 0.15);
      ctx.strokeStyle = 'rgba(53,224,208,0.35)';
      ctx.lineWidth = Math.max(1.5, u * 0.05);
      ctx.beginPath();
      ctx.ellipse(base.x, base.y, rr, rr * 0.3, 0, 0, 7);
      ctx.stroke();
    }
  }

  /* ================= exports ================= */
  window.E = { CFG, G, act, resetWorld, update, render, proj };
})();
