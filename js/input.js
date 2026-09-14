/* ============================================================
   NORTHERN LIGHTS RUN — input.js
   Keyboard (arrows/WASD/Space, F = board, P/Esc pause, Enter)
   + touch: swipe left/right/up/down, quick tap = jump,
   double-tap = board. Ported from the 2.5D main.js input.
   ============================================================ */
import { act, G } from './sim.js';

export function attachInput(handlers) {
  const { getState, onPause, onMenuEnter, onOverEnter } = handlers;
  const canvas = document.getElementById('game') || document.getElementById('app');

  /* ---------------- keyboard ---------------- */
  window.addEventListener('keydown', (e) => {
    const c = e.code;
    const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space',
      'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyP', 'Escape', 'Enter'];
    if (handled.includes(c)) e.preventDefault();
    if (e.repeat) return;
    const st = getState();

    if (c === 'ArrowLeft' || c === 'KeyA') act.move(-1);
    else if (c === 'ArrowRight' || c === 'KeyD') act.move(1);
    else if (c === 'ArrowUp' || c === 'KeyW') {
      if (st === 'run') act.jump();
      else if (st === 'menu') onMenuEnter();
    }
    else if (c === 'Space') {
      if (st === 'run') act.jump();
      else if (st === 'menu') onMenuEnter();
      else if (st === 'over') onOverEnter();
    }
    else if (c === 'ArrowDown' || c === 'KeyS') act.roll();
    else if (c === 'KeyF') act.board();
    else if (c === 'KeyP' || c === 'Escape') onPause();
    else if (c === 'Enter') {
      if (st === 'menu') onMenuEnter();
      else if (st === 'over') onOverEnter();
      else if (st === 'pause') onPause();
    }
  });

  /* ---------------- touch / swipe ---------------- */
  let tOrigin = null, tMoved = false, tTime = 0, lastTap = 0;
  const SWIPE = 26;

  canvas.addEventListener('pointerdown', (e) => {
    if (getState() !== 'run') return;
    tOrigin = { x: e.clientX, y: e.clientY };
    tMoved = false;
    tTime = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!tOrigin || getState() !== 'run') return;
    const dx = e.clientX - tOrigin.x, dy = e.clientY - tOrigin.y;
    if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
    if (Math.abs(dx) > Math.abs(dy)) act.move(dx > 0 ? 1 : -1);
    else if (dy < 0) act.jump();
    else act.roll();
    tOrigin = { x: e.clientX, y: e.clientY }; // chained swipes
    tMoved = true;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!tOrigin) { tOrigin = null; return; }
    const now = performance.now();
    if (!tMoved && now - tTime < 280) {
      // quick tap: jump — or board on double-tap
      if (now - lastTap < 280) act.board();
      else act.jump();
      lastTap = now;
    }
    tOrigin = null;
  });
  canvas.addEventListener('pointercancel', () => { tOrigin = null; });
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  /* auto-pause on tab blur */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && getState() === 'run') onPause();
  });
  window.addEventListener('blur', () => {
    if (getState() === 'run') onPause();
  });
}
