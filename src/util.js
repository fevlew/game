/* =============================================================
 *  util.js — математика, ГПСЧ, мелкие помощники
 *  Проект: «Кошмарный дом» (The Nightmare House)
 * ============================================================= */
(function (global) {
  'use strict';

  const U = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (t) => t * t * (3 - 2 * t);
  U.rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  U.distSq = (ax, az, bx, bz) => {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  };
  U.clamp01 = (v) => U.clamp(v, 0, 1);
  U.lerpAngle = (a, b, t) => a + U.angleDelta(a, b) * t;
  U.smoothAngle = (cur, target, rate) => cur + U.angleDelta(cur, target) * rate;

  U.angleDelta = (a, b) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  /* детерминированный ГПСЧ (mulberry32) */
  U.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.shuffle = function (arr, rnd) {
    const r = rnd || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  U.now = () => performance.now() / 1000;

  U.formatTime = (s) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  };

  /* плавное приближение, независимое от частоты кадров */
  U.damp = (cur, target, lambda, dt) => U.lerp(cur, target, 1 - Math.exp(-lambda * dt));

  U.dampAngle = (cur, target, lambda, dt) =>
    cur + U.angleDelta(cur, target) * (1 - Math.exp(-lambda * dt));

  /* Двоичная куча для A* */
  class MinHeap {
    constructor() { this.items = []; this.keys = []; }
    get size() { return this.items.length; }
    push(item, key) {
      this.items.push(item); this.keys.push(key);
      let i = this.items.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.keys[p] <= this.keys[i]) break;
        this._swap(i, p); i = p;
      }
    }
    pop() {
      const top = this.items[0];
      const li = this.items.length - 1;
      this.items[0] = this.items[li]; this.keys[0] = this.keys[li];
      this.items.pop(); this.keys.pop();
      let i = 0;
      const n = this.items.length;
      while (true) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < n && this.keys[l] < this.keys[s]) s = l;
        if (r < n && this.keys[r] < this.keys[s]) s = r;
        if (s === i) break;
        this._swap(i, s); i = s;
      }
      return top;
    }
    _swap(a, b) {
      const ti = this.items[a]; this.items[a] = this.items[b]; this.items[b] = ti;
      const tk = this.keys[a]; this.keys[a] = this.keys[b]; this.keys[b] = tk;
    }
  }
  U.MinHeap = MinHeap;

  global.HG = global.HG || {};
  global.HG.U = U;
})(window);
