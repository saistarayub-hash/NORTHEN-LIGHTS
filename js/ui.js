/* ============================================================
   NORTHERN LIGHTS RUN — ui.js
   All DOM UI: HUD (score / distance / ×multiplier / buds /
   boards / keys / FPS / power pills), menu (hero art, starring
   DOC, Instagram chips, how-to, compact high scores, 18+,
   142 Protea Ave), pause, game over, 3-2-1-GO countdown
   ("GO 👑 NAME" for crown runs), second-chance overlay,
   speech-bubble emotes, floating popups (3D→screen projection),
   red crash flash, speed lines, and the hidden LOBBY
   (opens only via index.html#cockpit): Board Shop, Crew row,
   ALL-TIME / THIS WEEK leaderboard with owner crown chips,
   device stats, two-tap leaderboard reset.
   ============================================================ */
import { G, resetWorld, EMOTE_CD } from './sim.js';
import {
  loadHS, saveHS, hsQualifies, hsAdd, loadOwners, isOwner,
  loadStats, saveStats, getName, setName, getBoards, setBoards,
  getChar, setChar, isUnlocked, lsGet, lsSet, KEYS,
} from './store.js';
import { BOARDS, boardById, CHARS, charById } from './boards.js';

export function createUI(project, qualityApi) {
  const $ = (id) => document.getElementById(id);
  const UI = {
    state: 'menu',
    crown: null,
  };

  const R = {
    hud: $('hud'), hudScore: $('hudScore'), hudDist: $('hudDist'),
    hudMult: $('hudMult'), hudStreak: $('hudStreak'),
    hudBuds: $('hudBudCount'), hudBoards: $('hudBoardCount'), hudKeys: $('hudKeyCount'),
    btnPause: $('btnPause'), fps: $('fps'), pills: $('powerPills'),
    hint: $('hint'), flash: $('flash'), countdown: $('countdown'),
    speedlines: $('speedlines'), emote: $('emote'), popups: $('popups'),
    menu: $('menu'), pause: $('pause'), gameover: $('gameover'),
    sc: $('scOverlay'), scCount: $('scCount'),
    btnPlay: $('btnPlay'), btnLobby: $('btnLobby'), crownChip: $('crownChip'), crownName: $('crownName'), crownClear: $('crownClear'),
    menuScores: $('menuScores'),
    btnSoundMenu: $('btnSoundMenu'), btnSoundPause: $('btnSoundPause'),
    lobby: $('lobby'), lobbyBoards: $('lobbyBoards'), lobbyCrew: $('lobbyCrew'), lobbyRank: $('lobbyRank'),
    tabBoards: $('tabBoards'), tabCrew: $('tabCrew'), tabRank: $('tabRank'),
    rankAll: $('rankAll'), rankWeek: $('rankWeek'), lobbyList: $('lobbyList'),
    lobbyStats: $('lobbyStats'), lobbyReset: $('lobbyReset'), lobbyBack: $('lobbyBack'),
    btnResume: $('btnResume'), btnRestartPause: $('btnRestartPause'), btnMenuPause: $('btnMenuPause'),
    finalScore: $('finalScore'), statDist: $('statDist'), statBuds: $('statBuds'), statStreak: $('statStreak'),
    newRecord: $('newRecord'), crownTag: $('crownTag'),
    nameRow: $('nameRow'), nameInput: $('nameInput'), btnSaveScore: $('btnSaveScore'),
    overScores: $('overScores'), btnAgain: $('btnAgain'), btnMenuOver: $('btnMenuOver'),
  };

  const show = (el) => el && el.classList.remove('hidden');
  const hide = (el) => el && el.classList.add('hidden');
  const hideAll = () => { hide(R.menu); hide(R.pause); hide(R.gameover); hide(R.lobby); hide(R.sc); };

  /* ---------------- audio ---------------- */
  function updateSoundButtons() {
    const A = window.A;
    if (!A) return;
    const label = A.muted ? '🔇 SOUND OFF' : '🔊 SOUND ON';
    R.btnSoundMenu.textContent = label;
    R.btnSoundPause.textContent = label;
  }
  function toggleSound() {
    const A = window.A;
    if (!A) return;
    A.setMute(!A.muted);
    updateSoundButtons();
    A.sfx.ui();
  }
  R.btnSoundMenu.addEventListener('click', toggleSound);
  R.btnSoundPause.addEventListener('click', toggleSound);

  /* ---------------- high scores ---------------- */
  let pendingScore = null;

  function renderScores() {
    const hs = loadHS();
    const build = (ol, n) => {
      ol.innerHTML = '';
      if (!hs.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'No runs yet — be the first legend.';
        ol.appendChild(li);
        return;
      }
      hs.slice(0, n).forEach((h, i) => {
        const li = document.createElement('li');
        if (i === 0) li.className = 'top1';
        const rank = document.createElement('span');
        rank.className = 'rank';
        rank.textContent = (i + 1) + '.';
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = (h.o ? '👑 ' : '') + h.n;
        const sc = document.createElement('span');
        sc.className = 'sc';
        sc.textContent = h.s.toLocaleString();
        li.appendChild(rank); li.appendChild(nm); li.appendChild(sc);
        ol.appendChild(li);
      });
    };
    build(R.menuScores, 5);
    build(R.overScores, 8);
  }

  /* ---------------- countdown ---------------- */
  let cd = null;
  function runCountdownStep() {
    if (!cd) return;
    const A = window.A;
    let txt = cd.seq[cd.idx];
    if (txt === 'GO!' && UI.crown) txt = 'GO 👑 ' + UI.crown;
    R.countdown.textContent = txt;
    R.countdown.classList.toggle('crown', !!(txt === 'GO!' && UI.crown));
    R.countdown.classList.remove('hidden', 'pop');
    void R.countdown.offsetWidth;
    R.countdown.classList.add('pop');
    if (A) A.sfx.count(txt.indexOf('GO') === 0);
  }
  function finishCountdown() {
    hide(R.countdown);
    R.countdown.textContent = '';
    UI.state = 'run';
    const A = window.A;
    if (A) A.musicStart();
  }

  function tick(dt) {
    if (UI.state === 'count' && cd) {
      cd.t += dt;
      if (cd.t > 0.55) {
        cd.t = 0;
        cd.idx++;
        if (cd.idx >= cd.seq.length) finishCountdown();
        else runCountdownStep();
      }
    }
    if (UI.state === 'sc' && G.mode === 'sc') {
      show(R.sc);
      R.scCount.textContent = Math.max(0, G.scT).toFixed(1);
    } else {
      hide(R.sc);
    }
  }

  /* ---------------- state transitions ---------------- */
  function toMenu() {
    UI.state = 'menu';
    UI.crown = null;
    updateCrownChip();
    resetWorld('menu');
    hideAll();
    show(R.menu);
    hide(R.hud);
    const A = window.A;
    if (A) A.musicStop(0.4);
    renderScores();
    if (qualityApi) qualityApi.resetCam && qualityApi.resetCam();
  }

  function startGame(fast) {
    resetWorld('play');
    G.crownOwner = UI.crown;
    hideAll();
    show(R.hud);
    R.hint.classList.remove('fade');
    UI.hintTimer = 4.5;
    UI.state = 'count';
    cd = fast ? { seq: ['GO!'], idx: 0, t: 0 } : { seq: ['3', '2', '1', 'GO!'], idx: 0, t: 0 };
    runCountdownStep();
  }

  function togglePause() {
    const A = window.A;
    if (UI.state === 'run' && G.mode === 'play') {
      UI.state = 'pause';
      show(R.pause);
      if (A) { A.musicStop(0.15); A.sfx.ui(); }
    } else if (UI.state === 'pause') {
      hide(R.pause);
      UI.state = 'count';
      cd = { seq: ['GO!'], idx: 0, t: 0 };
      runCountdownStep();
      if (A) A.sfx.ui();
    }
  }

  /* ---------------- game over ---------------- */
  G.onGameOver = function () {
    UI.state = 'over';
    const score = Math.floor(G.score);
    const best = loadHS()[0];
    const stats = loadStats();
    stats.r++;
    stats.d += Math.floor(G.dist);
    stats.b += G.buds;
    stats.bb += G.statsBB;
    stats.ks += G.statsKS;
    stats.best = Math.max(stats.best, score);
    stats.t = Date.now();
    saveStats(stats);

    const isCrown = !!G.crownOwner;
    pendingScore = { n: isCrown ? G.crownOwner : '', s: score, b: G.buds, d: Math.floor(G.dist), t: Date.now(), o: isCrown ? 1 : 0 };

    R.statDist.textContent = Math.floor(G.dist) + ' m';
    R.statBuds.textContent = G.buds;
    R.statStreak.textContent = '×' + Math.max(1, G.streakBest);
    R.newRecord.classList.toggle('hidden', !(best && score > best.s));
    R.crownTag.classList.toggle('hidden', !isCrown);
    if (isCrown) R.crownTag.textContent = '👑 BANKED FOR ' + G.crownOwner;

    const q = !isCrown && hsQualifies(score, loadHS());
    R.nameRow.classList.toggle('hidden', !q);
    if (q) R.nameInput.value = getName() || '';

    const t0 = performance.now();
    const dur = 800;
    (function tickScore(now) {
      const f = Math.min(1, (now - t0) / dur);
      R.finalScore.textContent = Math.floor(score * (1 - Math.pow(1 - f, 3))).toLocaleString();
      if (f < 1 && UI.state === 'over') requestAnimationFrame(tickScore);
    })(t0);

    show(R.gameover);
    renderScores();
  };

  function flushPendingScore() {
    if (!pendingScore) return;
    if (pendingScore.o) {
      hsAdd(pendingScore, loadHS());
    } else if (hsQualifies(pendingScore.s, loadHS())) {
      let n = (R.nameInput.value || '').trim().toUpperCase().slice(0, 10) || 'RUNNER';
      pendingScore.n = n;
      hsAdd(pendingScore, loadHS());
      setName(n);
    }
    pendingScore = null;
  }

  R.btnSaveScore.addEventListener('click', () => { flushPendingScore(); const A = window.A; if (A) A.sfx.ui(); });
  R.nameInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { flushPendingScore(); const A = window.A; if (A) A.sfx.ui(); }
  });

  /* ---------------- buttons ---------------- */
  R.btnPlay.addEventListener('click', () => { const A = window.A; if (A) A.sfx.ui(); startGame(false); });
  R.btnAgain.addEventListener('click', () => { flushPendingScore(); const A = window.A; if (A) A.sfx.ui(); startGame(true); });
  R.btnMenuOver.addEventListener('click', () => { flushPendingScore(); const A = window.A; if (A) A.sfx.ui(); toMenu(); });
  R.btnResume.addEventListener('click', togglePause);
  R.btnRestartPause.addEventListener('click', () => { const A = window.A; if (A) A.sfx.ui(); startGame(true); });
  R.btnMenuPause.addEventListener('click', () => { const A = window.A; if (A) A.sfx.ui(); toMenu(); });
  R.btnPause.addEventListener('click', togglePause);

  /* ---------------- crown run chip (menu) ---------------- */
  function updateCrownChip() {
    R.crownChip.classList.toggle('hidden', !UI.crown);
    if (UI.crown) R.crownName.textContent = '👑 CROWN RUN — ' + UI.crown;
  }
  R.crownClear.addEventListener('click', (e) => {
    e.stopPropagation();
    UI.crown = null;
    updateCrownChip();
  });

  /* ---------------- hash → lobby gate ---------------- */
  function hashAllowsLobby() {
    try { return window.location && window.location.hash === '#cockpit'; } catch (e) { return false; }
  }
  function refreshHash() {
    R.btnLobby.classList.toggle('hidden', !hashAllowsLobby());
  }
  window.addEventListener('hashchange', refreshHash);
  refreshHash();

  /* ---------------- lobby ---------------- */
  let lobbyTab = 'boards';
  let rankWeek = false;
  let resetArmed = 0;

  function boardThumb(b) {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const x = c.getContext('2d');
    x.translate(48, 52);
    x.rotate(-0.18);
    const glow = x.createRadialGradient(0, 6, 4, 0, 6, 46);
    glow.addColorStop(0, b.glow + '55');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = glow;
    x.fillRect(-48, -48, 96, 96);
    x.fillStyle = b.c1;
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.lineWidth = 2;
    roundRect(x, -30, -12, 60, 24, 12);
    x.fill(); x.stroke();
    x.fillStyle = b.c2;
    roundRect(x, -34, -16, 8, 32, 4); x.fill();
    roundRect(x, 26, -16, 8, 32, 4); x.fill();
    x.globalAlpha = 0.8;
    x.beginPath(); x.arc(0, 0, 5, 0, 7); x.fill();
    x.globalAlpha = 1;
    x.fillStyle = b.c2;
    x.font = '900 13px sans-serif';
    x.textAlign = 'center';
    x.fillText('🌿', 0, 5);
    return c;
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

  function renderLobby() {
    const selBoard = boardById(lsGet(KEYS.BOARD, 'aurora'));
    const selChar = charById(getChar());
    const unlocked = isUnlocked();

    /* boards tab */
    R.lobbyBoards.innerHTML = '';
    BOARDS.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'boardCard' + (b.id === selBoard.id ? ' sel' : '');
      const th = document.createElement('div');
      th.className = 'boardThumb';
      th.appendChild(boardThumb(b));
      const nm = document.createElement('div');
      nm.className = 'boardName';
      nm.textContent = b.name;
      const tag = document.createElement('div');
      tag.className = 'boardTag';
      tag.textContent = b.id === selBoard.id ? 'EQUIPPED ✓' : 'TAP TO EQUIP';
      card.appendChild(th); card.appendChild(nm); card.appendChild(tag);
      card.addEventListener('click', () => {
        lsSet(KEYS.BOARD, b.id);
        if (window.A) window.A.sfx.ui();
        renderLobby();
      });
      R.lobbyBoards.appendChild(card);
    });

    /* crew tab */
    R.lobbyCrew.innerHTML = '';
    CHARS.forEach((ch) => {
      const locked = ch.locked && !unlocked;
      const card = document.createElement('div');
      card.className = 'crewCard' + (ch.id === selChar.id ? ' sel' : '') + (locked ? ' locked' : '');
      const av = document.createElement('div');
      av.className = 'crewAvatar';
      av.style.background = ch.hood;
      av.textContent = ch.id === 'doc' ? '🧢' : '🏃';
      const nm = document.createElement('div');
      nm.className = 'crewName';
      nm.textContent = ch.name + (ch.ig ? ' ' + ch.ig : '');
      const tag = document.createElement('div');
      tag.className = 'crewTag';
      tag.textContent = locked ? '🔒 UNLOCK IN COCKPIT' : (ch.id === selChar.id ? 'SELECTED ✓' : 'TAP TO PICK');
      card.appendChild(av); card.appendChild(nm); card.appendChild(tag);
      if (!locked) card.addEventListener('click', () => {
        setChar(ch.id);
        if (window.A) window.A.sfx.ui();
        renderLobby();
      });
      R.lobbyCrew.appendChild(card);
    });

    /* rankings tab */
    const hs = loadHS();
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 3600 * 1000;
    const list = (rankWeek ? hs.filter(e => e.t >= weekAgo) : hs).slice(0, 8);
    const owners = loadOwners();
    R.lobbyList.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = rankWeek ? 'No runs this week yet.' : 'No runs yet — be the first legend.';
      R.lobbyList.appendChild(empty);
    }
    list.forEach((h, i) => {
      const row = document.createElement('div');
      row.className = 'rankRow' + (h.o || isOwner(h.n) ? ' owner' : '');
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = (i + 1) + '.';
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = (h.o ? '👑 ' : '') + h.n;
      const sc = document.createElement('span');
      sc.className = 'sc';
      sc.textContent = h.s.toLocaleString();
      const dm = document.createElement('span');
      dm.className = 'dm';
      dm.textContent = (h.d || 0) + ' m';
      row.appendChild(rank); row.appendChild(nm); row.appendChild(dm); row.appendChild(sc);
      const ownerName = h.o ? h.n : owners.find(o => o.n.toUpperCase() === String(h.n).toUpperCase());
      if (ownerName) {
        row.title = 'Tap: start a crown run for ' + ownerName;
        row.addEventListener('click', () => {
          UI.crown = ownerName.n || ownerName;
          updateCrownChip();
          if (window.A) window.A.sfx.power();
          hideLobby();
        });
      }
      R.lobbyList.appendChild(row);
    });
    // owner chips (registered in cockpit)
    if (owners.length) {
      const chipRow = document.createElement('div');
      chipRow.className = 'ownerChips';
      const lbl = document.createElement('div');
      lbl.className = 'chipLbl';
      lbl.textContent = 'OWNER CROWN RUNS';
      chipRow.appendChild(lbl);
      owners.forEach((o) => {
        const chip = document.createElement('button');
        chip.className = 'chipBtn' + (UI.crown === o.n ? ' sel' : '');
        chip.textContent = '👑 ' + o.n;
        chip.addEventListener('click', () => {
          UI.crown = o.n;
          updateCrownChip();
          if (window.A) window.A.sfx.power();
          hideLobby();
        });
        chipRow.appendChild(chip);
      });
      R.lobbyList.appendChild(chipRow);
    }

    /* device stats */
    const s = loadStats();
    R.lobbyStats.innerHTML =
      `<div><span>Runs</span><b>${s.r}</b></div>` +
      `<div><span>Best</span><b>${s.best.toLocaleString()}</b></div>` +
      `<div><span>Total distance</span><b>${s.d.toLocaleString()} m</b></div>` +
      `<div><span>Total buds</span><b>${s.b}</b></div>` +
      `<div><span>Boards broken</span><b>${s.bb}</b></div>` +
      `<div><span>Key saves</span><b>${s.ks}</b></div>`;
  }

  function showLobby() {
    if (!hashAllowsLobby()) return;
    renderLobby();
    setLobbyTab('boards');
    hideAll();
    show(R.lobby);
    if (window.A) window.A.sfx.ui();
  }
  function hideLobby() {
    hide(R.lobby);
    if (UI.state === 'menu') { show(R.menu); renderScores(); }
  }
  function setLobbyTab(t) {
    lobbyTab = t;
    R.tabBoards.classList.toggle('on', t === 'boards');
    R.tabCrew.classList.toggle('on', t === 'crew');
    R.tabRank.classList.toggle('on', t === 'rank');
    R.lobbyBoards.classList.toggle('hidden', t !== 'boards');
    R.lobbyCrew.classList.toggle('hidden', t !== 'crew');
    R.lobbyRank.classList.toggle('hidden', t !== 'rank');
    if (t === 'rank') renderLobby();
  }
  R.btnLobby.addEventListener('click', showLobby);
  R.lobbyBack.addEventListener('click', hideLobby);
  R.tabBoards.addEventListener('click', () => setLobbyTab('boards'));
  R.tabCrew.addEventListener('click', () => setLobbyTab('crew'));
  R.tabRank.addEventListener('click', () => setLobbyTab('rank'));
  R.rankAll.addEventListener('click', () => { rankWeek = false; R.rankAll.classList.add('on'); R.rankWeek.classList.remove('on'); renderLobby(); });
  R.rankWeek.addEventListener('click', () => { rankWeek = true; R.rankWeek.classList.add('on'); R.rankAll.classList.remove('on'); renderLobby(); });
  R.lobbyReset.addEventListener('click', () => {
    const A = window.A;
    if (A) A.sfx.ui();
    const now = performance.now();
    if (now - resetArmed < 3000) {
      saveHS([]);
      resetArmed = 0;
      R.lobbyReset.textContent = 'LEADERBOARD RESET';
      R.lobbyReset.classList.remove('armed');
      renderLobby();
      renderScores();
    } else {
      resetArmed = now;
      R.lobbyReset.textContent = 'TAP AGAIN TO CONFIRM ⚠';
      R.lobbyReset.classList.add('armed');
      setTimeout(() => {
        R.lobbyReset.textContent = 'LEADERBOARD RESET';
        R.lobbyReset.classList.remove('armed');
      }, 3000);
    }
  });

  /* ---------------- popups (3D → DOM, pooled) ---------------- */
  const POP_N = 12;
  const popPool = [];
  for (let i = 0; i < POP_N; i++) {
    const el = document.createElement('div');
    el.className = 'pop';
    el.style.display = 'none';
    R.popups.appendChild(el);
    popPool.push({ el, on: false, text: '', x: 0, y: 0, z: 0, col: '#7dffa8', big: false, age: 0, life: 0.9 });
  }
  let popCursor = 0;
  const popOut = { x: 0, y: 0, z: 0 };
  G.fx && G.fx.pop; // no-op guard
  G.popQ = G.popQ || [];
  function pushPop(text, x, y, z, col, big) {
    if (G.popQ.length > 20) G.popQ.shift();
    G.popQ.push({ text, x, y, z, col: col || '#7dffa8', big: !!big });
  }
  (function patchFxPop() {
    if (G.fx) G.fx.pop = pushPop;
  })();
  function updatePopups(dt) {
    if (G.popQ.length) {
      const q = G.popQ;
      G.popQ = [];
      for (let i = 0; i < q.length; i++) {
        const p = q[i];
        const slot = popPool[popCursor];
        popCursor = (popCursor + 1) % POP_N;
        slot.on = true; slot.text = p.text; slot.x = p.x; slot.y = p.y; slot.z = p.z;
        slot.col = p.col; slot.big = p.big; slot.age = 0;
        slot.el.textContent = p.text;
        slot.el.style.color = p.col;
        slot.el.classList.toggle('big', p.big);
        slot.el.style.display = 'block';
      }
    }
    const runActive = UI.state === 'run' || UI.state === 'sc' || UI.state === 'over' || UI.state === 'count';
    for (const slot of popPool) {
      if (!slot.on) continue;
      slot.age += dt;
      if (slot.age >= slot.life || !runActive) { slot.on = false; slot.el.style.display = 'none'; continue; }
      project(slot.x, slot.y + slot.age * 1.1, slot.z, popOut);
      if (!isFinite(popOut.x)) continue;
      const f = slot.age / slot.life;
      const a = f < 0.75 ? 1 : 1 - (f - 0.75) / 0.25;
      slot.el.style.opacity = String(a);
      slot.el.style.left = popOut.x + 'px';
      slot.el.style.top = popOut.y + 'px';
    }
  }

  /* ---------------- emote speech bubble ---------------- */
  let emoteText = '';
  function updateEmote() {
    const e = G.emote;
    const on = e.age < e.dur && UI.state === 'run' && G.player.alive;
    if (on) {
      project(G.player.x, G.player.y + 2.15, G.dist + 6, popOut);
      if (isFinite(popOut.x)) {
        if (e.text !== emoteText) {
          emoteText = e.text;
          R.emote.textContent = e.text;
          R.emote.classList.remove('pop');
          void R.emote.offsetWidth;
          R.emote.classList.add('pop');
        }
        R.emote.style.left = popOut.x + 'px';
        R.emote.style.top = popOut.y + 'px';
        R.emote.style.display = 'block';
        const fade = e.age > e.dur - 0.3 ? (e.dur - e.age) / 0.3 : 1;
        R.emote.style.opacity = String(Math.max(0, fade));
        return;
      }
    }
    emoteText = '';
    R.emote.style.display = 'none';
  }

  /* ---------------- HUD ---------------- */
  let hudTimer = 0;
  let hintTimer = 0;
  UI.hintTimer = 0;
  const pillEls = {};
  function setPill(name, on, secs, label) {
    let el = pillEls[name];
    if (on) {
      if (!el) {
        el = document.createElement('div');
        el.className = 'pill ' + name;
        R.pills.appendChild(el);
        pillEls[name] = el;
      }
      el.textContent = secs > 0 ? label + ' ' + Math.ceil(secs) + 's' : label;
    } else if (el) {
      el.remove();
      delete pillEls[name];
    }
  }
  function updateHUD(dt) {
    if (UI.state !== 'run' && UI.state !== 'count' && UI.state !== 'sc' && UI.state !== 'over') return;
    hintTimer = UI.hintTimer;
    if (hintTimer > 0) {
      hintTimer -= dt;
      UI.hintTimer = hintTimer;
      if (hintTimer <= 0) R.hint.classList.add('fade');
    }
    hudTimer -= dt;
    if (hudTimer > 0) return;
    hudTimer = 0.1;
    R.hudScore.textContent = Math.floor(G.score).toLocaleString();
    R.hudDist.textContent = Math.floor(G.dist) + ' m';
    R.hudBuds.textContent = G.buds;
    R.hudBoards.textContent = G.boardsInv;
    R.hudKeys.textContent = G.keys;
    R.hudMult.textContent = '×' + G.distMult;
    R.hudMult.classList.toggle('hot', G.distMult >= 5);
    if (G.comboMult > 1 && G.streakT > 0) {
      R.hudStreak.classList.remove('hidden');
      R.hudStreak.textContent = 'STREAK ×' + G.comboMult;
    } else R.hudStreak.classList.add('hidden');
    setPill('magnet', G.magnetT > 0, G.magnetT, 'MAGNET');
    setPill('x2', G.x2T > 0, G.x2T, '×2 PTS');
    setPill('shield', G.shield, 0, 'SHIELD');
    setPill('jet', G.jetT > 0 && G.player.state === 'fly', G.jetT, 'JETPACK');
    setPill('sneaker', G.sneakerT > 0, G.sneakerT, 'SNEAKERS');
    setPill('board', G.onBoard, G.boardT, 'BOARD');
    // speed lines
    const sl = R.speedlines;
    if (sl) {
      const o = UI.state === 'run' ? Math.max(0, Math.min(0.55, (G.speed - 26) / 20)) : 0;
      sl.style.opacity = String(o);
    }
  }

  /* ---------------- fps ---------------- */
  let fpsVal = 60;
  function setFps(v) {
    fpsVal = v;
    R.fps.textContent = Math.round(v) + ' FPS';
    R.fps.className = v >= 50 ? 'hi' : v >= 30 ? 'mid' : 'lo';
  }

  /* ---------------- flash ---------------- */
  function checkFlash() {
    if (G.flashFlag) {
      G.flashFlag = 0;
      R.flash.classList.remove('on');
      void R.flash.offsetWidth;
      R.flash.classList.add('on');
    }
  }

  /* ---------------- boot the menu ---------------- */
  function boot() {
    const A = window.A;
    if (A) {
      try { A.muted = lsGet(KEYS.MUTED, '0') === '1'; } catch (e) { A.muted = false; }
      updateSoundButtons();
    }
    resetWorld('menu');
    hideAll();
    show(R.menu);
    renderScores();
    refreshHash();
  }

  UI.R = R;
  UI.startGame = startGame;
  UI.toMenu = toMenu;
  UI.togglePause = togglePause;
  UI.tick = tick;
  UI.update = (dt) => { updateHUD(dt); updatePopups(dt); updateEmote(); checkFlash(); };
  UI.setFps = setFps;
  UI.flushPendingScore = flushPendingScore;
  UI.renderLobby = renderLobby;
  UI.isUnlocked = isUnlocked;
  UI.boot = boot;
  return UI;
}
