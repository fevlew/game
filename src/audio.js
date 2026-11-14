/* =============================================================
 *  audio.js — полностью процедурный звук на WebAudio.
 *  Никаких внешних файлов: всё синтезируется в реальном времени.
 * ============================================================= */
(function (global) {
  'use strict';
  const U = global.HG.U;

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.volume = 0.75;
      this.muted = false;
      this.listener = { x: 0, z: 0, yaw: 0 };
      this.noiseBuf = null;
      this._drone = null;
      this._wind = null;
      this._generator = null;
      this._heart = null;
      this._breath = null;
      this.intensity = 0;
      this.enabled = false;
    }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      /* 2 секунды белого шума — база для всех текстур */
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.enabled = true;
    }

    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

    setVolume(v) {
      this.volume = U.clamp(v, 0, 1);
      if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    }
    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : this.volume;
    }

    setListener(x, z, yaw) { this.listener.x = x; this.listener.z = z; this.listener.yaw = yaw; }

    /* панорама/громкость относительно слушателя */
    spatial(x, z, maxDist = 22) {
      const dx = x - this.listener.x, dz = z - this.listener.z;
      const dist = Math.hypot(dx, dz);
      let vol = U.clamp(1 - dist / maxDist, 0, 1);
      vol *= vol;
      /* угол камеры: yaw + PI (камера смотрит в локальную -Z) */
      const ang = Math.atan2(dx, dz) - (this.listener.yaw + Math.PI);
      const pan = U.clamp(-Math.sin(ang), -1, 1) * 0.9;
      return { vol, pan, dist };
    }

    _now() { return this.ctx.currentTime; }

    _out(pan) {
      const g = this.ctx.createGain();
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = pan || 0;
        g.connect(p); p.connect(this.master);
      } else {
        g.connect(this.master);
      }
      return g;
    }

    _noise(dur, { vol = 0.3, type = 'bandpass', freq = 800, q = 1, pan = 0, attack = 0.005, sweepTo = null } = {}) {
      if (!this.enabled) return null;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.playbackRate.value = 0.7 + Math.random() * 0.6;
      const filt = this.ctx.createBiquadFilter();
      filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
      if (sweepTo) {
        filt.frequency.setValueAtTime(freq, this._now());
        filt.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), this._now() + dur);
      }
      const g = this._out(pan);
      g.gain.setValueAtTime(0.0001, this._now());
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), this._now() + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, this._now() + dur);
      src.connect(filt); filt.connect(g);
      src.start(); src.stop(this._now() + dur + 0.05);
      return { src, g, filt };
    }

    _tone(freq, dur, { vol = 0.2, type = 'sine', pan = 0, glide = null, attack = 0.01, detune = 0 } = {}) {
      if (!this.enabled) return null;
      const osc = this.ctx.createOscillator();
      osc.type = type; osc.frequency.value = freq; osc.detune.value = detune;
      if (glide) {
        osc.frequency.setValueAtTime(freq, this._now());
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, glide), this._now() + dur);
      }
      const g = this._out(pan);
      g.gain.setValueAtTime(0.0001, this._now());
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), this._now() + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, this._now() + dur);
      osc.connect(g);
      osc.start(); osc.stop(this._now() + dur + 0.05);
      return { osc, g };
    }

    /* ---------------- конкретные звуки ---------------- */

    footstep(running = false, crouch = false, pan = 0, surface = 'wood') {
      if (!this.enabled) return;
      const vol = crouch ? 0.035 : running ? 0.16 : 0.075;
      const base = surface === 'concrete' ? 1500 : surface === 'tile' ? 2400 : 900;
      this._noise(crouch ? 0.07 : 0.12, {
        vol, type: 'bandpass', freq: base * U.rand(0.85, 1.2), q: 1.2, pan,
        sweepTo: base * 0.4
      });
      if (surface === 'wood' && !crouch && Math.random() < 0.35) {
        this._tone(U.rand(90, 140), 0.12, { vol: vol * 0.6, type: 'triangle', glide: 60, pan });
      }
    }

    doorCreak(open = true, pan = 0) {
      if (!this.enabled) return;
      const dur = U.rand(0.6, 1.1);
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const base = U.rand(140, 260);
      o.frequency.setValueAtTime(base, this._now());
      o.frequency.linearRampToValueAtTime(base * U.rand(1.3, 2.0), this._now() + dur);
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = U.rand(700, 1400); filt.Q.value = 8;
      const g = this._out(pan);
      g.gain.setValueAtTime(0.0001, this._now());
      g.gain.exponentialRampToValueAtTime(0.09, this._now() + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, this._now() + dur);
      o.connect(filt); filt.connect(g);
      o.start(); o.stop(this._now() + dur + 0.05);
      this._noise(0.2, { vol: 0.05, type: 'highpass', freq: 2200, pan });
    }

    doorSlam(pan = 0) {
      this._noise(0.25, { vol: 0.3, type: 'lowpass', freq: 420, pan, sweepTo: 90 });
      this._tone(70, 0.3, { vol: 0.22, type: 'sine', glide: 38, pan });
    }

    lockRattle(pan = 0) {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          this._noise(0.07, { vol: 0.13, type: 'bandpass', freq: 2600, q: 4, pan });
          this._tone(420, 0.06, { vol: 0.07, type: 'square', pan });
        }, i * 90);
      }
    }

    pickup() {
      this._tone(660, 0.1, { vol: 0.12, type: 'triangle', glide: 990 });
      setTimeout(() => this._tone(990, 0.12, { vol: 0.09, type: 'triangle', glide: 1320 }), 70);
    }

    denied() {
      this._tone(180, 0.18, { vol: 0.14, type: 'square', glide: 90 });
    }

    glassBreak(pan = 0) {
      this._noise(0.5, { vol: 0.32, type: 'highpass', freq: 2600, pan, sweepTo: 5200 });
      for (let i = 0; i < 5; i++) {
        setTimeout(() => this._tone(U.rand(1800, 4200), 0.12, { vol: 0.06, type: 'triangle', pan }), i * 55);
      }
    }

    stinger() {
      if (!this.enabled) return;
      this._noise(1.2, { vol: 0.5, type: 'highpass', freq: 1800, sweepTo: 600 });
      this._tone(180, 1.0, { vol: 0.34, type: 'sawtooth', glide: 1400 });
      this._tone(60, 1.4, { vol: 0.4, type: 'square', glide: 1500 });
      setTimeout(() => this._noise(0.9, { vol: 0.35, type: 'lowpass', freq: 900, sweepTo: 120 }), 120);
    }

    growl(pan = 0, vol = 0.2) {
      this._noise(0.85, { vol, type: 'lowpass', freq: 260, q: 3, pan, sweepTo: 150 });
      this._tone(62, 0.8, { vol: vol * 0.8, type: 'sawtooth', glide: 44, pan });
    }

    butcherRoar(pan = 0) {
      this._noise(1.0, { vol: 0.34, type: 'bandpass', freq: 420, q: 2, pan, sweepTo: 180 });
      this._tone(120, 0.9, { vol: 0.26, type: 'sawtooth', glide: 60, pan });
    }

    dollCackle(pan = 0) {
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          this._tone(U.rand(600, 900), 0.07, { vol: 0.1, type: 'square', pan });
        }, i * 85);
      }
    }

    whisper(pan = 0) {
      this._noise(1.3, { vol: 0.08, type: 'bandpass', freq: 1700, q: 6, pan });
    }

    heartbeat(intensity = 1) {
      const v = U.clamp(0.12 + intensity * 0.3, 0, 0.5);
      this._tone(52, 0.18, { vol: v, type: 'sine', glide: 34 });
      setTimeout(() => this._tone(46, 0.22, { vol: v * 0.75, type: 'sine', glide: 30 }), 190);
    }

    breath(pan = 0, vol = 0.1) {
      this._noise(0.55, { vol, type: 'bandpass', freq: 620, q: 1.6, pan, sweepTo: 320 });
    }

    staticBurst(pan = 0) {
      this._noise(0.6, { vol: 0.16, type: 'highpass', freq: 1200, pan });
    }

    slamHit(pan = 0) {
      this._noise(0.2, { vol: 0.3, type: 'lowpass', freq: 600, pan, sweepTo: 120 });
      this._tone(90, 0.25, { vol: 0.2, type: 'square', glide: 45, pan });
    }

    metalClang(pan = 0) {
      this._tone(1180, 0.5, { vol: 0.13, type: 'triangle', pan, detune: 12 });
      this._tone(1570, 0.4, { vol: 0.08, type: 'sine', pan });
      this._noise(0.25, { vol: 0.1, type: 'highpass', freq: 3000, pan });
    }

    /* ---------------- фоновые петли ---------------- */

    startAmbience() {
      if (!this.enabled || this._wind) return;
      /* ветер */
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 380; filt.Q.value = 0.7;
      const g = this.ctx.createGain(); g.gain.value = 0.035;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.022;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start(); lfo.start();
      this._wind = { src, g, filt, lfo };

      /* дрон — «жизнь» дома */
      const dg = this.ctx.createGain(); dg.gain.value = 0.0;
      const dfilt = this.ctx.createBiquadFilter();
      dfilt.type = 'lowpass'; dfilt.frequency.value = 200; dfilt.Q.value = 3;
      dfilt.connect(dg); dg.connect(this.master);
      const oscs = [];
      [[41, 0.6, -7], [61.5, 0.4, 5], [82, 0.22, 0]].forEach(([f, v, d]) => {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
        const og = this.ctx.createGain(); og.gain.value = v;
        o.connect(og); og.connect(dfilt);
        o.start();
        oscs.push(o);
      });
      const dlfo = this.ctx.createOscillator(); dlfo.frequency.value = 0.045;
      const dlfoG = this.ctx.createGain(); dlfoG.gain.value = 90;
      dlfo.connect(dlfoG); dlfoG.connect(dfilt.frequency);
      dlfo.start();
      dg.gain.linearRampToValueAtTime(0.09, this._now() + 6);
      this._drone = { oscs, g: dg, filt: dfilt };
    }

    /* 0..1 — насколько «опасно» сейчас (растёт рядом с монстрами) */
    setIntensity(v) {
      this.intensity = U.clamp(v, 0, 1);
      if (this._drone) {
        const target = 220 + this.intensity * 620;
        this._drone.filt.frequency.setTargetAtTime(target, this._now(), 0.6);
        this._drone.g.gain.setTargetAtTime(0.07 + this.intensity * 0.1, this._now(), 0.8);
      }
    }

    startGenerator() {
      if (!this.enabled || this._generator) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 120; filt.Q.value = 2.4;
      const g = this.ctx.createGain(); g.gain.value = 0.0;
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start();
      g.gain.linearRampToValueAtTime(0.16, this._now() + 1.5);
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = 55;
      const og = this.ctx.createGain(); og.gain.value = 0.05;
      o.connect(og); og.connect(g); o.start();
      this._generator = { src, g, o };
    }
    stopGenerator() {
      if (!this._generator) return;
      try {
        this._generator.g.gain.linearRampToValueAtTime(0.0001, this._now() + 0.6);
        this._generator.src.stop(this._now() + 0.8);
        this._generator.o.stop(this._now() + 0.8);
      } catch (e) { /* ignore */ }
      this._generator = null;
    }

    stopAll() {
      try {
        if (this._wind) { this._wind.src.stop(); this._wind.lfo.stop(); this._wind = null; }
        if (this._drone) { this._drone.oscs.forEach(o => o.stop()); this._drone = null; }
      } catch (e) { /* ignore */ }
      this.stopGenerator();
    }
  }

  global.HG = global.HG || {};
  global.HG.AudioEngine = AudioEngine;
})(window);
