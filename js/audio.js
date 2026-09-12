/* ============================================================
   NORTHERN LIGHTS RUN — audio.js
   WebAudio synth: SFX + generative background loop.
   No assets needed. Audio context unlocks on first gesture.
   ============================================================ */
(function () {
  'use strict';

  const A = {
    ctx: null,
    master: null,
    sfxBus: null,
    musicBus: null,
    muted: false,
    musicOn: false,
    _timer: null,
    _step: 0,
    _nextT: 0,
    _noiseBuf: null,
  };

  const store = {
    get() { try { return localStorage.getItem('nl_muted') === '1'; } catch (e) { return false; } },
    set(v) { try { localStorage.setItem('nl_muted', v ? '1' : '0'); } catch (e) {} },
  };

  A.init = function () {
    if (A.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.muted ? 0 : 1;
    A.master.connect(A.ctx.destination);

    A.sfxBus = A.ctx.createGain();
    A.sfxBus.gain.value = 0.9;
    A.sfxBus.connect(A.master);

    A.musicBus = A.ctx.createGain();
    A.musicBus.gain.value = 0.0;
    const musFilter = A.ctx.createBiquadFilter();
    musFilter.type = 'lowpass';
    musFilter.frequency.value = 2400;
    A.musicBus.connect(musFilter);
    musFilter.connect(A.master);

    // pre-build noise buffer
    const len = A.ctx.sampleRate * 1.2;
    A._noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = A._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  };

  A.unlock = function () {
    A.init();
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  };

  A.setMute = function (m) {
    A.muted = m;
    store.set(m);
    if (A.master) A.master.gain.setTargetAtTime(m ? 0 : 1, A.ctx.currentTime, 0.03);
  };

  /* ---------- tiny helpers ---------- */
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone(opt) {
    if (!A.ctx || A.muted) return;
    const t = opt.t || A.ctx.currentTime;
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(opt.f0, t);
    if (opt.f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t + (opt.slide || opt.dur || 0.15));
    env(g, t, opt.a || 0.004, opt.vol || 0.2, opt.dur || 0.15);
    o.connect(g); g.connect(opt.bus || A.sfxBus);
    o.start(t); o.stop(t + (opt.a || 0.004) + (opt.dur || 0.15) + 0.05);
  }

  function noise(opt) {
    if (!A.ctx || A.muted) return;
    const t = opt.t || A.ctx.currentTime;
    const src = A.ctx.createBufferSource();
    src.buffer = A._noiseBuf;
    const f = A.ctx.createBiquadFilter();
    f.type = opt.ftype || 'lowpass';
    f.frequency.setValueAtTime(opt.f0 || 1200, t);
    if (opt.f1) f.frequency.exponentialRampToValueAtTime(opt.f1, t + opt.dur);
    const g = A.ctx.createGain();
    env(g, t, opt.a || 0.003, opt.vol || 0.2, opt.dur || 0.2);
    src.connect(f); f.connect(g); g.connect(opt.bus || A.sfxBus);
    src.start(t); src.stop(t + opt.dur + 0.1);
  }

  /* ---------- SFX ---------- */
  const S = A.sfx = {};

  S.pickup = function (combo) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    const step = Math.min(combo || 0, 14);
    const f = 620 * Math.pow(2, step / 12);
    tone({ f0: f, f1: f * 1.5, dur: 0.09, vol: 0.16, type: 'sine', t });
    tone({ f0: f * 2, dur: 0.05, vol: 0.05, type: 'triangle', t: t + 0.015 });
  };

  S.gold = function () {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    [880, 1108, 1318, 1760].forEach((f, i) => tone({ f0: f, dur: 0.14, vol: 0.14, type: 'triangle', t: t + i * 0.055 }));
  };

  S.power = function () {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => tone({ f0: f, dur: 0.16, vol: 0.15, type: 'square', t: t + i * 0.06 }));
  };

  S.jump = function () {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    tone({ f0: 300, f1: 720, dur: 0.16, vol: 0.1, type: 'sine', t });
    noise({ f0: 900, f1: 2600, dur: 0.12, vol: 0.05, t, ftype: 'bandpass' });
  };

  S.roll = function () {
    if (!A.ctx) return;
    noise({ f0: 700, f1: 180, dur: 0.2, vol: 0.12, t: A.ctx.currentTime });
  };

  S.lane = function () {
    if (!A.ctx) return;
    noise({ f0: 1600, f1: 400, dur: 0.08, vol: 0.06, t: A.ctx.currentTime, ftype: 'bandpass' });
  };

  S.land = function () {
    if (!A.ctx) return;
    noise({ f0: 300, f1: 90, dur: 0.1, vol: 0.1, t: A.ctx.currentTime });
  };

  S.near = function () {
    if (!A.ctx) return;
    noise({ f0: 2600, f1: 5000, dur: 0.14, vol: 0.08, t: A.ctx.currentTime, ftype: 'bandpass' });
  };

  S.crash = function () {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    noise({ f0: 3200, f1: 160, dur: 0.5, vol: 0.35, t });
    tone({ f0: 130, f1: 32, dur: 0.5, vol: 0.5, type: 'sine', t });
    tone({ f0: 96, f1: 24, dur: 0.6, vol: 0.3, type: 'triangle', t: t + 0.02 });
  };

  S.milestone = function () {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    [659, 830, 987].forEach((f, i) => tone({ f0: f, dur: 0.22, vol: 0.12, type: 'triangle', t: t + i * 0.07 }));
  };

  S.ui = function () {
    if (!A.ctx) return;
    tone({ f0: 740, dur: 0.06, vol: 0.09, type: 'sine', t: A.ctx.currentTime });
  };

  S.count = function (hi) {
    if (!A.ctx) return;
    tone({ f0: hi ? 880 : 520, dur: hi ? 0.3 : 0.1, vol: 0.14, type: 'triangle', t: A.ctx.currentTime });
  };

  /* ---------- generative music loop ---------- */
  const BPM = 116, SPB = 60 / BPM;
  // 16th-note steps per bar = 16
  const BASS = [110, 0, 110, 0, 130.8, 0, 110, 0, 98, 0, 98, 0, 87.3, 0, 98, 0];           // A2 C3 A2 G2 F2 G2
  const ARP  = [440, 523, 659, 523, 440, 659, 784, 659, 392, 494, 587, 494, 349, 440, 523, 440];
  const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 164.8, 196], [196, 246.9, 293.7]]; // Am F C G

  function schedStep(t, step) {
    const bar = Math.floor(step / 16) % 4;
    const s16 = step % 16;

    // bass
    if (BASS[s16] > 0) tone({ f0: BASS[s16] / 2, dur: 0.22, vol: 0.16, type: 'triangle', t, bus: A.musicBus, a: 0.008 });
    // arp
    tone({ f0: ARP[s16], dur: 0.11, vol: 0.045, type: 'square', t, bus: A.musicBus, a: 0.004 });
    // hat
    if (s16 % 2 === 0) noise({ f0: 7000, dur: 0.03, vol: s16 % 4 === 0 ? 0.03 : 0.018, t, ftype: 'highpass', bus: A.musicBus });
    // kick
    if (s16 % 8 === 0) tone({ f0: 150, f1: 44, dur: 0.14, vol: 0.3, type: 'sine', t, bus: A.musicBus });
    // pad chord each bar
    if (s16 === 0) {
      const ch = CHORDS[bar];
      ch.forEach((f) => {
        tone({ f0: f, dur: SPB * 4, vol: 0.028, type: 'sawtooth', t, bus: A.musicBus, a: 0.5 });
        tone({ f0: f * 1.006, dur: SPB * 4, vol: 0.028, type: 'sawtooth', t, bus: A.musicBus, a: 0.5 });
      });
    }
  }

  function musicTick() {
    if (!A.ctx || !A.musicOn) return;
    const ahead = 0.14;
    while (A._nextT < A.ctx.currentTime + ahead) {
      schedStep(Math.max(A._nextT, A.ctx.currentTime + 0.01), A._step);
      A._step = (A._step + 1) % 64;
      A._nextT += SPB / 4;
    }
  }

  A.musicStart = function () {
    if (!A.ctx) return;
    if (A.ctx.state === 'suspended') A.ctx.resume();
    A.musicOn = true;
    A._step = 0;
    A._nextT = A.ctx.currentTime + 0.06;
    A.musicBus.gain.setTargetAtTime(A.muted ? 0 : 1, A.ctx.currentTime, 0.4);
    if (!A._timer) A._timer = setInterval(musicTick, 30);
  };

  A.musicStop = function (fade) {
    A.musicOn = false;
    if (A.ctx) A.musicBus.gain.setTargetAtTime(0, A.ctx.currentTime, fade || 0.25);
  };

  A.musicDuck = function (on) { // duck music at game over
    if (A.ctx) A.musicBus.gain.setTargetAtTime(on ? 0.25 : 1, A.ctx.currentTime, 0.2);
  };

  window.A = A;
})();
