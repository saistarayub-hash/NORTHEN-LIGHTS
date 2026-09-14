/* ============================================================
   NORTHERN LIGHTS RUN — store.js
   LocalStorage persistence. Keys are IDENTICAL to the previous
   build so saves keep working across versions:
     nlhs_v1      scores  [{n,s,b,d,t,o}]
     nl_owners_v1 owners  [{n, ig}]
     nl_stats_v1  device stats {r,d,b,bb,ks,best,t}
     nl_keys      keys held (number)
     nl_boards    board inventory 0..3 (number)
     nl_board     selected board id
     nl_name      runner name
     nl_muted     '0' | '1'
     nl_unlocked  '1' when crew unlocked via cockpit
     nl_char      selected runner id
   ============================================================ */
export const KEYS = {
  HS: 'nlhs_v1',
  OWNERS: 'nl_owners_v1',
  STATS: 'nl_stats_v1',
  NKEYS: 'nl_keys',
  BOARDS: 'nl_boards',
  BOARD: 'nl_board',
  NAME: 'nl_name',
  MUTED: 'nl_muted',
  UNLOCKED: 'nl_unlocked',
  CHAR: 'nl_char',
};

export function lsGet(k, dflt) {
  try { const v = localStorage.getItem(k); return v == null ? dflt : v; } catch (e) { return dflt; }
}
export function lsSet(k, v) {
  try { localStorage.setItem(k, v == null ? '' : String(v)); } catch (e) { /* private mode */ }
}
export function lsJSON(k, dflt) {
  const v = lsGet(k, null);
  if (v == null || v === '') return dflt;
  try { return JSON.parse(v); } catch (e) { return dflt; }
}
export function lsJSONSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
}

/* ---------------- high scores (top 8) ---------------- */
export function loadHS() {
  const h = lsJSON(KEYS.HS, []);
  if (!Array.isArray(h)) return [];
  return h.filter(e => e && typeof e.s === 'number');
}
export function saveHS(list) { lsJSONSet(KEYS.HS, list.slice(0, 8)); }

export function hsQualifies(score, hs) {
  return score > 0 && (hs.length < 8 || score > hs[hs.length - 1].s);
}
export function hsAdd(entry, hs) {
  hs.push(entry);
  hs.sort((a, b) => b.s - a.s);
  if (hs.length > 8) hs.length = 8;
  saveHS(hs);
}

/* ---------------- owners (registered in cockpit) ---------------- */
export function loadOwners() {
  const o = lsJSON(KEYS.OWNERS, []);
  if (!Array.isArray(o)) return [];
  return o.filter(e => e && e.n);
}
export function saveOwners(list) { lsJSONSet(KEYS.OWNERS, list); }
export function isOwner(name) {
  if (!name) return false;
  const n = String(name).toUpperCase();
  return loadOwners().some(o => String(o.n).toUpperCase() === n);
}

/* ---------------- device stats ---------------- */
export function loadStats() {
  const s = lsJSON(KEYS.STATS, null);
  if (!s || typeof s !== 'object') return { r: 0, d: 0, b: 0, bb: 0, ks: 0, best: 0, t: 0 };
  return { r: s.r | 0, d: s.d | 0, b: s.b | 0, bb: s.bb | 0, ks: s.ks | 0, best: s.best | 0, t: s.t | 0 };
}
export function saveStats(s) { lsJSONSet(KEYS.STATS, s); }

/* ---------------- inventory ---------------- */
export function getKeys() { return Math.max(0, parseInt(lsGet(KEYS.NKEYS, '0'), 10) || 0); }
export function setKeys(n) { lsSet(KEYS.NKEYS, String(Math.max(0, Math.min(99, n | 0)))); }
export function getBoards() { return Math.max(0, Math.min(3, parseInt(lsGet(KEYS.BOARDS, '2'), 10) || 0)); }
export function setBoards(n) { lsSet(KEYS.BOARDS, String(Math.max(0, Math.min(3, n | 0)))); }

/* ---------------- prefs ---------------- */
export function getName() { return lsGet(KEYS.NAME, ''); }
export function setName(n) { lsSet(KEYS.NAME, n); }
export function getMuted() { return lsGet(KEYS.MUTED, '0') === '1'; }
export function setMuted(m) { lsSet(KEYS.MUTED, m ? '1' : '0'); }
export function isUnlocked() { return lsGet(KEYS.UNLOCKED, '') === '1'; }
export function setUnlocked(v) { lsSet(KEYS.UNLOCKED, v ? '1' : ''); }
export function getChar() { return lsGet(KEYS.CHAR, 'doc'); }
export function setChar(c) { lsSet(KEYS.CHAR, c); }
