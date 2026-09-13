/* ============================================================
   NORTHERN LIGHTS RUN — sprites.js
   Pre-rendered procedural art: glow sprites, buds, power-ups,
   aurora sky, stars, mountains, leaf. Built once, blitted fast.
   All art is generated in code — swap with real images anytime.
   ============================================================ */
(function () {
  'use strict';

  const S = {};

  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(w));
    c.height = Math.max(2, Math.ceil(h));
    return c;
  }

  /* ---------- soft radial glow ---------- */
  S.glow = function (color, r) {
    const c = cv(r * 2, r * 2);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, color);
    g.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)'));
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    x.fillStyle = g;
    x.fillRect(0, 0, r * 2, r * 2);
    return c;
  };

  /* ---------- cannabis leaf (flat, vector-ish) ---------- */
  // Draws a 7-leaflet cannabis leaf into a canvas of size s.
  S.leaf = function (s, col, colHi) {
    const c = cv(s, s);
    const x = c.getContext('2d');
    x.translate(s / 2, s * 0.56);
    const R = s * 0.46;
    x.fillStyle = col;
    // leaflets: angles fan from -150deg..150deg (0 = up)
    const leaflets = [
      { a: 0, len: 1.0, w: 0.30 },
      { a: -30, len: 0.92, w: 0.26 },
      { a: 30, len: 0.92, w: 0.26 },
      { a: -62, len: 0.76, w: 0.22 },
      { a: 62, len: 0.76, w: 0.22 },
      { a: -94, len: 0.55, w: 0.18 },
      { a: 94, len: 0.55, w: 0.18 },
    ];
    leaflets.forEach((L) => {
      x.save();
      x.rotate((L.a * Math.PI) / 180);
      const ll = R * L.len, lw = R * L.w;
      x.beginPath();
      x.moveTo(0, R * 0.08);
      x.quadraticCurveTo(-lw, -ll * 0.45, 0, -ll);
      x.quadraticCurveTo(lw, -ll * 0.45, 0, R * 0.08);
      x.fill();
      x.restore();
    });
    // stem
    x.fillRect(-R * 0.03, R * 0.06, R * 0.06, R * 0.22);
    if (colHi) {
      x.globalCompositeOperation = 'source-atop';
      const g = x.createLinearGradient(0, -R, 0, R);
      g.addColorStop(0, colHi);
      g.addColorStop(0.7, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(-s / 2, -s / 2, s, s);
    }
    return c;
  };

  /* ---------- cannabis bud pickup ---------- */
  function bud(size, hue, glowCol) {
    const pad = size * 0.42;
    const c = cv(size + pad * 2, size + pad * 2);
    const x = c.getContext('2d');
    const cx = c.width / 2, cy = c.height / 2;
    // glow
    const g = x.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.85);
    g.addColorStop(0, glowCol);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    // cluster of calyx blobs
    const rng = mulberry(7);
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * size * 0.24;
      const bx = cx + Math.cos(a) * rr;
      const by = cy + Math.sin(a) * rr * 1.12;
      const br = size * (0.16 + rng() * 0.1);
      const bg = x.createRadialGradient(bx - br * 0.3, by - br * 0.35, br * 0.1, bx, by, br);
      bg.addColorStop(0, hue[0]);
      bg.addColorStop(0.65, hue[1]);
      bg.addColorStop(1, hue[2]);
      x.fillStyle = bg;
      x.beginPath();
      x.arc(bx, by, br, 0, 7);
      x.fill();
    }
    // sugar sparkle + pistils
    x.strokeStyle = 'rgba(255,190,120,0.9)';
    x.lineWidth = Math.max(1, size * 0.03);
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2, rr = size * (0.15 + rng() * 0.25);
      x.beginPath();
      x.moveTo(cx + Math.cos(a) * rr * 0.4, cy + Math.sin(a) * rr * 0.4);
      x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      x.stroke();
    }
    x.fillStyle = 'rgba(235,255,225,0.95)';
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2, rr = size * (0.1 + rng() * 0.3);
      x.beginPath();
      x.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, Math.max(0.8, size * 0.022), 0, 7);
      x.fill();
    }
    return c;
  }

  function mulberry(seed) {
    let t = seed;
    return function () {
      t |= 0; t = (t + 0x6D2B79F5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- power-up badges ---------- */
  function badge(draw) {
    const s = 128;
    const c = cv(s, s);
    const x = c.getContext('2d');
    // glow ring
    const g = x.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.75, 'rgba(120,255,190,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    const lg = x.createLinearGradient(0, 0, s, s);
    lg.addColorStop(0, '#123125');
    lg.addColorStop(1, '#0d1c3a');
    x.fillStyle = lg;
    x.beginPath();
    x.arc(s / 2, s / 2, s * 0.34, 0, 7);
    x.fill();
    x.lineWidth = 5;
    x.strokeStyle = '#3dff88';
    x.stroke();
    x.save();
    x.beginPath();
    x.arc(s / 2, s / 2, s * 0.31, 0, 7);
    x.clip();
    draw(x, s);
    x.restore();
    return c;
  }

  S.magnet = badge((x, s) => {
    x.strokeStyle = '#35e0d0';
    x.lineWidth = s * 0.12;
    x.lineCap = 'round';
    x.beginPath();
    x.arc(s / 2, s / 2 + s * 0.04, s * 0.16, Math.PI * 0.08, Math.PI * 0.92, true);
    x.stroke();
    x.fillStyle = '#e9fffa';
    x.fillRect(s / 2 - s * 0.22, s / 2 + s * 0.02, s * 0.11, s * 0.14);
    x.fillRect(s / 2 + s * 0.11, s / 2 + s * 0.02, s * 0.11, s * 0.14);
  });

  S.shield = badge((x, s) => {
    x.fillStyle = 'rgba(125,255,168,0.95)';
    x.beginPath();
    x.moveTo(s / 2, s * 0.2);
    x.quadraticCurveTo(s * 0.74, s * 0.3, s * 0.72, s * 0.52);
    x.quadraticCurveTo(s * 0.7, s * 0.72, s / 2, s * 0.82);
    x.quadraticCurveTo(s * 0.3, s * 0.72, s * 0.28, s * 0.52);
    x.quadraticCurveTo(s * 0.26, s * 0.3, s / 2, s * 0.2);
    x.fill();
    x.fillStyle = '#0d1c3a';
    x.font = `900 ${s * 0.34}px Nunito, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('✓', s / 2, s * 0.53);
  });

  S.x2 = badge((x, s) => {
    x.fillStyle = '#ffd25f';
    x.font = `900 ${s * 0.42}px Nunito, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('×2', s / 2, s * 0.54);
  });

  /* ---------- sky: stars, aurora, mountains, moon ---------- */
  S.buildSky = function (W, H) {
    const horizon = Math.ceil(H * 0.42);

    // stars
    const stars = cv(W, horizon + 40);
    const sx = stars.getContext('2d');
    const rng = mulberry(1234);
    for (let i = 0; i < 150; i++) {
      const px = rng() * W, py = rng() * horizon;
      const r = rng() * 1.3 + 0.3;
      sx.fillStyle = `rgba(${200 + rng() * 55 | 0},${215 + rng() * 40 | 0},255,${0.25 + rng() * 0.65})`;
      sx.beginPath();
      sx.arc(px, py, r, 0, 7);
      sx.fill();
    }

    // aurora ribbons (3 layers)
    function aurora(colA, colB, seed, hFrac) {
      const w = 1100, h = Math.max(140, horizon * hFrac);
      const c = cv(w, h);
      const x = c.getContext('2d');
      const rng2 = mulberry(seed);
      x.globalCompositeOperation = 'lighter';
      for (let band = 0; band < 14; band++) {
        const yBase = h * (0.25 + rng2() * 0.4);
        const amp = h * (0.12 + rng2() * 0.2);
        const ph = rng2() * 9;
        const grad = x.createLinearGradient(0, yBase - amp, 0, yBase + h * 0.32);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.35, colA);
        grad.addColorStop(0.8, colB);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        x.strokeStyle = grad;
        x.lineWidth = 6 + rng2() * 16;
        x.lineCap = 'round';
        x.beginPath();
        for (let px = 0; px <= w; px += 14) {
          const py = yBase + Math.sin(px / w * Math.PI * (1.5 + rng2() * 0.02) + ph) * amp;
          if (px === 0) x.moveTo(px, py);
          else x.lineTo(px, py);
        }
        x.stroke();
      }
      return c;
    }
    const a1 = aurora('rgba(61,255,136,0.16)', 'rgba(53,224,208,0.10)', 11, 1.0);
    const a2 = aurora('rgba(160,107,255,0.15)', 'rgba(255,95,208,0.08)', 47, 0.85);
    const a3 = aurora('rgba(53,224,208,0.12)', 'rgba(61,255,136,0.07)', 83, 1.1);

    // mountains far
    const mtn = cv(Math.max(W, 900), horizon + 2);
    const mx = mtn.getContext('2d');
    const rng3 = mulberry(555);
    mx.fillStyle = '#131a3d';
    mx.beginPath();
    mx.moveTo(0, horizon);
    let px = 0;
    let py = horizon * (0.55 + rng3() * 0.2);
    mx.lineTo(0, py);
    while (px < mtn.width) {
      px += 60 + rng3() * 130;
      py = horizon * (0.5 + rng3() * 0.42);
      mx.lineTo(px, py);
    }
    mx.lineTo(mtn.width, horizon);
    mx.closePath();
    mx.fill();
    // ridge highlight
    mx.strokeStyle = 'rgba(90,120,220,0.35)';
    mx.lineWidth = 2;
    mx.stroke();
    // town lights
    for (let i = 0; i < 26; i++) {
      const lx = rng3() * mtn.width;
      const ly = horizon - rng3() * horizon * 0.12;
      mx.fillStyle = rng3() > 0.4 ? 'rgba(255,205,120,0.8)' : 'rgba(120,220,255,0.7)';
      mx.beginPath();
      mx.arc(lx, ly, 1 + rng3() * 1.4, 0, 7);
      mx.fill();
    }

    // moon
    const moon = cv(160, 160);
    const mmx = moon.getContext('2d');
    const mg = mmx.createRadialGradient(80, 80, 10, 80, 80, 80);
    mg.addColorStop(0, 'rgba(235,245,255,1)');
    mg.addColorStop(0.18, 'rgba(220,235,255,0.95)');
    mg.addColorStop(0.3, 'rgba(180,205,255,0.28)');
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    mmx.fillStyle = mg;
    mmx.fillRect(0, 0, 160, 160);

    S.stars = stars;
    S.auroras = [a1, a2, a3];
    S.mtn = mtn;
    S.moon = moon;
    S.skyH = horizon;
  };

  /* ---------- build everything ---------- */
  S.init = function () {
    S.bud = bud(46, ['#d6ffb8', '#4ed36a', '#0d6b35'], 'rgba(94,255,140,0.55)');
    S.budGold = bud(46, ['#fff3c8', '#ffc94d', '#b07008'], 'rgba(255,210,95,0.6)');
    S.leafGreen = S.leaf(64, '#2fae5f', 'rgba(190,255,210,0.85)');
    S.sparkGreen = S.glow('rgba(140,255,170,0.9)', 32);
    S.sparkTeal = S.glow('rgba(80,230,220,0.9)', 32);
    S.sparkGold = S.glow('rgba(255,215,120,0.9)', 32);
    S.sparkWhite = S.glow('rgba(255,255,255,0.95)', 28);
    S.sparkPurple = S.glow('rgba(190,130,255,0.9)', 32);
    S.dust = S.glow('rgba(160,180,220,0.5)', 30);
    S.redFlash = S.glow('rgba(255,80,90,0.8)', 40);
  };

  window.S = S;
})();
