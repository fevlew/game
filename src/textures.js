/* =============================================================
 *  textures.js — процедурные текстуры на canvas.
 *  Ни одного файла: всё рисуется кодом при запуске.
 *  Текстуры почти монохромные — цвет задаётся вершинными цветами,
 *  поэтому один материал работает для десятков оттенков.
 * ============================================================= */
(function (global) {
  'use strict';
  const THREE = global.THREE;

  const SIZE = 512;

  function makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size || SIZE;
    return c;
  }

  /* детерминированный шум, чтобы текстуры не «кипели» между запусками */
  function rngFactory(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function grain(ctx, w, h, amount, alpha) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amount;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
      if (alpha !== undefined) d[i + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
  }

  /* --- штукатурка: пятна, потёки, мелкая крошка --- */
  function plaster() {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const rnd = rngFactory(1337);
    ctx.fillStyle = '#bdb6a8';
    ctx.fillRect(0, 0, SIZE, SIZE);

    /* большие мягкие пятна */
    for (let i = 0; i < 26; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, r = 14 + rnd() * 52;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = rnd() < 0.55;
      g.addColorStop(0, dark ? 'rgba(120,110,96,0.16)' : 'rgba(226,220,206,0.14)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    /* потёки сверху */
    for (let i = 0; i < 9; i++) {
      const x = rnd() * SIZE;
      const w = 2 + rnd() * 7;
      const h = 30 + rnd() * 120;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(90,82,70,0.22)');
      g.addColorStop(1, 'rgba(90,82,70,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, w, h);
    }
    /* мелкие трещины */
    ctx.strokeStyle = 'rgba(70,64,56,0.22)';
    for (let i = 0; i < 14; i++) {
      ctx.lineWidth = 0.6 + rnd();
      ctx.beginPath();
      let x = rnd() * SIZE, y = rnd() * SIZE;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.5) * 26; y += rnd() * 18;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    grain(ctx, SIZE, SIZE, 3);
    return c;
  }

  /* --- деревянные доски пола --- */
  function planks() {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const rnd = rngFactory(90210);
    ctx.fillStyle = '#c8bda8';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const rowH = SIZE / 6;
    for (let r = 0; r < 6; r++) {
      const y = r * rowH;
      const shade = 0.82 + rnd() * 0.3;
      ctx.fillStyle = 'rgba(' + (200 * shade | 0) + ',' + (186 * shade | 0) + ',' + (160 * shade | 0) + ',1)';
      ctx.fillRect(0, y, SIZE, rowH - 1);
      /* волокна — мягкие, без высокочастотной «штриховки» */
      for (let i = 0; i < 4; i++) {
        const gy = y + rnd() * (rowH - 1);
        ctx.strokeStyle = 'rgba(120,100,76,' + (0.03 + rnd() * 0.03) + ')';
        ctx.lineWidth = 1.6 + rnd() * 2.2;
        ctx.beginPath();
        let x = 0;
        ctx.moveTo(0, gy);
        while (x < SIZE) {
          x += 36 + rnd() * 60;
          ctx.lineTo(x, gy + (rnd() - 0.5) * 1.2);
        }
        ctx.stroke();
      }
      /* стык досок */
      ctx.fillStyle = 'rgba(38,30,22,0.55)';
      ctx.fillRect(0, y, SIZE, 1.6);
      /* поперечный стык */
      const seam = rnd() * SIZE;
      ctx.fillStyle = 'rgba(38,30,22,0.22)';
      ctx.fillRect(seam, y, 1.4, rowH - 1);
    }
    grain(ctx, SIZE, SIZE, 3);
    return c;
  }

  /* --- кафель --- */
  function tiles() {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const rnd = rngFactory(4242);
    ctx.fillStyle = '#8b918e';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const n = 4, cellSize = SIZE / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 0.86 + rnd() * 0.26;
        ctx.fillStyle = 'rgb(' + (196 * v | 0) + ',' + (200 * v | 0) + ',' + (194 * v | 0) + ')';
        ctx.fillRect(x * cellSize + 1.6, y * cellSize + 1.6, cellSize - 3.2, cellSize - 3.2);
        /* лёгкий блик */
        const g = ctx.createLinearGradient(x * cellSize, y * cellSize, (x + 1) * cellSize, (y + 1) * cellSize);
        g.addColorStop(0, 'rgba(255,255,255,0.10)');
        g.addColorStop(1, 'rgba(0,0,0,0.05)');
        ctx.fillStyle = g;
        ctx.fillRect(x * cellSize + 1.6, y * cellSize + 1.6, cellSize - 3.2, cellSize - 3.2);
      }
    }
    /* грязь по швам */
    ctx.strokeStyle = 'rgba(60,58,52,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * cellSize, 0); ctx.lineTo(i * cellSize, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cellSize); ctx.lineTo(SIZE, i * cellSize); ctx.stroke();
    }
    grain(ctx, SIZE, SIZE, 5);
    return c;
  }

  /* --- бетон подвала --- */
  function concrete() {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const rnd = rngFactory(777);
    ctx.fillStyle = '#8f9089';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 400; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, r = 0.6 + rnd() * 2.4;
      const dark = rnd() < 0.6;
      ctx.fillStyle = dark ? 'rgba(60,62,58,0.20)' : 'rgba(210,212,204,0.18)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    /* разводы */
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = 'rgba(58,60,56,0.14)';
      ctx.lineWidth = 4 + rnd() * 14;
      ctx.beginPath();
      let x = rnd() * SIZE, y = rnd() * SIZE;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    grain(ctx, SIZE, SIZE, 9);
    return c;
  }

  /* --- дерево мебели --- */
  function wood() {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const rnd = rngFactory(5150);
    ctx.fillStyle = '#c0ab8e';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 90; i++) {
      const y = rnd() * SIZE;
      ctx.strokeStyle = 'rgba(96,74,52,' + (0.05 + rnd() * 0.16) + ')';
      ctx.lineWidth = 0.7 + rnd() * 2.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      let x = 0;
      while (x < SIZE) { x += 16 + rnd() * 34; ctx.lineTo(x, y + (rnd() - 0.5) * 4); }
      ctx.stroke();
    }
    /* сучки */
    for (let i = 0; i < 3; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, r = 3 + rnd() * 5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(70,50,32,0.5)');
      g.addColorStop(1, 'rgba(70,50,32,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    grain(ctx, SIZE, SIZE, 7);
    return c;
  }

  /* --- ткань (мягкая мебель) --- */
  function fabric() {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const rnd = rngFactory(6161);
    ctx.fillStyle = '#b0a8a0';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < SIZE; i += 3) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(i, 0, 1, SIZE);
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(0, i, SIZE, 1);
    }
    for (let i = 0; i < 40; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, r = 6 + rnd() * 20;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(90,84,78,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    grain(ctx, SIZE, SIZE, 10);
    return c;
  }

  /* --- крашеный металл --- */
  function metal() {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const rnd = rngFactory(31337);
    ctx.fillStyle = '#b8bcc0';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 260; i++) {
      const y = rnd() * SIZE;
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(40,44,48,0.07)';
      ctx.lineWidth = 0.6 + rnd() * 1.4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y + (rnd() - 0.5) * 2); ctx.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, r = 3 + rnd() * 12;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(96,68,44,0.22)');
      g.addColorStop(1, 'rgba(96,68,44,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    grain(ctx, SIZE, SIZE, 16);
    return c;
  }

  /* --- обои с полосами (для отдельных комнат) --- */
  function wallpaper() {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const rnd = rngFactory(2718);
    ctx.fillStyle = '#b6ada0';
    ctx.fillRect(0, 0, SIZE, SIZE);
    /* широкие полосы обоев вместо частой «рогожки» */
    for (let x = 0; x < SIZE; x += 128) {
      ctx.fillStyle = 'rgba(126,114,98,0.13)';
      ctx.fillRect(x, 0, 46, SIZE);
      ctx.fillStyle = 'rgba(232,226,212,0.07)';
      ctx.fillRect(x + 62, 0, 8, SIZE);
    }
    /* мелкий ромбовидный узор */
    ctx.fillStyle = 'rgba(110,98,82,0.10)';
    for (let y = 20; y < SIZE; y += 56) {
      for (let x = 32; x < SIZE; x += 56) {
        ctx.beginPath();
        ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y);
        ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y);
        ctx.closePath(); ctx.fill();
      }
    }
    for (let i = 0; i < 18; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, r = 10 + rnd() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(96,86,70,0.13)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    grain(ctx, SIZE, SIZE, 5);
    return c;
  }

  /* текстура — это деталь, а не сам цвет: поднимаем её к белому,
     иначе альбедо перемножается дважды и дом становится чёрным */
  function brighten(canvas, k) {
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, d[i] * k);
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k);
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  const cache = {};

  function toTexture(canvas, repeat) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) t.repeat.set(repeat, repeat);
    return t;
  }

  const GENERATORS = {
    plaster, planks, tiles, concrete, wood, fabric, metal, wallpaper
  };

  function get(name) {
    if (!cache[name]) {
      const gen = GENERATORS[name];
      if (!gen) return null;
      const canvas = brighten(gen(), 1.34);
      cache[name] = toTexture(canvas);
    }
    return cache[name];
  }

  global.HG = global.HG || {};
  global.HG.Textures = { get, names: Object.keys(GENERATORS) };
})(window);
