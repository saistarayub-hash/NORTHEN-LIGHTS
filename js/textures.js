/* ============================================================
   NORTHERN LIGHTS RUN — textures.js
   Canvas-generated textures for the 3D build (no image files
   needed): leaf, glows, road, hazard stripes, building windows,
   arch-gate banner, neon signs, coin faces, Sodaze label.
   Ported from the old sprites.js canvas work.
   ============================================================ */

function texRng(seed) {
  let t = seed;
  return function () {
    t |= 0; t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  return c;
}

/* soft radial glow */
export function glowCanvas(color, r) {
  const c = cv(r * 2, r * 2);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, color);
  g.addColorStop(0.4, color.replace(/[\d.]+\)$/, '0.35)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  x.fillStyle = g;
  x.fillRect(0, 0, r * 2, r * 2);
  return c;
}

/* 7-leaflet cannabis leaf (vector-ish) */
export function leafCanvas(s, col, colHi) {
  const c = cv(s, s);
  const x = c.getContext('2d');
  x.translate(s / 2, s * 0.56);
  const R = s * 0.46;
  x.fillStyle = col;
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
}

/* fake blob shadow (radial dark disc) */
export function blobShadowCanvas() {
  const r = 64;
  const c = cv(r * 2, r * 2);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(r, r, 2, r, r, r);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, r * 2, r * 2);
  return c;
}

/* road: asphalt + faint tire wear + lane dashes (repeats along z) */
export function roadTexture() {
  const W = 256, H = 256;
  const c = cv(W, H);
  const x = c.getContext('2d');
  const rng = texRng(99);
  x.fillStyle = '#141735';
  x.fillRect(0, 0, W, H);
  // asphalt grain
  for (let i = 0; i < 420; i++) {
    x.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.10)';
    x.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 2);
  }
  // tire wear
  x.fillStyle = 'rgba(0,0,0,0.14)';
  x.fillRect(W * 0.21, 0, W * 0.075, H);
  x.fillRect(W * 0.71, 0, W * 0.075, H);
  // lane dashes (2 separators) — one dash per tile so repeat scrolls
  x.fillStyle = 'rgba(205,220,255,0.34)';
  for (const fx of [1 / 3, 2 / 3]) {
    const dx = W * fx;
    x.fillRect(dx - 3, H * 0.12, 6, H * 0.36);
  }
  return c;
}

/* hazard stripes for fences */
export function hazardTexture() {
  const c = cv(128, 64);
  const x = c.getContext('2d');
  x.fillStyle = '#101636';
  x.fillRect(0, 0, 128, 64);
  x.save();
  x.beginPath();
  x.rect(0, 0, 128, 64);
  x.clip();
  x.strokeStyle = 'rgba(61,255,136,0.8)';
  x.lineWidth = 10;
  for (let sx = -64; sx < 192; sx += 34) {
    x.beginPath();
    x.moveTo(sx, 70);
    x.lineTo(sx + 64, -6);
    x.stroke();
  }
  x.restore();
  return c;
}

/* building facade: dark body + random lit windows (emissive map) */
export function buildingTexture(seed, litProb) {
  const W = 128, H = 192;
  const c = cv(W, H);
  const x = c.getContext('2d');
  const rng = texRng(seed);
  x.fillStyle = '#0d1029';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(90,110,220,0.16)';
  x.lineWidth = 2;
  x.strokeRect(1, 1, W - 2, H - 2);
  const cols = 5, rows = 8;
  const cw = W / cols, chh = H / rows;
  const warm = 'rgba(255,205,120,', cool = 'rgba(120,225,255,';
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const wx = i * cw + cw * 0.22, wy = j * chh + chh * 0.22;
      if (rng() < (litProb || 0.38)) {
        x.fillStyle = (rng() > 0.4 ? warm : cool) + (0.55 + rng() * 0.45) + ')';
      } else {
        x.fillStyle = 'rgba(30,38,80,0.5)';
      }
      x.fillRect(wx, wy, cw * 0.56, chh * 0.5);
    }
  }
  return c;
}

/* branded arch-gate banner */
export function gateBannerTexture() {
  const gw = 640, gh = 150;
  const c = cv(gw, gh);
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(8,10,30,0.94)';
  x.beginPath();
  x.moveTo(10, 10);
  x.arcTo(gw - 10, 10, gw - 10, gh - 10, 26);
  x.arcTo(gw - 10, gh - 10, 10, gh - 10, 26);
  x.arcTo(10, gh - 10, 10, 10, 26);
  x.arcTo(10, 10, gw - 10, 10, 26);
  x.closePath();
  x.fill();
  x.strokeStyle = '#3dff88';
  x.lineWidth = 5;
  x.shadowColor = '#3dff88';
  x.shadowBlur = 16;
  x.stroke();
  x.shadowBlur = 0;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#7dffa8';
  x.font = '400 58px Righteous, Arial Black, sans-serif';
  x.shadowColor = 'rgba(61,255,136,0.9)';
  x.shadowBlur = 20;
  x.fillText('NORTHERN LIGHTS', gw / 2, gh / 2 - 14);
  x.shadowBlur = 0;
  x.font = '900 21px Nunito, sans-serif';
  x.fillStyle = '#a06bff';
  x.fillText('✦ HERBAL WELLNESS · LENASIA ✦', gw / 2, gh - 27);
  return c;
}

