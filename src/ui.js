/* =============================================================
 *  ui.js — HUD, меню, миникарта, записки, кодовый замок
 * ============================================================= */
(function (global) {
  'use strict';
  const U = global.HG.U;

  const $ = (id) => document.getElementById(id);

  class UI {
    constructor(game) {
      this.game = game;
      this.el = {
        hud: $('hud'), menu: $('menu'), pause: $('pause'), death: $('death'),
        victory: $('victory'), note: $('note-overlay'), keypad: $('keypad'),
        settings: $('settings'), help: $('help'), loading: $('loading'),
        prompt: $('prompt'), hold: $('hold'), holdFill: $('hold-fill'),
        objective: $('objective'), objectiveList: $('objective-list'),
        bars: {
          health: $('bar-health'), stamina: $('bar-stamina'),
          sanity: $('bar-sanity'), battery: $('bar-battery')
        },
        vals: {
          health: $('val-health'), stamina: $('val-stamina'),
          sanity: $('val-sanity'), battery: $('val-battery')
        },
        noise: $('noise-ring'), inv: $('inventory'), subs: $('subtitles'),
        minimap: $('minimap'), danger: $('danger'),
        flash: $('flash-overlay'), damage: $('damage-overlay'),
        toastEl: $('toast'), keypadDisplay: $('keypad-display'),
        noteTitle: $('note-title'), noteText: $('note-text'),
        deathReason: $('death-reason'), deathStats: $('death-stats'),
        victoryStats: $('victory-stats'), crosshair: $('crosshair'),
        objectiveBox: $('objective-box')
      };
      this.mmCtx = this.el.minimap.getContext('2d');
      this._makeGrain();
      this.subtitleQueue = [];
      this.subtitleTimer = 0;
      this.toastTimer = 0;
      this.codeBuffer = '';
      this.showMinimap = false;
      this._bind();
    }

    _bind() {
      const g = this.game;
      $('btn-start').addEventListener('click', () => g.startGame());
      $('btn-settings').addEventListener('click', () => this.openPanel('settings'));
      $('btn-help').addEventListener('click', () => this.openPanel('help'));
      $('btn-settings2').addEventListener('click', () => this.openPanel('settings'));
      $('btn-help2').addEventListener('click', () => this.openPanel('help'));
      $('btn-resume').addEventListener('click', () => g.resume());
      $('btn-restart').addEventListener('click', () => g.startGame());
      $('btn-menu').addEventListener('click', () => g.toMenu());
      $('btn-retry').addEventListener('click', () => g.startGame());
      $('btn-deathmenu').addEventListener('click', () => g.toMenu());
      $('btn-again').addEventListener('click', () => g.startGame());
      $('btn-victorymenu').addEventListener('click', () => g.toMenu());
      $('note-close').addEventListener('click', () => this.closeNote());
      $('settings-close').addEventListener('click', () => this.closePanel());
      $('help-close').addEventListener('click', () => this.closePanel());

      /* кодовый замок */
      this.el.keypad.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const k = b.dataset.key;
        if (k === 'del') this.codeBuffer = this.codeBuffer.slice(0, -1);
        else if (k === 'ok') { this.game.submitCode(this.codeBuffer); return; }
        else if (k === 'cancel') { this.game.closeKeypad(); return; }
        else if (this.codeBuffer.length < 4) this.codeBuffer += k;
        this.renderKeypad();
      });

      /* настройки */
      $('set-sens').addEventListener('input', (e) => {
        g.settings.sensitivity = parseFloat(e.target.value);
        $('set-sens-val').textContent = g.settings.sensitivity.toFixed(2);
        g.saveSettings();
      });
      $('set-vol').addEventListener('input', (e) => {
        g.settings.volume = parseFloat(e.target.value);
        $('set-vol-val').textContent = Math.round(g.settings.volume * 100) + '%';
        g.audio.setVolume(g.settings.volume);
        g.saveSettings();
      });
      $('set-fov').addEventListener('input', (e) => {
        g.settings.fov = parseFloat(e.target.value);
        $('set-fov-val').textContent = g.settings.fov + '°';
        g.camera.fov = g.settings.fov;
        g.camera.updateProjectionMatrix();
        g.saveSettings();
      });
      $('set-quality').addEventListener('change', (e) => {
        g.settings.quality = e.target.value;
        g.applyQuality();
        g.saveSettings();
      });
      $('set-diff').addEventListener('change', (e) => {
        g.settings.difficulty = e.target.value;
        g.saveSettings();
      });
      $('set-invert').addEventListener('change', (e) => {
        g.settings.invertY = e.target.checked;
        g.saveSettings();
      });
    }

    /* процедурное «зерно» плёнки для оверлея */
    _makeGrain() {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const el = document.getElementById('grain');
      if (el) el.style.backgroundImage = 'url(' + c.toDataURL() + ')';
    }

    openPanel(name) {
      this.closePanel();
      this.el[name].classList.remove('hidden');
      this.game.paused = true;
      document.exitPointerLock && document.exitPointerLock();
    }
    closePanel() {
      this.el.settings.classList.add('hidden');
      this.el.help.classList.add('hidden');
      if (!this.game.pausedByMenu) this.game.paused = false;
      else this.game.paused = true;
    }

    syncSettings() {
      const s = this.game.settings;
      $('set-sens').value = s.sensitivity;
      $('set-sens-val').textContent = s.sensitivity.toFixed(2);
      $('set-vol').value = s.volume;
      $('set-vol-val').textContent = Math.round(s.volume * 100) + '%';
      $('set-fov').value = s.fov;
      $('set-fov-val').textContent = s.fov + '°';
      $('set-quality').value = s.quality;
      $('set-diff').value = s.difficulty;
      $('set-invert').checked = !!s.invertY;
    }

    /* ------------------------- экраны ------------------------- */
    showScreen(name) {
      for (const k of ['menu', 'pause', 'death', 'victory']) {
        this.el[k].classList.toggle('hidden', k !== name);
      }
      this.el.hud.classList.toggle('hidden', name === 'menu');
    }

    showNote(title, text) {
      this.el.noteTitle.textContent = title;
      this.el.noteText.textContent = text;
      this.el.note.classList.remove('hidden');
      this.game.modalOpen = true;
    }
    closeNote() {
      this.el.note.classList.add('hidden');
      this.game.modalOpen = false;
      this.game.onNoteClosed && this.game.onNoteClosed();
    }

    openKeypad() {
      this.codeBuffer = '';
      this.renderKeypad();
      this.el.keypad.classList.remove('hidden');
      this.game.modalOpen = true;
    }
    closeKeypad() {
      this.el.keypad.classList.add('hidden');
      this.game.modalOpen = false;
    }
    renderKeypad() {
      let s = '';
      for (let i = 0; i < 4; i++) s += (this.codeBuffer[i] || '·');
      this.el.keypadDisplay.textContent = s;
    }
    keypadError() {
      this.el.keypadDisplay.textContent = 'ОТКАЗ';
      this.el.keypadDisplay.classList.add('error');
      setTimeout(() => { this.el.keypadDisplay.classList.remove('error'); this.renderKeypad(); }, 900);
    }

    toast(text) {
      this.el.toastEl.textContent = text;
      this.el.toastEl.classList.add('show');
      this.toastTimer = 3.2;
    }

    subtitle(text) {
      this.subtitleQueue.push(text);
      if (this.subtitleQueue.length > 3) this.subtitleQueue.shift();
    }

    /* ------------------------- апдейт ------------------------- */
    update(dt) {
      const g = this.game, p = g.player;
      if (p) {
        const setBar = (el, v) => { if (el) el.style.width = U.clamp(v, 0, 100) + '%'; };
        setBar(this.el.bars.health, p.health);
        setBar(this.el.bars.stamina, p.stamina);
        setBar(this.el.bars.sanity, p.sanity);
        setBar(this.el.bars.battery, p.battery);
        if (this.el.vals.health) this.el.vals.health.textContent = Math.ceil(p.health);
        if (this.el.vals.stamina) this.el.vals.stamina.textContent = Math.ceil(p.stamina);
        if (this.el.vals.sanity) this.el.vals.sanity.textContent = Math.ceil(p.sanity);
        if (this.el.vals.battery) this.el.vals.battery.textContent = Math.ceil(p.battery);

        /* шум */
        if (this.el.noise) {
          const s = U.clamp(p.noise, 0, 1);
          this.el.noise.style.width = (s * 100) + '%';
          this.el.noise.style.opacity = 0.25 + s * 0.75;
        }
        /* инвентарь */
        this.renderInventory();
        /* опасность */
        const danger = g.dangerLevel();
        if (this.el.danger) {
          this.el.danger.style.opacity = danger;
          this.el.danger.classList.toggle('active', danger > 0.05);
        }
      }

      /* субтитры */
      if (this.subtitleTimer > 0) {
        this.subtitleTimer -= dt;
        if (this.subtitleTimer <= 0) { this.subtitleQueue.shift(); this.subtitleTimer = 2.6; }
      }
      if (this.el.subs) {
        this.el.subs.textContent = this.subtitleQueue[this.subtitleQueue.length - 1] || '';
        this.el.subs.style.opacity = this.subtitleQueue.length ? 1 : 0;
      }

      /* тост */
      if (this.toastTimer > 0) {
        this.toastTimer -= dt;
        if (this.toastTimer <= 0) this.el.toastEl.classList.remove('show');
      }

      /* урон */
      if (this.el.damage) {
        const hp = p ? (1 - p.health / 100) : 0;
        this.el.damage.style.opacity = Math.max(hp * 0.45, p ? p.hurtFlash * 0.5 : 0);
      }

      this.el.minimap.classList.toggle('on', !!this.showMinimap);
      if (this.showMinimap) this.drawMinimap();
    }

    renderInventory() {
      const p = this.game.player;
      if (!p) return;
      const items = this.game.inventoryList();
      const key = items.map(i => i.type + i.count).join('|');
      if (key === this._invKey) return;
      this._invKey = key;
      this.el.inv.innerHTML = items.map(i =>
        `<div class="inv-item" title="${i.name}"><span class="inv-icon">${i.icon}</span><span class="inv-count">${i.count}</span></div>`
      ).join('');
    }

    /* ------------------------- миникарта ------------------------- */
    drawMinimap() {
      const g = this.game, world = g.world;
      const ctx = this.mmCtx;
      const W = this.el.minimap.width, H = this.el.minimap.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(6,8,10,0.92)';
      ctx.fillRect(0, 0, W, H);
      const scale = Math.min(W / world.gridW, H / world.gridH);
      const ox = (W - world.gridW * scale) / 2, oy = (H - world.gridH * scale) / 2;
      const p = g.player;
      const focusX = p ? p.pos.x / world.constructor.CELL : 0;

      /* рисуем комнаты */
      ctx.fillStyle = 'rgba(120,140,150,0.35)';
      for (const r of world.rooms) {
        ctx.fillRect(ox + r.ix * scale, oy + r.iy * scale, r.iw * scale, r.ih * scale);
      }
      /* коридоры */
      ctx.fillStyle = 'rgba(90,105,115,0.28)';
      for (let gy = 0; gy < world.gridH; gy++) {
        for (let gx = 0; gx < world.gridW; gx++) {
          const i = world.idx(gx, gy);
          if (world.type[i] === 2 && world.roomId[i] === -2) {
            ctx.fillRect(ox + gx * scale, oy + gy * scale, scale, scale);
          }
        }
      }
      /* выход */
      if (world.exit) {
        ctx.fillStyle = '#6fe08a';
        ctx.fillRect(ox + world.toGridX(world.exit.x) * scale - 2, oy + world.toGridY(world.exit.z) * scale - 2, 5, 5);
      }
      /* генератор */
      if (world.generator && world.powerOn) {
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(ox + world.toGridX(world.generator.x) * scale - 2, oy + world.toGridY(world.generator.z) * scale - 2, 5, 5);
      }
      /* враги — только если есть питание (камеры наблюдения) */
      if (world.powerOn) {
        for (const e of g.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
          if (d > 26) continue;
          ctx.fillStyle = e.type === 'slender' ? '#b98cff' : e.type === 'doll' ? '#ffd6e0' : '#ff4d4d';
          ctx.beginPath();
          ctx.arc(ox + world.toGridX(e.pos.x) * scale, oy + world.toGridY(e.pos.z) * scale, 3, 0, 6.28);
          ctx.fill();
        }
      }
      /* игрок */
      if (p) {
        const x = ox + world.toGridX(p.pos.x) * scale;
        const y = oy + world.toGridY(p.pos.z) * scale;
        ctx.fillStyle = '#8ef0ff';
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, 6.28);
        ctx.fill();
        ctx.strokeStyle = '#8ef0ff';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(p.yaw) * 9, y + Math.cos(p.yaw) * 9);
        ctx.stroke();
      }
    }
  }

  global.HG = global.HG || {};
  global.HG.UI = UI;
})(window);
