/* ============================================================
   NORTHERN LIGHTS RUN — world.js
   The 3D stage: gradient sky dome + animated aurora shader +
   stars + moon, purple fog, merged static road (curbs, neon
   lane strips, rails), pooled decor (trees, streetlamps,
   buildings, neon signs, branded arch gates), pooled obstacles
   (fences, crates, leaf signs, rideable trains, oncoming
   trains, ramps), pooled pickups (instanced leaf coins, gold,
   Sodaze cans, power-up billboards, keys), a zero-allocation
   GPU particle system, magnet arcs, sneaker rings, blob
   shadows. Auto quality tiers (DPR 2→1, fog/particle budgets).
   ============================================================ */
import * as THREE from 'three';
import { CFG, G, LANE_X } from './sim.js';
import {
  glowCanvas, blobShadowCanvas, roadTexture, hazardTexture,
  buildingTexture, gateBannerTexture, neonSignTexture,
  coinFaceTexture, sodazeLabelTexture, leafCanvas, BADGES,
} from './textures.js';

const MAXP = 600;
const W_PZ = CFG.playerZ;

export function createWorld(scene, camera, renderer, qualityApi) {
  const W = {
    scene, camera, renderer,
    tier: 2,
    project: null,
  };

  /* ---------------- shared textures ---------------- */
  const shadowTex = new THREE.CanvasTexture(blobShadowCanvas());
  const roadTex = new THREE.CanvasTexture(roadTexture());
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(1, 20);
  roadTex.colorSpace = THREE.SRGBColorSpace;
  const hazardTex = new THREE.CanvasTexture(hazardTexture());
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  const gateTex = new THREE.CanvasTexture(gateBannerTexture());
  gateTex.colorSpace = THREE.SRGBColorSpace;
  const budFace = new THREE.CanvasTexture(coinFaceTexture('#3dff88', '#2be084', '#0f2a1c', '#081410'));
  budFace.colorSpace = THREE.SRGBColorSpace;
  const goldFace = new THREE.CanvasTexture(coinFaceTexture('#ffd25f', '#ffab2e', '#2a1c08', '#140d02'));
  goldFace.colorSpace = THREE.SRGBColorSpace;
  const sodaTex = new THREE.CanvasTexture(sodazeLabelTexture());
  sodaTex.colorSpace = THREE.SRGBColorSpace;
  const leafTex = new THREE.CanvasTexture(leafCanvas(128, '#3dff88', 'rgba(210,255,225,0.9)'));
  leafTex.colorSpace = THREE.SRGBColorSpace;
  leafTex.transparent = true;
  const buildingTexes = [0, 1, 2, 3].map(i => {
    const t = new THREE.CanvasTexture(buildingTexture(31 + i * 17, 0.34 + i * 0.05));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  const signTexes = [
    neonSignTexture('NL', '#3dff88'),
    neonSignTexture('PROTEA AVE', '#a06bff'),
    neonSignTexture('SODAZÉ', '#ff8a3d'),
    neonSignTexture('142', '#35e0d0'),
  ].map(t => { const c = new THREE.CanvasTexture(t); c.colorSpace = THREE.SRGBColorSpace; return c; });

  /* ---------------- sky ---------------- */
  const skyGroup = new THREE.Group();
  scene.add(skyGroup);

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(430, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vDir;
        void main(){
          float y = normalize(vDir).y;
          vec3 top = vec3(0.027,0.031,0.118);
          vec3 mid = vec3(0.078,0.102,0.270);
          vec3 hor = vec3(0.165,0.141,0.440);
          vec3 c = mix(hor, mid, smoothstep(0.0,0.35,y));
          c = mix(c, top, smoothstep(0.30,0.90,y));
          c += vec3(0.25,0.16,0.45) * exp(-abs(y)*7.0) * 0.35;
          gl_FragColor = vec4(c,1.0);
        }`,
    }),
  );
  skyGroup.add(skyDome);

  const auroraMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    transparent: true, blending: THREE.AdditiveBlending,
    uniforms: {
      uT: { value: 0 },
      uBoost: { value: 0.2 },
      uRibbons: { value: 3.0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform float uT; uniform float uBoost; uniform float uRibbons;
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        if (y < 0.02) discard;
        float lon = atan(d.z, d.x);
        vec3 col = vec3(0.0);
        float a = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float m = 0.0;
          if (fi < uRibbons) {
            float yb = 0.30 + fi*0.16 + sin(lon*1.5 + uT*(0.05+fi*0.02) + fi*2.1)*0.05;
            float band = sin(lon*(2.0+fi*0.8) + uT*(0.35+fi*0.13) + sin(y*3.0+uT*0.5)*0.8);
            float d1 = abs(y - (yb + band*0.05));
            float w1 = smoothstep(0.15 + fi*0.06, 0.0, d1);
            float vert = smoothstep(0.16, 0.0, d1*0.75);
            float shimmer = 0.55 + 0.45*sin(lon*(6.0+fi*2.0) + uT*(1.1+fi*0.4) + fi*3.0);
            m = w1 * vert * shimmer;
          }
          vec3 rc = mix(vec3(0.22,1.0,0.70), vec3(0.63,0.42,1.0), fi*0.5);
          if (fi == 2.0) rc = vec3(1.0,0.37,0.80)*0.8 + vec3(0.22,1.0,0.70)*0.2;
          col += rc * m;
          a += m;
        }
        float alpha = a * (0.16 + 0.34*uBoost) * smoothstep(0.02,0.18,y);
        gl_FragColor = vec4(col*(0.85+0.6*uBoost), alpha);
      }`,
  });
  const aurora = new THREE.Mesh(new THREE.SphereGeometry(410, 32, 16), auroraMat);
  skyGroup.add(aurora);

  // stars
  const starN = 520;
  const starPos = new Float32Array(starN * 3);
  {
    let seed = 977;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < starN; i++) {
      const a = rnd() * Math.PI * 2;
      const e = 0.06 + rnd() * 1.25;
      const r = 395;
      starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      starPos[i * 3 + 1] = Math.sin(e) * r;
      starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcfe2ff, size: 1.7, sizeAttenuation: false,
    transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  skyGroup.add(stars);

  // moon
  const moonGlowTex = new THREE.CanvasTexture(glowCanvas('rgba(215,232,255,0.85)', 80));
  const moonCore = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xdcebff, fog: false, transparent: true, opacity: 0.95 }),
  );
  const moon = new THREE.Group();
  moon.add(moonCore);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonGlowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.9,
  }));
  moonSprite.scale.set(190, 190, 1);
  moon.add(moonSprite);
  moon.position.set(185, 185, 400);
  skyGroup.add(moon);

  /* ---------------- lights + fog ---------------- */
  scene.add(new THREE.HemisphereLight(0x8a7bff, 0x0a0d24, 1.15));
  const dirLight = new THREE.DirectionalLight(0xbfd4ff, 2.1);
  dirLight.position.set(7, 14, 5);
  scene.add(dirLight);
  scene.add(new THREE.AmbientLight(0x334, 0.25));
  scene.fog = new THREE.Fog(0x191243, 14, 84);

  /* ---------------- merged static road ---------------- */
  const roadGroup = new THREE.Group();
  scene.add(roadGroup);

  const roadMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(7.1, 84),
    new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, metalness: 0.05 }),
  );
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.position.set(0, 0, 38);
  roadGroup.add(roadMesh);

  // side ground (darker, to hide the plane edge)
  const sideGround = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 84),
    new THREE.MeshStandardMaterial({ color: 0x0a0d24, roughness: 1 }),
  );
  sideGround.rotation.x = -Math.PI / 2;
  sideGround.position.set(0, -0.03, 38);
  roadGroup.add(sideGround);

  // neon lane-edge strips (emissive)
  const stripGeo = new THREE.BoxGeometry(0.09, 0.06, 84);
  const stripL = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0x35e0d0 }));
  stripL.position.set(-CFG.roadHalf, 0.03, 38);
  const stripR = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0xff5fd0 }));
  stripR.position.set(CFG.roadHalf, 0.03, 38);
  roadGroup.add(stripL, stripR);

  // curbs
  const curbGeo = new THREE.BoxGeometry(0.34, 0.18, 84);
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x1b2150, roughness: 0.8 });
  const curbL = new THREE.Mesh(curbGeo, curbMat);
  curbL.position.set(-CFG.roadHalf - 0.24, 0.09, 38);
  const curbR = new THREE.Mesh(curbGeo, curbMat);
  curbR.position.set(CFG.roadHalf + 0.24, 0.09, 38);
  roadGroup.add(curbL, curbR);

  // rails / pipe detail beyond the curbs
  const railGeo = new THREE.CylinderGeometry(0.05, 0.05, 84, 6);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x2c3568, roughness: 0.5, metalness: 0.6 });
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(sx * (CFG.roadHalf + 1.15), 0.5, 38);
    roadGroup.add(rail);
  }

  /* ---------------- decor pools ---------------- */
  function mergeGeoms(geos) {
    // simple non-indexed merge (position/normal/uv)
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

  const treeGeo = mergeGeoms([
    (() => { const g = new THREE.ConeGeometry(1.1, 1.5, 7); g.translate(0, 1.6, 0); return g; })(),
    (() => { const g = new THREE.ConeGeometry(0.85, 1.3, 7); g.translate(0, 2.6, 0); return g; })(),
    (() => { const g = new THREE.ConeGeometry(0.6, 1.1, 7); g.translate(0, 3.5, 0); return g; })(),
    (() => { const g = new THREE.CylinderGeometry(0.09, 0.13, 1.0, 5); g.translate(0, 0.4, 0); return g; })(),
  ]);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x10402c, roughness: 0.9 });
  const trees = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(treeGeo, treeMat);
    const side = i % 2 === 0 ? -1 : 1;
    m.position.set(side * (CFG.roadHalf + 1.4 + Math.random() * 3.4), 0, 2 + (i / 16) * 88 + Math.random() * 5);
    const s = 0.7 + Math.random() * 1.3;
    m.scale.set(s, s, s);
    scene.add(m);
    trees.push({ m, zw: m.position.z, span: 90 });
  }

  const lampGroup = () => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 3.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x232a55, roughness: 0.6, metalness: 0.5 }));
    pole.position.y = 1.7;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x7df5e8 }));
    orb.position.y = 3.45;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas('rgba(120,240,225,0.8)', 24)),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8,
    }));
    glow.scale.set(1.5, 1.5, 1);
    glow.position.y = 3.45;
    g.add(pole, orb, glow);
    return g;
  };
  const lamps = [];
  for (let i = 0; i < 8; i++) {
    const g = lampGroup();
    const side = i % 2 === 0 ? -1 : 1;
    g.position.set(side * (CFG.roadHalf + 0.75), 0, 4 + i * 11);
    scene.add(g);
    lamps.push({ m: g, zw: g.position.z, span: 88 });
  }

  const buildings = [];
  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const w = 4 + Math.random() * 5;
    const h = 6 + Math.random() * 14;
    const tex = buildingTexes[i % 4];
    const face = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.62,
      roughness: 0.9,
    });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x0b0e26, roughness: 0.95 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3.4), [sideMat, sideMat, sideMat, sideMat, face, face]);
    box.position.set(side * (CFG.roadHalf + 3.6 + Math.random() * 5), h / 2, 0);
    const g = new THREE.Group();
    g.add(box);
    scene.add(g);
    const d = { m: g, zw: 5 + (i / 14) * 92, span: 95, sign: null };
    if (i % 4 === 1) {
      // neon sign on some facades
      const si = (i / 4) | 0;
      const sg = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9, 0.72),
        new THREE.MeshBasicMaterial({ map: signTexes[si], transparent: false }),
      );
      sg.position.set(0, h * 0.62, 1.75);
      box.add(sg);
      d.sign = sg;
    }
    buildings.push(d);
  }

  // branded arch gates
  const gates = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.16, 0.2, 4.8, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x151a3f, roughness: 0.6, metalness: 0.4 });
    const pl = new THREE.Mesh(poleGeo, poleMat);
    pl.position.set(-CFG.roadHalf - 0.5, 2.4, 0);
    const pr = new THREE.Mesh(poleGeo, poleMat);
    pr.position.set(CFG.roadHalf + 0.5, 2.4, 0);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(CFG.roadHalf * 2 + 1.0, 0.3, 0.3), poleMat);
    beam.position.y = 4.9;
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(CFG.roadHalf * 2 + 0.6, (CFG.roadHalf * 2 + 0.6) * (150 / 640)),
      new THREE.MeshBasicMaterial({ map: gateTex }),
    );
    banner.position.y = 4.9;
    banner.position.z = 0.05;
    const glowMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas('rgba(61,255,136,0.8)', 24)),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.65,
    });
    for (const px of [-(CFG.roadHalf + 0.5), CFG.roadHalf + 0.5]) {
      const gs = new THREE.Sprite(glowMat);
      gs.scale.set(1.7, 1.7, 1);
      gs.position.set(px, 4.95, 0.1);
      g.add(gs);
    }
    g.add(pl, pr, beam, banner);
    scene.add(g);
    gates.push({ m: g, zw: 210 + i * 420, span: 420 });
  }

  function recycleDecor(d, dist) {
    const zr = d.zw - dist;
    if (zr < -10) d.zw += d.span;
    d.m.position.z = d.zw - dist;
  }

  /* ---------------- obstacle templates + pools ---------------- */
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.8 });
  function shadowPlane(w, d) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5, d * 1.4), shadowMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    return m;
  }
  const T = {};
  T.fence = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.5, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x182046, roughness: 0.7 }));
    body.position.y = 0.55;
    const stripes = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.44),
      new THREE.MeshBasicMaterial({ map: hazardTex }));
    stripes.position.set(0, 0.55, 0.09);
    const stripesB = stripes.clone();
    stripesB.rotation.y = Math.PI;
    stripesB.position.z = -0.09;
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.06, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x3dff88 }));
    glow.position.y = 0.86;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.12), body.material);
    legL.position.set(-0.85, 0.2, 0);
    const legR = legL.clone();
    legR.position.x = 0.85;
    g.add(body, stripes, stripesB, glow, legL, legR, shadowPlane(1.9, 0.4));
    return g;
  };
  T.crate = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.5, 1.7),
      new THREE.MeshStandardMaterial({ color: 0x241b45, roughness: 0.75 }));
    body.position.y = 1.3;
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({ map: leafTex, transparent: true }));
    leaf.position.set(0, 1.55, 0.86);
    const leafB = leaf.clone();
    leafB.rotation.y = Math.PI;
    leafB.position.z = -0.86;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.07, 1.74),
      new THREE.MeshBasicMaterial({ color: 0xa06bff }));
    strip.position.y = 2.1;
    g.add(body, leaf, leafB, strip, shadowPlane(1.7, 1.7));
    return g;
  };
  T.sign = () => {
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1a2148, roughness: 0.6, metalness: 0.4 });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.55, 0.16), postMat);
    postL.position.set(-0.93, 1.275, 0);
    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.55, 0.16), postMat);
    postR.position.set(0.93, 1.275, 0);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.3, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x0f4a2e, roughness: 0.7 }));
    panel.position.y = 1.9;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.06, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x3dff88 }));
    edge.position.y = 2.52;
    const leafF = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ map: leafTex, transparent: true }));
    leafF.position.set(0, 1.9, 0.11);
    const leafBk = leafF.clone();
    leafBk.rotation.y = Math.PI;
    leafBk.position.z = -0.11;
    const bulb = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas('rgba(255,210,95,0.9)', 20)),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85,
    }));
    bulb.scale.set(0.7, 0.7, 1);
    bulb.position.set(0, 1.18, 0.1);
    g.add(postL, postR, panel, edge, leafF, leafBk, bulb, shadowPlane(2.0, 0.5));
    return g;
  };
  const trainWinTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#1d1240';
    x.fillRect(0, 0, 256, 64);
    x.fillStyle = 'rgba(80,230,255,0.92)';
    for (let i = 0; i < 5; i++) x.fillRect(12 + i * 50, 14, 32, 26);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  })();
  const trainMats = {
    body: new THREE.MeshStandardMaterial({ color: 0x2b1b52, roughness: 0.6, metalness: 0.3 }),
    win: new THREE.MeshBasicMaterial({ map: trainWinTex }),
    roof: new THREE.MeshStandardMaterial({ color: 0x3a2a6b, roughness: 0.55, metalness: 0.35 }),
    edge: new THREE.MeshBasicMaterial({ color: 0xff5fd0 }),
    edge2: new THREE.MeshBasicMaterial({ color: 0x3dff88 }),
    hl: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    cone: new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    ramp: new THREE.MeshStandardMaterial({ color: 0x1a2148, roughness: 0.6, metalness: 0.4 }),
  };
  function trainGroup(depth, oncoming) {
    const g = new THREE.Group();
    const w = 2.05, h = 3.35;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.92, depth), trainMats.body);
    body.position.y = h * 0.46 + 0.05;
    const winS = new THREE.Mesh(new THREE.PlaneGeometry(depth * 0.94, h * 0.22), trainMats.win);
    winS.rotation.y = Math.PI / 2;
    winS.position.set(w / 2 + 0.011, h * 0.62, 0);
    const winB = winS.clone();
    winB.rotation.y = -Math.PI / 2;
    winB.position.x = -w / 2 - 0.011;
    const roofM = new THREE.Mesh(new THREE.BoxGeometry(w + 0.26, 0.16, depth + 0.2), trainMats.roof);
    roofM.position.y = h + 0.02;
    const edgeF = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.07, 0.07), trainMats.edge);
    edgeF.position.set(0, h + 0.1, depth / 2 + 0.05);
    const edgeB = edgeF.clone();
    edgeB.position.z = -depth / 2 - 0.05;
    const edgeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, depth + 0.3), trainMats.edge2);
    edgeL.position.set(-w / 2 - 0.06, h + 0.1, 0);
    const edgeR = edgeL.clone();
    edgeR.position.x = w / 2 + 0.06;
    // roof hatches
    const hatch1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), trainMats.roof);
    hatch1.position.set(0.4, h + 0.16, -depth * 0.18);
    const hatch2 = hatch1.clone();
    hatch2.position.x = -0.45;
    hatch2.position.z = depth * 0.2;
    g.add(body, winS, winB, roofM, edgeF, edgeB, edgeL, edgeR, hatch1, hatch2, shadowPlane(w, depth));
    if (oncoming) {
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), trainMats.hl);
      hl.rotation.y = Math.PI;
      hl.position.set(0, h * 0.3, -depth / 2 - 0.02);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(glowCanvas('rgba(255,244,200,0.9)', 26)),
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.95,
      }));
      halo.scale.set(1.6, 1.6, 1);
      halo.position.copy(hl.position);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 12, 1, true), trainMats.cone);
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(0, h * 0.3, -depth / 2 - 4.5);
      g.add(hl, halo, cone);
      g.userData.cone = cone;
    }
    return g;
  }
  T.train = (depth) => trainGroup(depth, false);
  T.trainOn = (depth) => trainGroup(depth, true);
  T.ramp = () => {
    const g = new THREE.Group();
    const slope = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 2.3), trainMats.ramp);
    slope.rotation.x = Math.atan2(0.5, 2.2);
    slope.position.set(0, 0.25, 0);
    const stripes = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.0),
      new THREE.MeshBasicMaterial({ map: hazardTex }));
    stripes.rotation.x = -Math.PI / 2 + Math.atan2(0.5, 2.2);
    stripes.position.set(0, 0.31, 0);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.05, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x3dff88 }));
    glow.position.set(0, 0.52, 1.12);
    const glowB = glow.clone();
    glowB.position.z = -1.12;
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 2.2),
      new THREE.MeshBasicMaterial({ color: 0x35e0d0 }));
    sideL.position.set(-1.0, 0.25, 0);
    const sideR = sideL.clone();
    sideR.position.x = 1.0;
    g.add(slope, stripes, glow, glowB, sideL, sideR, shadowPlane(2.0, 2.3));
    g.userData.isRamp = true;
    return g;
  };

  const pools = { fence: [], crate: [], sign: [], train: [], trainOn: [], ramp: [] };
  function acquireOb(ob) {
    const key = ob.type === 'train' ? 'train' : ob.type === 'trainOn' ? 'trainOn' : ob.type;
    let m = pools[key].pop();
    if (!m) {
      m = (T[key] || T.fence)(ob.type === 'train' || ob.type === 'trainOn' ? ob.depth : 0);
    }
    m.visible = true;
    m.position.set(ob.x, 0, ob.zw - G.dist);
    scene.add(m);
    ob.mesh = m;
  }
  function recycleOb(ob) {
    if (!ob.mesh) return;
    const key = ob.type;
    ob.mesh.visible = false;
    pools[key].push(ob.mesh);
    ob.mesh = null;
  }

  /* ---------------- pickups ---------------- */
  const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 18);
  const budCoinMesh = new THREE.InstancedMesh(coinGeo,
    [new THREE.MeshStandardMaterial({ color: 0x0c5a2e, roughness: 0.5, metalness: 0.4 }),
      new THREE.MeshStandardMaterial({ map: budFace, emissiveMap: budFace, emissive: 0x2aff6a, emissiveIntensity: 1.15, roughness: 0.4, metalness: 0.3 })],
    48);
  budCoinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  budCoinMesh.frustumCulled = false; // instances span the whole track
  scene.add(budCoinMesh);
  const goldCoinMesh = new THREE.InstancedMesh(coinGeo,
    [new THREE.MeshStandardMaterial({ color: 0x8a5a10, roughness: 0.4, metalness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: goldFace, emissiveMap: goldFace, emissive: 0xffb63d, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.5 })],
    12);
  goldCoinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  goldCoinMesh.frustumCulled = false;
  scene.add(goldCoinMesh);
  const coinFree = { bud: [], gold: [] };
  {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 48; i++) { budCoinMesh.setMatrixAt(i, zero); coinFree.bud.push(i); }
    for (let i = 0; i < 12; i++) { goldCoinMesh.setMatrixAt(i, zero); coinFree.gold.push(i); }
    budCoinMesh.instanceMatrix.needsUpdate = true;
    goldCoinMesh.instanceMatrix.needsUpdate = true;
  }
  const _dummy = new THREE.Object3D();
  const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

  function makeSoda() {
    const g = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 14),
      [new THREE.MeshBasicMaterial({ map: sodaTex }),
        new THREE.MeshStandardMaterial({ color: 0xdfe6ff, metalness: 0.7, roughness: 0.3 }),
        new THREE.MeshStandardMaterial({ color: 0x9aa4c8, metalness: 0.7, roughness: 0.4 })]);
    g.add(can);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas('rgba(255,150,80,0.7)', 22)),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55,
    }));
    glow.scale.set(0.9, 0.9, 1);
    g.add(glow);
    return g;
  }
  function makePowerup(kind, col) {
    const g = new THREE.Group();
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(BADGES[kind]), transparent: true }));
    badge.scale.set(0.95, 0.95, 1);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas('rgba(255,255,255,0.8)', 30)),
      color: new THREE.Color(col), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7,
    }));
    glow.scale.set(1.5, 1.5, 1);
    g.add(glow, badge);
    return g;
  }
  function makeKey() {
    const g = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd25f, metalness: 0.8, roughness: 0.3, emissive: 0x6b4a00, emissiveIntensity: 0.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 8, 18), gold);
    ring.position.y = 0.12;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), gold);
    shaft.position.y = -0.08;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.05), gold);
    tooth.position.set(0.05, -0.16, 0);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas('rgba(255,210,95,0.9)', 26)),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85,
    }));
    glow.scale.set(1.1, 1.1, 1);
    g.add(ring, shaft, tooth, glow);
    return g;
  }
  const pkPools = {
    soda: [], key: [],
    magnet: [], shield: [], x2: [], jet: [], sneaker: [],
  };
  function acquirePk(pk) {
    const rel = pk.zw - G.dist;
    if (pk.type === 'bud' || pk.type === 'gold') {
      const mesh = pk.type === 'bud' ? budCoinMesh : goldCoinMesh;
      const i = coinFree[pk.type].pop();
      if (i == null) return;
      pk._inst = i;
      pk._mesh = mesh;
    } else {
      let m;
      if (pk.type === 'soda') m = pkPools.soda.pop() || makeSoda();
      else if (pk.type === 'key') m = pkPools.key.pop() || makeKey();
      else m = pkPools[pk.type].pop() || makePowerup(pk.type,
        pk.type === 'magnet' ? '#35e0d0' : pk.type === 'shield' ? '#7dffa8' : pk.type === 'x2' ? '#ffd25f' : pk.type === 'jet' ? '#ff5fd0' : '#ffd25f');
      m.visible = true;
      m.position.set(pk.x, pk.y, rel);
      scene.add(m);
      pk.mesh = m;
    }
  }
  function recyclePk(pk) {
    if (pk._inst != null) {
      pk._mesh.setMatrixAt(pk._inst, _zero);
      pk._mesh.instanceMatrix.needsUpdate = true;
      coinFree[pk.type].push(pk._inst);
      pk._inst = null;
      return;
    }
    if (pk.mesh) {
      pk.mesh.visible = false;
      const pool = pkPools[pk.type];
      if (pool) pool.push(pk.mesh);
      pk.mesh = null;
    }
  }

  /* ---------------- particle system (zero-alloc pool) ---------------- */
  const partPos = new Float32Array(MAXP * 3);
  const partCol = new Float32Array(MAXP * 3);
  const partSize = new Float32Array(MAXP);
  const partAlpha = new Float32Array(MAXP);
  const parts = [];
  for (let i = 0; i < MAXP; i++) parts.push({ on: false, age: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: -14, size: 0.1, r: 1, gr: 1, b: 1 });
  let pCursor = 0;
  let budget = 1.0;

  const partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
  partGeo.setAttribute('aColor', new THREE.BufferAttribute(partCol, 3));
  partGeo.setAttribute('aSize', new THREE.BufferAttribute(partSize, 1));
  partGeo.setAttribute('aAlpha', new THREE.BufferAttribute(partAlpha, 1));
  const partMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      varying float vA; varying vec3 vC;
      void main(){ vC = aColor; vA = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (240.0 / max(0.1, -mv.z));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying vec3 vC;
      void main(){ vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d) * 2.0;
        float a = smoothstep(1.0, 0.1, r);
        gl_FragColor = vec4(vC, a * vA); }`,
  });
  const partPoints = new THREE.Points(partGeo, partMat);
  partPoints.frustumCulled = false;
  scene.add(partPoints);

  const SPARK_COLORS = {
    sparkGreen: [0.49, 1.0, 0.66], sparkTeal: [0.35, 0.96, 0.88], sparkGold: [1.0, 0.85, 0.45],
    sparkWhite: [1.0, 1.0, 1.0], sparkMagenta: [1.0, 0.44, 0.85], sparkPurple: [0.78, 0.5, 1.0],
  };
  const CONFETTI = [[0.24, 1.0, 0.53], [0.35, 0.96, 0.88], [0.63, 0.42, 1.0], [1.0, 0.44, 0.82], [1.0, 0.86, 0.37]];

  function addPart(o) {
    const cap = Math.max(24, (MAXP * budget) | 0);
    for (let n = 0; n < cap; n++) {
      const p = parts[pCursor];
      pCursor = (pCursor + 1) % cap;
      if (!p.on) {
        p.on = true; p.age = 0;
        p.x = o.x; p.y = o.y; p.z = o.z;
        p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
        p.g = o.g != null ? o.g : -14;
        p.life = o.life || 0.7;
        p.size = o.size || 0.1;
        p.r = o.r; p.gr = o.gr; p.b = o.b;
        return;
      }
    }
  }
  function burst(kind, x, y, z, n, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (opt.sp0 != null ? opt.sp0 : 2) + Math.random() * ((opt.sp1 != null ? opt.sp1 : 7) - (opt.sp0 != null ? opt.sp0 : 2));
      let col;
      if (kind === 'dust') col = [0.55, 0.62, 0.8];
      else if (kind === 'leaf') col = [0.3, 0.9, 0.45];
      else if (kind === 'confetti') col = CONFETTI[(Math.random() * CONFETTI.length) | 0];
      else col = SPARK_COLORS[opt.spr] || SPARK_COLORS.sparkWhite;
      addPart({
        x, y, z,
        vx: Math.cos(a) * sp * (opt.vx || 1),
        vy: (opt.vy0 != null ? opt.vy0 : 1) + Math.random() * ((opt.vy1 != null ? opt.vy1 : 6) - (opt.vy0 != null ? opt.vy0 : 1)),
        vz: (Math.random() - 0.5) * 4,
        g: opt.g != null ? opt.g : -14,
        life: (opt.life || 0.75) * (0.6 + Math.random() * 0.4),
        size: (opt.s0 || 0.06) + Math.random() * ((opt.s1 || 0.16) - (opt.s0 || 0.06)),
        r: col[0], gr: col[1], b: col[2],
      });
    }
  }
  function updateParts(dt) {
    const ts = dt * G.timeScale;
    for (let i = 0; i < MAXP; i++) {
      const p = parts[i];
      if (!p.on) { partAlpha[i] = 0; continue; }
      p.age += ts;
      if (p.age >= p.life) { p.on = false; partAlpha[i] = 0; continue; }
      p.x += p.vx * ts;
      p.y += p.vy * ts;
      p.z += p.vz * ts;
      p.vy += p.g * ts;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.4; p.vx *= 0.8; }
      const f = 1 - p.age / p.life;
      const rel = p.z - G.dist;
      partPos[i * 3] = p.x;
      partPos[i * 3 + 1] = p.y;
      partPos[i * 3 + 2] = rel < 0.4 ? 0.4 : rel;
      partCol[i * 3] = p.r;
      partCol[i * 3 + 1] = p.gr;
      partCol[i * 3 + 2] = p.b;
      partSize[i] = p.size;
      partAlpha[i] = Math.min(1, f * 1.5);
    }
    partGeo.attributes.position.needsUpdate = true;
    partGeo.attributes.aColor.needsUpdate = true;
    partGeo.attributes.aSize.needsUpdate = true;
    partGeo.attributes.aAlpha.needsUpdate = true;
  }

  /* ---------------- magnet arcs ---------------- */
  const arcs = [];
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0x35e0d0, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    arcs.push(line);
  }
  function updateArcs() {
    const pl = G.player;
    let n = 0;
    if (G.magnetT > 0) {
      for (let i = 0; i < G.pickups.length && n < 8; i++) {
        const pk = G.pickups[i];
        if (!pk._m) continue;
        const rel = pk.zw - G.dist;
        const arr = arcs[n].geometry.attributes.position.array;
        arr[0] = pk.x; arr[1] = pk.y; arr[2] = rel;
        arr[3] = (pk.x + pl.x) / 2; arr[4] = Math.max(pk.y, pl.y + 0.9) + 0.5; arr[5] = (rel + W_PZ) / 2;
        arr[6] = pl.x; arr[7] = pl.y + 0.9; arr[8] = W_PZ;
        arcs[n].geometry.attributes.position.needsUpdate = true;
        arcs[n].visible = true;
        n++;
      }
    }
    for (let i = n; i < 8; i++) arcs[i].visible = false;
  }

  /* ---------------- sneaker rings ---------------- */
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd25f, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.userData.t = 1;
    scene.add(m);
    rings.push(m);
  }
  function ring(x, y, z, col) {
    for (const m of rings) {
      if (m.visible) continue;
      m.visible = true;
      m.userData.t = 0;
      m.position.set(x, y, z - G.dist);
      m.material.color.set(col || '#ffd25f');
      return;
    }
  }
  function updateRings(dt) {
    for (const m of rings) {
      if (!m.visible) continue;
      m.userData.t += dt / 0.5;
      if (m.userData.t >= 1) { m.visible = false; continue; }
      const s = 0.4 + m.userData.t * 2.6;
      m.scale.set(s, s, s);
      m.material.opacity = 0.9 * (1 - m.userData.t);
    }
  }

  /* ---------------- player blob shadow ---------------- */
  const playerShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  playerShadow.rotation.x = -Math.PI / 2;
  playerShadow.position.set(0, 0.02, W_PZ);
  scene.add(playerShadow);

  /* ---------------- fx facade for sim ---------------- */
  const fx = {
    burst, ring,
    pop() { /* popups handled by ui (DOM) reading G via boot */ },
    acquireOb, recycleOb, acquirePk, recyclePk,
    emotePing() { },
  };

  /* ---------------- quality tiers ---------------- */
  function setQuality(tier) {
    W.tier = tier;
    const dpr = tier === 2 ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    renderer.setPixelRatio(dpr);
    scene.fog.far = tier === 2 ? 84 : tier === 1 ? 66 : 52;
    budget = tier === 2 ? 1.0 : tier === 1 ? 0.6 : 0.35;
    auroraMat.uniforms.uRibbons.value = tier === 2 ? 3.0 : tier === 1 ? 2.0 : 1.0;
    stars.visible = tier > 0;
    buildings.forEach((b, i) => { b.m.visible = tier === 2 || i % 2 === 0; });
    trees.forEach((t, i) => { t.m.visible = tier === 2 || i % 2 === 0; });
    lamps.forEach((l, i) => { l.m.visible = tier === 2 || i % 2 === 0; });
    if (qualityApi) qualityApi.onTierChange && qualityApi.onTierChange(tier, dpr);
  }

  /* ---------------- resize ---------------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* ---------------- projection for UI ---------------- */
  const _pv = new THREE.Vector3();
  function project(x, y, zAbs, out) {
    _pv.set(x, y, zAbs - G.dist);
    _pv.project(camera);
    const w = window.innerWidth, h = window.innerHeight;
    out.x = (_pv.x * 0.5 + 0.5) * w;
    out.y = (-_pv.y * 0.5 + 0.5) * h;
    out.z = _pv.z;
    return out;
  }

  /* ---------------- main world update ---------------- */
  let lastDist = 0;
  function update(dt) {
    const dist = G.dist;
    const t = G.t;

    // road texture scroll (dashes stream past)
    const tile = 4.1;
    roadTex.offset.y = ((-dist / tile) % 1 + 1) % 1;

    // decor
    for (let i = 0; i < trees.length; i++) recycleDecor(trees[i], dist);
    for (let i = 0; i < lamps.length; i++) recycleDecor(lamps[i], dist);
    for (let i = 0; i < buildings.length; i++) recycleDecor(buildings[i], dist);
    for (let i = 0; i < gates.length; i++) recycleDecor(gates[i], dist);

    // obstacles
    for (let i = 0; i < G.obstacles.length; i++) {
      const ob = G.obstacles[i];
      if (!ob.mesh) continue;
      ob.mesh.position.set(ob.x, 0, ob.zw - dist);
      const cone = ob.mesh.userData && ob.mesh.userData.cone;
      if (cone) cone.visible = (ob.zw - dist) < 60;
    }

    // pickups
    const pl = G.player;
    for (let i = 0; i < G.pickups.length; i++) {
      const pk = G.pickups[i];
      if (pk._inst != null) {
        const bob = Math.sin(t * 3.1 + pk.seed * 7) * 0.12;
        _dummy.position.set(pk.x, pk.y + bob, pk.zw - dist);
        _dummy.rotation.set(0, t * 2.6 + pk.seed * 5, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        pk._mesh.setMatrixAt(pk._inst, _dummy.matrix);
      } else if (pk.mesh) {
        const bob = Math.sin(t * 3.1 + pk.seed * 7) * 0.1;
        pk.mesh.position.set(pk.x, pk.y + bob, pk.zw - dist);
        pk.mesh.rotation.y = t * 1.6 + pk.seed;
      }
    }
    budCoinMesh.instanceMatrix.needsUpdate = true;
    goldCoinMesh.instanceMatrix.needsUpdate = true;

    updateParts(dt);
    updateArcs();
    updateRings(dt);

    // player shadow
    playerShadow.position.set(pl.x, 0.02, W_PZ);
    const shScale = Math.max(0.45, 1 - pl.y * 0.12);
    playerShadow.scale.set(shScale, shScale, shScale);
    playerShadow.material.opacity = Math.max(0.1, Math.min(0.8, 0.62 - pl.y * 0.1));

    // aurora
    auroraMat.uniforms.uT.value = t * 0.55;
    auroraMat.uniforms.uBoost.value = 0.2 + G.auroraBoost * 0.9;

    lastDist = dist;
  }

  W.update = update;
  W.setQuality = setQuality;
  W.project = project;
  W.resize = resize;
  W.fx = fx;
  W.reset = function () {
    lastDist = 0;
    for (const l of arcs) l.visible = false;
    for (const m of rings) m.visible = false;
  };
  W.skyGroup = skyGroup;
  W._lastDist = () => lastDist;
  return W;
}