/* small neon facade sign */
export function neonSignTexture(text, col, bg) {
  const c = cv(256, 96);
  const x = c.getContext('2d');
  x.fillStyle = bg || 'rgba(10,12,32,0.9)';
  x.fillRect(0, 0, 256, 96);
  x.strokeStyle = col;
  x.lineWidth = 4;
  x.shadowColor = col;
  x.shadowBlur = 14;
  x.strokeRect(4, 4, 248, 88);
  x.fillStyle = col;
  x.font = '900 40px Righteous, Arial Black, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 128, 50);
  x.shadowBlur = 0;
  return c;
}

/* coin face: neon leaf on dark ring (for the spinning leaf coin) */
export function coinFaceTexture(leafCol, ringCol, bgA, bgB) {
  const s = 128;
  const c = cv(s, s);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s / 2);
  g.addColorStop(0, bgA || '#0f2a1c');
  g.addColorStop(1, bgB || '#081410');
  x.fillStyle = g;
  x.beginPath();
  x.arc(s / 2, s / 2, s / 2 - 2, 0, 7);
  x.fill();
  x.strokeStyle = ringCol;
  x.lineWidth = 7;
  x.shadowColor = ringCol;
  x.shadowBlur = 12;
  x.stroke();
  x.shadowBlur = 0;
  // leaf
  x.save();
  x.translate(s / 2, s / 2 + 4);
  x.scale(1.5, 1.5);
  const R = s * 0.26;
  x.fillStyle = leafCol;
  const leaflets = [
    { a: 0, len: 1.0, w: 0.30 }, { a: -30, len: 0.9, w: 0.26 }, { a: 30, len: 0.9, w: 0.26 },
    { a: -62, len: 0.74, w: 0.22 }, { a: 62, len: 0.74, w: 0.22 },
    { a: -94, len: 0.54, w: 0.18 }, { a: 94, len: 0.54, w: 0.18 },
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
  x.restore();
  return c;
}

/* Sodaze can label: orange top / purple band / brand text */
export function sodazeLabelTexture() {
  const c = cv(128, 64);
  const x = c.getContext('2d');
  x.fillStyle = '#f2f5ff';
  x.fillRect(0, 0, 128, 14);
  x.fillStyle = '#ff8a3d';
  x.fillRect(0, 14, 128, 14);
  x.fillStyle = '#5b2bd4';
  x.fillRect(0, 28, 128, 36);
  x.fillStyle = '#fff';
  x.font = '900 20px Nunito, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('SODAZÉ', 64, 46);
  return c;
}

/* generic power-up badge (icon drawn by fn) */
export function badgeCanvas(draw) {
  const s = 128;
  const c = cv(s, s);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0.30)');
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

export const BADGES = {
  magnet: badgeCanvas((x, s) => {
    x.strokeStyle = '#35e0d0';
    x.lineWidth = s * 0.12;
    x.lineCap = 'round';
    x.beginPath();
    x.arc(s / 2, s / 2 + s * 0.04, s * 0.16, Math.PI * 0.08, Math.PI * 0.92, true);
    x.stroke();
    x.fillStyle = '#e9fffa';
    x.fillRect(s / 2 - s * 0.22, s / 2 + s * 0.02, s * 0.11, s * 0.14);
    x.fillRect(s / 2 + s * 0.11, s / 2 + s * 0.02, s * 0.11, s * 0.14);
  }),
  shield: badgeCanvas((x, s) => {
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
  }),
  x2: badgeCanvas((x, s) => {
    x.fillStyle = '#ffd25f';
    x.font = `900 ${s * 0.42}px Nunito, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('×2', s / 2, s * 0.54);
  }),
  jet: badgeCanvas((x, s) => {
    x.fillStyle = '#ff5fd0';
    x.beginPath();
    x.moveTo(s * 0.36, s * 0.26);
    x.lineTo(s * 0.64, s * 0.26);
    x.lineTo(s * 0.58, s * 0.58);
    x.lineTo(s * 0.42, s * 0.58);
    x.closePath();
    x.fill();
    x.fillStyle = '#ffd25f';
    x.beginPath();
    x.moveTo(s * 0.44, s * 0.58);
    x.lineTo(s * 0.56, s * 0.58);
    x.lineTo(s * 0.5, s * 0.78);
    x.closePath();
    x.fill();
  }),
  sneaker: badgeCanvas((x, s) => {
    x.fillStyle = '#3dff88';
    x.beginPath();
    x.moveTo(s * 0.24, s * 0.62);
    x.quadraticCurveTo(s * 0.26, s * 0.4, s * 0.42, s * 0.42);
    x.quadraticCurveTo(s * 0.52, s * 0.44, s * 0.6, s * 0.54);
    x.quadraticCurveTo(s * 0.72, s * 0.66, s * 0.78, s * 0.64);
    x.lineTo(s * 0.78, s * 0.72);
    x.lineTo(s * 0.24, s * 0.72);
    x.closePath();
    x.fill();
    x.strokeStyle = '#fff';
    x.lineWidth = s * 0.03;
    x.beginPath();
    x.moveTo(s * 0.3, s * 0.52);
    x.lineTo(s * 0.42, s * 0.58);
    x.stroke();
  }),
};
