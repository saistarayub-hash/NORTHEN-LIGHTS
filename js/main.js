/* ============================================================
   NORTHERN LIGHTS RUN — main.js
   Boot, resize, input (keyboard + touch), UI state machine,
   local high scores, HUD, and the 60fps game loop.
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const G = E.G;

  /* ---------------- DOM refs ---------------- */
  const $ = (id) => document.getElementById(id);
  const UI = {
    hud: $('hud'), hudScore: $('hudScore'), hudDist: $('hudDist'),
    hudBuds: $('hudBudCount'), hudMult: $('hudMult'), pills: $('powerPills'),
    hint: $('hint'), flash: $('flash'), countdown: $('countdown'),
    menu: $('menu'), pause: $('pause'), gameover: $('gameover'),
    btnPlay: $('btnPlay'), btnPause: $('btnPause'),
    btnResume: $('btnResume'), btnRestartPause: $('btnRestartPause'), btnMenuPause: $('btnMenuPause'),
    btnAgain: $('btnAgain'), btnMenuOver: $('btnMenuOver'),
    btnSoundMenu: $('btnSoundMenu'), btnSoundPause: $('btnSoundPause'),
    finalScore: $('finalScore'), statDist: $('statDist'), statBuds: $('statBuds'), statStreak: $('statStreak'),
    newRecord: $('newRecord'), nameRow: $('nameRow'), nameInput: $('nameInput'), btnSaveScore: $('btnSaveScore'),
    menuScores: $('menuScores'), overScores: $('overScores'),
  };

  /* ---------------- state ---------------- */
  let state = 'menu'; // menu | count | run | pause | over
  let cd = null;      // countdown { seq, idx, t }
  let hudTimer = 0;
  let hintTimer = 0;
  let pendingScore = null;
  let fpsEMA = 16.7, fpsFrames = 0, degraded = false;
  let lastTs = 0;

  /* ---------------- high scores ---------------- */
  const HS_KEY = 'nlhs_v1';
  const NAME_KEY = 'nl_name';
  let memHS = [];
  function loadHS() {
    try {
      const raw = localStorage.getItem(HS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return memHS; }
  }
  function saveHS(list) {
    memHS = list;
    try { localStorage.setItem(HS_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function qualifies(score) {
    const hs = loadHS();
    return score > 0 && (hs.length < 8 || score > hs[hs.length - 1].s);
  }
  function addHS(entry) {
    const hs = loadHS();
    hs.push(entry);
    hs.sort((a, b) => b.s - a.s);
    if (hs.length > 8) hs.length = 8;
    saveHS(hs);
    try { localStorage.setItem(NAME_KEY, entry.n); } catch (e) {}
    renderScores();
  }
  function renderScores() {
    const hs = loadHS();
    const build = (ol) => {
      ol.innerHTML = '';
      if (!hs.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'No runs yet — be the first legend.';
        ol.appendChild(li);
        return;
      }
      hs.slice(0, 5).forEach((h, i) => {
        const li = document.createElement('li');
        if (i === 0) li.className = 'top1';
        li.innerHTML = `<span class="rank">${i + 1}.</span><span class="nm"></span><span class="sc">${h.s.toLocaleString()}</span>`;
        li.querySelector('.nm').textContent = h.n;
        ol.appendChild(li);
      });
    };
    build(UI.menuScores);
    build(UI.overScores);
  }

  /* ---------------- audio helpers ---------------- */
  function unlockAudio() { A.unlock(); A.setMute(A.muted); }
  document.addEventListener('pointerdown', unlockAudio, { capture: true });
  document.addEventListener('keydown', unlockAudio, { capture: true });

  function updateSoundButtons() {
    const label = A.muted ? '🔇 SOUND OFF' : '🔊 SOUND ON';
    UI.btnSoundMenu.textContent = label;
    UI.btnSoundPause.textContent = label;
  }
  function toggleSound() {
    A.setMute(!A.muted);
    updateSoundButtons();
    A.sfx.ui();
  }
  UI.btnSoundMenu.addEventListener('click', toggleSound);
  UI.btnSoundPause.addEventListener('click', toggleSound);

  /* ---------------- sizing ---------------- */
  function sizeCanvas() {
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = degraded ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    G.W = W; G.H = H;
    G.cx = W / 2;
    G.horizonY = H * 0.42;
    G.F = Math.min(H * 0.84, W * 1.02);
    S.buildSky(W, H);
  }
  window.addEventListener('resize', sizeCanvas);
  window.addEventListener('orientationchange', () => setTimeout(sizeCanvas, 120));

  /* ---------------- screens ---------------- */
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }
  function hideAllScreens() { hide(UI.menu); hide(UI.pause); hide(UI.gameover); }

  function toMenu() {
    state = 'menu';
    E.resetWorld('menu');
    hideAllScreens();
    show(UI.menu);
    hide(UI.hud);
    A.musicStop(0.4);
    renderScores();
  }

  function startGame(fast) {
    E.resetWorld('play');
    hideAllScreens();
    show(UI.hud);
    UI.hint.classList.remove('fade');
    hintTimer = 4.5;
    state = 'count';
    cd = fast ? { seq: ['GO!'], idx: 0, t: 0 } : { seq: ['3', '2', '1', 'GO!'], idx: 0, t: 0 };
    runCountdownStep();
  }

  function runCountdownStep() {
    if (!cd) return;
    UI.countdown.textContent = cd.seq[cd.idx];
    UI.countdown.classList.remove('hidden', 'pop');
    void UI.countdown.offsetWidth; // reflow to restart animation
    UI.countdown.classList.add('pop');
    A.sfx.count(cd.seq[cd.idx] === 'GO!');
  }

  function finishCountdown() {
    UI.countdown.classList.add('hidden');
    UI.countdown.textContent = '';
    state = 'run';
    A.musicStart();
  }

  function togglePause() {
    if (state === 'run' && G.mode === 'play') {
      state = 'pause';
      show(UI.pause);
      A.musicStop(0.15);
      A.sfx.ui();
    } else if (state === 'pause') {
      hide(UI.pause);
      state = 'count';
      cd = { seq: ['GO!'], idx: 0, t: 0 };
      runCountdownStep();
      A.sfx.ui();
    }
  }

  /* ---------------- game over ---------------- */
  G.onGameOver = function () {
    state = 'over';
    const score = Math.floor(G.score);
    const best = loadHS()[0];
    pendingScore = { n: '', s: score, b: G.buds, d: Math.floor(G.dist), t: Date.now() };
    UI.statDist.textContent = Math.floor(G.dist) + ' m';
    UI.statBuds.textContent = G.buds;
    UI.statStreak.textContent = '×' + Math.max(1, G.streakBest);
    UI.newRecord.classList.toggle('hidden', !(best && score > best.s));
    const q = qualifies(score);
    UI.nameRow.classList.toggle('hidden', !q);
    if (q) {
      let nm = 'RUNNER';
      try { nm = localStorage.getItem(NAME_KEY) || 'RUNNER'; } catch (e) {}
      UI.nameInput.value = nm;
    }
    // score count-up
    const t0 = performance.now();
    const dur = 800;
    (function tick(now) {
      const f = Math.min(1, (now - t0) / dur);
      UI.finalScore.textContent = Math.floor(score * (1 - Math.pow(1 - f, 3))).toLocaleString();
      if (f < 1 && state === 'over') requestAnimationFrame(tick);
    })(t0);
    show(UI.gameover);
    renderScores();
  };

  function flushPendingScore() {
    if (!pendingScore) return;
    if (qualifies(pendingScore.s)) {
      let n = (UI.nameInput.value || 'RUNNER').trim().toUpperCase().slice(0, 10) || 'RUNNER';
      pendingScore.n = n;
      addHS(pendingScore);
    }
    pendingScore = null;
  }

  UI.btnSaveScore.addEventListener('click', () => { flushPendingScore(); A.sfx.ui(); });
  UI.nameInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { flushPendingScore(); A.sfx.ui(); }
  });

  /* ---------------- buttons ---------------- */
  UI.btnPlay.addEventListener('click', () => { A.sfx.ui(); startGame(false); });
  UI.btnAgain.addEventListener('click', () => { flushPendingScore(); A.sfx.ui(); startGame(true); });
  UI.btnMenuOver.addEventListener('click', () => { flushPendingScore(); A.sfx.ui(); toMenu(); });
  UI.btnResume.addEventListener('click', togglePause);
  UI.btnRestartPause.addEventListener('click', () => { A.sfx.ui(); startGame(true); });
  UI.btnMenuPause.addEventListener('click', () => { A.sfx.ui(); toMenu(); });
  UI.btnPause.addEventListener('click', togglePause);

  /* ---------------- keyboard ---------------- */
  window.addEventListener('keydown', (e) => {
    const c = e.code;
    const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyP', 'Escape', 'Enter'];
    if (handled.includes(c)) e.preventDefault();
    if (e.repeat) return;

    if (c === 'ArrowLeft' || c === 'KeyA') E.act.move(-1);
    else if (c === 'ArrowRight' || c === 'KeyD') E.act.move(1);
    else if (c === 'ArrowUp' || c === 'KeyW') {
      if (state === 'run') E.act.jump();
      else if (state === 'menu') { A.sfx.ui(); startGame(false); }
    }
    else if (c === 'Space') {
      if (state === 'run') E.act.jump();
      else if (state === 'menu') { A.sfx.ui(); startGame(false); }
      else if (state === 'over' && !UI.gameover.classList.contains('hidden')) { flushPendingScore(); startGame(true); }
    }
    else if (c === 'ArrowDown' || c === 'KeyS') E.act.roll();
    else if (c === 'KeyP' || c === 'Escape') togglePause();
    else if (c === 'Enter') {
      if (state === 'menu') { A.sfx.ui(); startGame(false); }
      else if (state === 'over') { flushPendingScore(); startGame(true); }
      else if (state === 'pause') togglePause();
    }
  });

  /* ---------------- touch / swipe ---------------- */
  let tOrigin = null, tMoved = false, tTime = 0;
  const SWIPE = 26;
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'run') return;
    tOrigin = { x: e.clientX, y: e.clientY };
    tMoved = false;
    tTime = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!tOrigin || state !== 'run') return;
    const dx = e.clientX - tOrigin.x, dy = e.clientY - tOrigin.y;
    if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
    if (Math.abs(dx) > Math.abs(dy)) E.act.move(dx > 0 ? 1 : -1);
    else if (dy < 0) E.act.jump();
    else E.act.roll();
    tOrigin = { x: e.clientX, y: e.clientY }; // allow chained swipes
    tMoved = true;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!tOrigin || state !== 'run') { tOrigin = null; return; }
    if (!tMoved && performance.now() - tTime < 280) E.act.jump(); // quick tap = jump
    tOrigin = null;
  });
  canvas.addEventListener('pointercancel', () => { tOrigin = null; });
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  /* auto-pause when tab hidden */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'run' && G.mode === 'play') togglePause();
  });
  window.addEventListener('blur', () => {
    if (state === 'run' && G.mode === 'play') togglePause();
  });

  /* ---------------- HUD ---------------- */
  const pillEls = {};
  function updateHUD(dt) {
    hudTimer -= dt;
    if (hudTimer > 0) return;
    hudTimer = 0.1;
    UI.hudScore.textContent = Math.floor(G.score).toLocaleString();
    UI.hudDist.textContent = Math.floor(G.dist) + ' m';
    UI.hudBuds.textContent = G.buds;
    if (G.comboMult > 1 && G.streakT > 0) {
      UI.hudMult.classList.remove('hidden');
      UI.hudMult.textContent = 'STREAK ×' + G.comboMult;
    } else {
      UI.hudMult.classList.add('hidden');
    }
    // power pills
    setPill('magnet', G.magnetT > 0, G.magnetT, 'MAGNET');
    setPill('x2', G.x2T > 0, G.x2T, '×2 PTS');
    setPill('shield', G.shield, 0, 'SHIELD');
  }
  function setPill(name, on, secs, label) {
    let el = pillEls[name];
    if (on) {
      if (!el) {
        el = document.createElement('div');
        el.className = 'pill ' + name;
        el.textContent = label;
        UI.pills.appendChild(el);
        pillEls[name] = el;
      }
      if (secs > 0) el.textContent = label + ' ' + Math.ceil(secs) + 's';
      else el.textContent = label;
    } else if (el) {
      el.remove();
      delete pillEls[name];
    }
  }

  /* ---------------- flash ---------------- */
  function checkFlash() {
    if (G.flashFlag) {
      G.flashFlag = 0;
      UI.flash.classList.remove('on');
      void UI.flash.offsetWidth;
      UI.flash.classList.add('on');
    }
  }

  /* ---------------- main loop ---------------- */
  function loop(ts) {
    requestAnimationFrame(loop);
    const dtRaw = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    const dt = Math.max(0.001, dtRaw);

    // fps watchdog: degrade quality once if we can't hold frame rate
    fpsEMA += (dtRaw * 1000 - fpsEMA) * 0.05;
    if (!degraded && ++fpsFrames > 240 && fpsEMA > 24) {
      degraded = true;
      G.quality = 0.6;
      sizeCanvas();
    }

    if (state === 'count' && cd) {
      cd.t += dt;
      if (cd.t > 0.55) {
        cd.t = 0;
        cd.idx++;
        if (cd.idx >= cd.seq.length) finishCountdown();
        else runCountdownStep();
      }
    }

    if (state === 'run' || state === 'over' || state === 'menu' || (state === 'count' && false)) {
      E.update(dt);
    }

    if (state === 'run' && hintTimer > 0) {
      hintTimer -= dt;
      if (hintTimer <= 0) UI.hint.classList.add('fade');
    }

    updateHUD(dt);
    checkFlash();

    // render
    ctx.setTransform(canvas.width / G.W, 0, 0, canvas.height / G.H, 0, 0);
    E.render(ctx);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    try { A.muted = localStorage.getItem('nl_muted') === '1'; } catch (e) { A.muted = false; }
    updateSoundButtons();
    sizeCanvas();
    S.init();
    E.resetWorld('menu');
    renderScores();
    // graceful fallback if hero art missing
    const logo = $('logoImg');
    logo.addEventListener('error', () => { logo.style.display = 'none'; });
    requestAnimationFrame((t) => { lastTs = t; requestAnimationFrame(loop); });
  }
  boot();
})();
