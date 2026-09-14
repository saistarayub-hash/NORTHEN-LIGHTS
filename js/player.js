/* ============================================================
   NORTHERN LIGHTS RUN — player.js
   The runner: a jointed procedural humanoid (DOC — dark skin,
   black dreadlocks, tilted dark-teal snapback, emerald hoodie
   with neon leaf, black joggers, white/mint sneakers, gold
   chain), hoverboard (lobby-selected colors), jetpack, shield
   bubble, blob shadow — plus the animated state machine
   (RUN / JUMP tuck / ROLL spin / STUMBLE-TUMBLE / HOVERBOARD
   surf stance / JETPACK dangle), squash-and-stretch, ~12°
   lane-change lean, and the third-person chase camera
   (4.2 behind, 2.6 up, FOV 62→70, look-ahead, bob, ramp tilt,
   jetpack rise, crash dolly-in + shake).
   ============================================================ */
import * as THREE from 'three';
import { CFG, G, LANE_X } from './sim.js';
import { charById } from './boards.js';

const P_PZ = CFG.playerZ;
const _clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function mergeLocal(geos) {
  let count = 0;
  const list = geos.map(g => g.toNonIndexed());
  list.forEach(g => { count += g.attributes.position.count; });
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o3 = 0, o2 = 0;
  list.forEach(g => {
    pos.set(g.attributes.position.array, o3);
    nor.set(g.attributes.normal.array, o3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o2);
    o3 += g.attributes.position.array.length;
    o2 += g.attributes.uv ? g.attributes.uv.array.length : 0;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

export function createPlayer(scene, camera) {
  const P = { root: null, rig: null, charId: 'doc' };

  function limbGeo(radius, len) {
    return new THREE.CapsuleGeometry(radius, len, 3, 8);
  }

  /* ---------------- build DOC rig ---------------- */
  function buildRig(char) {
    if (P.rig) {
      P.root.remove();
      P.rig.dispose();
    }
    const root = new THREE.Group();
    const M = {};
    const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75 }, o || {}));

    M.skin = std(char.skin, { roughness: 0.6 });
    M.hood = std(char.hood, { roughness: 0.85 });
    M.hoodDark = std(char.hoodDark, { roughness: 0.9 });
    M.jogger = std(char.jogger, { roughness: 0.85 });
    M.shoe = std(char.shoe, { roughness: 0.4 });
    M.shoeAcc = new THREE.MeshBasicMaterial({ color: char.shoeAccent });
    M.hair = std(char.hair, { roughness: 0.95 });
    M.hat = std(char.hat, { roughness: 0.6 });
    M.gold = std(0xffd25f, { metalness: 0.85, roughness: 0.25 });

    const rig = {};
    const hips = new THREE.Group();
    hips.position.y = 0.92;
    root.add(hips);
    rig.hips = hips;

    // torso (hoodie)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.28), M.hood);
    torso.position.y = 0.3;
    hips.add(torso);
    const hoodBack = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), M.hoodDark);
    hoodBack.position.set(0, 0.46, -0.12);
    hoodBack.scale.set(1, 1.1, 0.8);
    hips.add(hoodBack);
    // chest leaf
    const leafCv = document.createElement('canvas');
    leafCv.width = leafCv.height = 64;
    {
      const x = leafCv.getContext('2d');
      x.clearRect(0, 0, 64, 64);
      x.fillStyle = char.leaf;
      x.font = '44px sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('🍃', 32, 34);
    }
    const leafTex = new THREE.CanvasTexture(leafCv);
    leafTex.colorSpace = THREE.SRGBColorSpace;
    const chestLeaf = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshBasicMaterial({ map: leafTex, transparent: true }));
    chestLeaf.position.set(0.09, 0.34, 0.145);
    hips.add(chestLeaf);
    // chain
    if (char.chain) {
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 18), M.gold);
      chain.position.set(0, 0.52, 0.06);
      chain.rotation.x = 1.25;
      hips.add(chain);
    }

    // head
    const headG = new THREE.Group();
    headG.position.y = 0.66;
    hips.add(headG);
    rig.head = headG;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 12), M.skin);
    headG.add(head);
    // dreadlocks (merged capsules fanned around the skull)
    const dreadParts = [];
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const g = limbGeo(0.032, 0.15);
      const tilt = 0.9 + (i % 3) * 0.18;
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1).set(Math.cos(a), 0, Math.sin(a)).normalize(), tilt);
      m4.makeRotationFromQuaternion(q);
      g.applyMatrix4(m4);
      g.translate(Math.cos(a) * 0.12, 0.05 - Math.sin(tilt) * 0.12, Math.sin(a) * 0.12);
      dreadParts.push(g);
    }
    const dreads = new THREE.Mesh(mergeLocal(dreadParts), M.hair);
    headG.add(dreads);
    // hat
    rig.hatParts = [];
    if (char.hatType === 'snapback' || char.hatType === 'cap') {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.185, 0.07, 14), M.hat);
      disc.position.y = 0.12;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.15), M.hat);
      brim.position.set(0, 0.09, 0.19);
      headG.add(disc, brim);
      headG.rotation.z = -0.14; // tilted
      headG.rotation.x = 0.06;
      rig.hatParts.push(disc, brim);
    } else if (char.hatType === 'beanie') {
      const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hat);
      beanie.position.y = 0.04;
      headG.add(beanie);
      rig.hatParts.push(beanie);
    }

    // arms
    function makeArm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.27, 0.44, 0);
      const upper = new THREE.Mesh(limbGeo(0.055, 0.17), M.hood);
      upper.position.y = -0.13;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.26;
      shoulder.add(elbow);
      const fore = new THREE.Mesh(limbGeo(0.05, 0.15), M.hood);
      fore.position.y = -0.11;
      elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), M.skin);
      hand.position.y = -0.24;
      elbow.add(hand);
      return { shoulder, elbow };
    }
    const armL = makeArm(-1), armR = makeArm(1);
    hips.add(armL.shoulder, armR.shoulder);
    rig.armL = armL.shoulder; rig.elbowL = armL.elbow;
    rig.armR = armR.shoulder; rig.elbowR = armR.elbow;

    // legs
    function makeLeg(side) {
      const hipJ = new THREE.Group();
      hipJ.position.set(side * 0.14, 0, 0);
      const thigh = new THREE.Mesh(limbGeo(0.07, 0.3), M.jogger);
      thigh.position.y = -0.24;
      hipJ.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.46;
      hipJ.add(knee);
      const shin = new THREE.Mesh(limbGeo(0.06, 0.28), M.jogger);
      shin.position.y = -0.22;
      knee.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.3), M.shoe);
      foot.position.set(0, -0.44, 0.06);
      knee.add(foot);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.31), M.shoeAcc);
      sole.position.set(0, -0.485, 0.06);
      knee.add(sole);
      return { hipJ, knee };
    }
    const legL = makeLeg(-1), legR = makeLeg(1);
    hips.add(legL.hipJ, legR.hipJ);
    rig.legL = legL.hipJ; rig.kneeL = legL.knee;
    rig.legR = legR.hipJ; rig.kneeR = legR.knee;

    /* ---------------- hoverboard ---------------- */
    const board = new THREE.Group();
    board.position.y = 0.055;
    board.visible = false;
    const bSel = (window.__nl_board && window.__nl_board()) || { c1: '#35e0d0', c2: '#a06bff', glow: '#7dffa8' };
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.07, 1.05),
      std(bSel.c1, { roughness: 0.35, metalness: 0.3 }));
    board.add(deck);
    const railMat = std(bSel.c2, { roughness: 0.4 });
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 1.0), railMat);
    railL.position.set(-0.32, -0.01, 0);
    const railR = railL.clone();
    railR.position.x = 0.32;
    board.add(railL, railR);
    const underglow = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.92),
      new THREE.MeshBasicMaterial({ color: bSel.glow, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    underglow.rotation.x = Math.PI / 2;
    underglow.position.y = -0.05;
    board.add(underglow);
    const wheelMat = std(bSel.c2);
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.22), wheelMat);
    w1.position.set(0, -0.07, 0.38);
    const w2 = w1.clone(); w2.position.z = -0.38;
    board.add(w1, w2);
    rig.board = board;
    root.add(board);

    /* ---------------- jetpack ---------------- */
    const jet = new THREE.Group();
    jet.position.set(0, 0.34, -0.22);
    jet.visible = false;
    const tankMat = std(0xff5fd0, { roughness: 0.4, metalness: 0.5 });
    const tankL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.16), tankMat);
    tankL.position.set(-0.11, 0.05, 0);
    const tankR = tankL.clone();
    tankR.position.x = 0.11;
    const nozzleMat = std(0x39406e, { metalness: 0.8, roughness: 0.3 });
    const nozL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 8), nozzleMat);
    nozL.position.set(-0.11, -0.22, 0);
    const nozR = nozL.clone();
    nozR.position.x = 0.11;
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const flameL = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.42, 8), flameMat);
    flameL.rotation.x = Math.PI;
    flameL.position.set(-0.11, -0.48, 0);
    const flameR = flameL.clone();
    flameR.position.x = 0.11;
    jet.add(tankL, tankR, nozL, nozR, flameL, flameR);
    rig.jet = jet;
    rig.flames = [flameL, flameR];
    root.add(jet);

    /* ---------------- shield bubble ---------------- */
    const shield = new THREE.Mesh(new THREE.SphereGeometry(1.05, 18, 14),
      new THREE.MeshBasicMaterial({ color: 0x7dffa8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    shield.position.y = 0.9;
    shield.visible = false;
    rig.shield = shield;
    root.add(shield);

    scene.add(root);
    const dispose = () => {
      root.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        }
      });
    };
    P.root = root;
    P.rig = { ...rig, dispose };
    return P.rig;
  }

  /* ---------------- animation ---------------- */
  function pose(dt) {
    const pl = G.player;
    const r = P.rig;
    if (!r) return;
    const t = G.t;
    const root = P.root;
    root.position.set(pl.x, pl.y, P_PZ);

    // lean into lane changes (~12° max)
    const lean = _clamp(pl.lean * 0.55, -0.22, 0.22);
    root.rotation.z = -lean;
    // squash & stretch
    root.scale.y = pl.squash;
    root.scale.x = root.scale.z = 1 / Math.sqrt(Math.max(0.4, pl.squash));

    const set = (j, x, y, z) => { if (j) { j.rotation.x = x || 0; j.rotation.y = y || 0; j.rotation.z = z || 0; } };

    if (pl.state === 'dead') {
      // stumble + tumble: ragdoll spin, limbs flail
      root.rotation.x = pl.rot;
      root.rotation.y = Math.sin(pl.rot * 0.7) * 0.6;
      r.hips.position.y = 0.8;
      const fl = (s) => Math.sin(t * 13 + s) * 0.9;
      set(r.legL, fl(1) - 0.6, 0, 0); set(r.kneeL, 0.4 + Math.abs(fl(2)), 0, 0);
      set(r.legR, fl(3) - 0.4, 0, 0); set(r.kneeR, 0.4 + Math.abs(fl(4)), 0, 0);
      set(r.armL, fl(5) - 1.2, 0, 0.4); set(r.armR, fl(6) - 1.2, 0, -0.4);
      return;
    }

    if (pl.rolling) {
      // tuck-and-spin ball
      const f = _clamp(pl.rollT / CFG.rollTime, 0, 1);
      root.rotation.x = (1 - f) * Math.PI * 2;
      r.hips.position.y = 0.55;
      set(r.legL, 1.5, 0, 0); set(r.kneeL, 1.9, 0, 0);
      set(r.legR, 1.5, 0, 0); set(r.kneeR, 1.9, 0, 0);
      set(r.armL, 1.2, 0, 0.5); set(r.elbowL, 1.6, 0, 0);
      set(r.armR, 1.2, 0, -0.5); set(r.elbowR, 1.6, 0, 0);
      return;
    }

    const ph = pl.runPhase;
    const grounded = pl.state === 'ground' || pl.state === 'roof';

    if (pl.state === 'fly') {
      // jetpack: legs dangle, slight sway
      root.rotation.x = -0.06 + Math.sin(t * 1.7) * 0.03;
      r.hips.position.y = 0.92 + Math.sin(t * 1.9) * 0.02;
      set(r.legL, 0.3 + Math.sin(t * 2.3) * 0.12, 0, 0.08);
      set(r.kneeL, 0.35 + Math.sin(t * 2.3 + 1) * 0.12, 0, 0);
      set(r.legR, 0.3 + Math.sin(t * 2.3 + 2) * 0.12, 0, -0.08);
      set(r.kneeR, 0.35 + Math.sin(t * 2.3 + 3) * 0.12, 0, 0);
      set(r.armL, -0.9, 0, 0.25); set(r.elbowL, 0.4, 0, 0);
      set(r.armR, -0.9, 0, -0.25); set(r.elbowR, 0.4, 0, 0);
      return;
    }

    if (grounded) {
      // run cadence scales with speed
      const amp = pl.state === 'roof' ? 0.7 : 1.0;
      const bob = Math.abs(Math.sin(ph)) * 0.05 * amp;
      r.hips.position.y = 0.92 + bob;
      r.hips.rotation.x = pl.state === 'roof' ? 0.2 : 0.13;
      r.hips.rotation.y = Math.sin(ph) * 0.05;
      set(r.legL, Math.sin(ph) * 0.85 * amp, 0, 0);
      set(r.kneeL, 0.12 + Math.max(0, Math.sin(ph - 0.55)) * 1.05 * amp, 0, 0);
      set(r.legR, -Math.sin(ph) * 0.85 * amp, 0, 0);
      set(r.kneeR, 0.12 + Math.max(0, Math.sin(ph + Math.PI - 0.55)) * 1.05 * amp, 0, 0);
      set(r.armL, Math.sin(ph + Math.PI) * 0.75 * amp, 0, 0.12);
      set(r.elbowL, 0.5 + Math.max(0, Math.sin(ph + Math.PI)) * 0.3, 0, 0);
      set(r.armR, Math.sin(ph) * 0.75 * amp, 0, -0.12);
      set(r.elbowR, 0.5 + Math.max(0, Math.sin(ph)) * 0.3, 0, 0);
    } else {
      // air: tuck on ascent, legs forward on descent
      const rising = pl.vy > 0;
      r.hips.position.y = 0.95;
      r.hips.rotation.x = 0.1;
      set(r.legL, rising ? 0.95 : 0.45, 0, 0);
      set(r.kneeL, rising ? 1.35 : 0.5, 0, 0);
      set(r.legR, rising ? 0.75 : 0.3, 0, 0);
      set(r.kneeR, rising ? 1.1 : 0.35, 0, 0);
      set(r.armL, rising ? -1.1 : -0.7, 0, 0.35);
      set(r.elbowL, 0.5, 0, 0);
      set(r.armR, rising ? -1.1 : -0.7, 0, -0.35);
      set(r.elbowR, 0.5, 0, 0);
    }

    // hoverboard stance
    const onB = G.onBoard;
    if (onB) {
      set(r.legL, 0.55, 0, 0.35); set(r.kneeL, 0.85, 0, 0);
      set(r.legR, -0.3, 0, -0.35); set(r.kneeR, 0.7, 0, 0);
      r.hips.rotation.x = 0.28;
      set(r.armL, -0.35, 0, 1.0);
      set(r.armR, -0.35, 0, -0.85);
      r.board.rotation.x = Math.sin(t * 2.4) * 0.05;
      r.board.rotation.y = Math.sin(t * 1.3) * 0.06;
      r.board.position.y = 0.05 + Math.sin(t * 2.4) * 0.02;
    }

    // attachments
    r.board.visible = onB;
    r.jet.visible = pl.state === 'fly';
    if (pl.state === 'fly') {
      const f = 0.75 + Math.sin(t * 31) * 0.25;
      r.flames.forEach((fl, i) => fl.scale.set(1, f * (i ? 0.92 : 1), 1));
    }
    r.shield.visible = G.shield;
    if (G.shield) r.shield.material.opacity = 0.1 + Math.sin(t * 5) * 0.05;

    // invuln blink
    root.visible = !(G.invulnT > 0 && Math.floor(G.invulnT * 14) % 2 === 0);
  }

  /* ---------------- camera rig ---------------- */
  const cam = {
    pos: new THREE.Vector3(0, 2.6, 1.8),
    look: new THREE.Vector3(0, 1.0, 8),
  };
  camera.fov = 62;
  camera.near = 0.3;
  camera.far = 500;
  camera.position.copy(cam.pos);
  camera.updateProjectionMatrix();

  function updateCamera(dt) {
    const pl = G.player;
    const speed01 = _clamp((G.speed - CFG.speedStart) / (CFG.speedMax - CFG.speedStart), 0, 1);
    const fovT = 62 + 8 * speed01 + G.punch * 3;
    if (Math.abs(fovT - camera.fov) > 0.02) {
      camera.fov += (fovT - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }

    const lookAhead = (pl.x - LANE_X(pl.lane)) * 1.5;
    const jetRise = G.camJet;
    let tx = pl.x * 0.62 + lookAhead;
    let ty = 2.6 + pl.y * 0.38 + jetRise * 2.4;
    let tz = 1.8 + jetRise * 1.4;

    if (G.mode === 'dead') {
      // dramatic dolly-in toward the tumbler
      const f = Math.min(1, G.crashT * 2.2);
      tx = pl.x * 0.85;
      ty = 1.35 + f * 0.3;
      tz = 3.4 - f * 0.4;
    }

    const k = G.mode === 'dead' ? Math.min(1, dt * 3) : Math.min(1, dt * 8); // ~8/s follow
    cam.pos.x += (tx - cam.pos.x) * k;
    cam.pos.y += (ty - cam.pos.y) * k;
    cam.pos.z += (tz - cam.pos.z) * k;

    // run-cadence bob (grounded only)
    const bob = (pl.state === 'ground' && pl.alive) ? Math.abs(Math.sin(pl.runPhase)) * 0.04 : 0;

    let lx = pl.x * 0.85;
    let ly = 1.05 + pl.y * 0.5 + bob + G.camPitch * 1.3 + jetRise * 1.7;
    let lz = P_PZ + 5;
    if (G.mode === 'dead') { lx = pl.x; ly = pl.y + 0.9; lz = P_PZ + 1.5; }

    camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    camera.position.x += G.shakeX * 0.12;
    camera.position.y += G.shakeY * 0.1;
    cam.look.x += (lx - cam.look.x) * Math.min(1, dt * 10);
    cam.look.y += (ly - cam.look.y) * Math.min(1, dt * 10);
    cam.look.z += (lz - cam.look.z) * Math.min(1, dt * 10);
    camera.lookAt(cam.look.x, cam.look.y, cam.look.z);
  }

  function setChar(id) {
    P.charId = id;
    buildRig(charById(id));
  }

  function update(dt) {
    pose(dt);
    updateCamera(dt);
  }

  P.update = update;
  P.setChar = setChar;
  P.reset = () => {
    const camPos = new THREE.Vector3(0, 2.6, 1.8);
    cam.pos.copy(camPos);
    cam.look.set(0, 1.0, 8);
    camera.position.copy(camPos);
    camera.lookAt(cam.look);
  };
  return P;
}
