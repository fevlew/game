/* =============================================================
 *  game.js — ядро: рендер, цикл, цели, взаимодействия, смерть
 * ============================================================= */
(function (global) {
  'use strict';
  const U = global.HG.U;
  const THREE = global.HG.THREE;

  const DIFFICULTIES = {
    granny: {
      label: 'Бабушка', enemies: ['granny'],
      speed: 0.92, hearing: 0.85, desc: 'Только Бабушка. Как в оригинале — ночь длится вечно.'
    },
    nightmare: {
      label: 'Кошмар', enemies: ['granny', 'butcher'],
      speed: 1.0, hearing: 1.0, desc: 'Бабушка и Мясник. Он не видит — он слушает.'
    },
    insanity: {
      label: 'Безумие', enemies: ['granny', 'butcher', 'doll', 'slender'],
      speed: 1.08, hearing: 1.15, desc: 'Все четверо. Дом знает о тебе всё.'
    }
  };

  class Game {
    constructor() {
      this.canvas = document.getElementById('scene');
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.world = null;
      this.nav = null;
      this.player = null;
      this.enemies = [];
      this.audio = new global.HG.AudioEngine();
      this.ui = null;
      this.state = 'menu';
      this.paused = false;
      this.pausedByMenu = false;
      this.modalOpen = false;
      this.time = 0;
      this.playTime = 0;
      this.holdProgress = 0;
      this.currentInteract = null;
      this.danger = 0;
      this.settings = this.loadSettings();
      this.input = {
        forward: false, back: false, left: false, right: false,
        sprint: false, crouch: false, interact: false, interactPressed: false, hidePressed: false,
        mouseDX: 0, mouseDY: 0, mousedown: false, mousePressed: false
      };
      this.keyMap = {};
      this.objectives = [];
      this.pagesFound = 0;
      this.escapeTimer = 0;
      this.grappleTimer = 0;
      this.grappleEnemy = null;
      this.hallucination = null;
      this.fakeGranny = null;
      this._last = performance.now();
      this._initRenderer();
      this._bindInput();
      this.ui = new global.HG.UI(this);
      this.ui.syncSettings();
      this.ui.showScreen('menu');
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    /* ============================ РЕНДЕР ============================ */
    _initRenderer() {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas, antialias: false, powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x03050a);
      this.scene.fog = new THREE.FogExp2(0x05070c, 0.042);

      this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.06, 90);
      this.scene.add(this.camera);

      this.ambient = new THREE.AmbientLight(0x28374e, 0.62);
      this.scene.add(this.ambient);
      this.hemi = new THREE.HemisphereLight(0x33405a, 0x090a0d, 0.35);
      this.scene.add(this.hemi);

      /* пул динамических источников света */
      this.lightPool = [];
      for (let i = 0; i < 5; i++) {
        const l = new THREE.PointLight(0xffd9a0, 0, 14, 1.7);
        this.scene.add(l);
        this.lightPool.push(l);
      }

      window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    applyQuality() {
      const q = this.settings.quality;
      if (q === 'low') {
        this.renderer.setPixelRatio(0.75);
        this.renderer.shadowMap.enabled = false;
        this.scene.fog.density = 0.062;
      } else if (q === 'medium') {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        this.renderer.shadowMap.enabled = false;
        this.scene.fog.density = 0.05;
      } else {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
        this.renderer.shadowMap.enabled = true;
        this.scene.fog.density = 0.042;
      }
      if (this.player) {
        this.player.flash.castShadow = this.renderer.shadowMap.enabled;
      }
      this.renderer.shadowMap.needsUpdate = true;
    }

    /* ============================ НАСТРОЙКИ ============================ */
    loadSettings() {
      const def = { sensitivity: 1.0, volume: 0.75, fov: 78, quality: 'high', difficulty: 'nightmare', invertY: false };
      try {
        const s = JSON.parse(localStorage.getItem('nightmare_house_settings') || '{}');
        return Object.assign(def, s);
      } catch (e) { return def; }
    }
    saveSettings() {
      try { localStorage.setItem('nightmare_house_settings', JSON.stringify(this.settings)); } catch (e) { }
    }

    /* ============================ ВВОД ============================ */
    _bindInput() {
      const canvas = this.canvas;
      const codeMap = {
        KeyW: 'forward', ArrowUp: 'forward',
        KeyS: 'back', ArrowDown: 'back',
        KeyA: 'left', ArrowLeft: 'left',
        KeyD: 'right', ArrowRight: 'right'
      };
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Tab') e.preventDefault();
        if (this.keyMap[e.code]) return;
        this.keyMap[e.code] = true;
        const k = codeMap[e.code];
        if (k) { this.input[k] = true; e.preventDefault(); }
        switch (e.code) {
          case 'ShiftLeft': case 'ShiftRight': this.input.sprint = true; break;
          case 'ControlLeft': case 'KeyC': this.input.crouch = !this.input.crouch; break;
          case 'KeyE': this.input.interact = true; this.input.interactPressed = true; break;
          case 'KeyX': this.input.hidePressed = true; break;
          case 'KeyF': if (this.state === 'playing') this.player.toggleFlashlight(); break;
          case 'KeyH': if (this.state === 'playing') this.player.useMedkit(); break;
          case 'KeyR': if (this.state === 'playing') this.player.useBattery(); break;
          case 'KeyQ': if (this.state === 'playing') this.throwBottle(); break;
          case 'KeyJ': this.toggleJournal(); break;
          case 'Tab': this.ui.showMinimap = true; break;
          case 'Escape': this.onEscape(); break;
        }
      });
      window.addEventListener('keyup', (e) => {
        this.keyMap[e.code] = false;
        const k = codeMap[e.code];
        if (k) this.input[k] = false;
        switch (e.code) {
          case 'ShiftLeft': case 'ShiftRight': this.input.sprint = false; break;
          case 'KeyE': this.input.interact = false; break;
          case 'Tab': this.ui.showMinimap = false; break;
        }
      });
      window.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== canvas) return;
        this.input.mouseDX += e.movementX || 0;
        this.input.mouseDY += e.movementY || 0;
      });
      canvas.addEventListener('mousedown', (e) => {
        if (this.state !== 'playing' || this.modalOpen) return;
        if (document.pointerLockElement !== canvas) { this.requestLock(); return; }
        if (e.button === 0) { this.input.mousedown = true; this.input.mousePressed = true; }
        if (e.button === 2) { if (this.state === 'playing') this.throwBottle(); }
      });
      window.addEventListener('mouseup', (e) => { if (e.button === 0) this.input.mousedown = false; });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('pointerlockchange', () => {
        const locked = document.pointerLockElement === canvas;
        if (locked) { this.pointerLocked = true; return; }
        /* пауза только если захват мыши реально был и его потеряли */
        if (this.pointerLocked && this.state === 'playing' && !this.modalOpen) {
          this.pointerLocked = false;
          this.pause();
        }
      });
      window.addEventListener('wheel', (e) => { if (this.state === 'playing') e.preventDefault(); }, { passive: false });
    }

    requestLock() {
      if (this.canvas.requestPointerLock) {
        const r = this.canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => { });
      }
    }

    onEscape() {
      if (this.state === 'playing') {
        if (this.modalOpen) {
          this.ui.closeNote(); this.ui.closeKeypad();
        } else this.pause();
      } else if (this.state === 'paused') {
        this.resume();
      }
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.paused = true;
      this.pausedByMenu = true;
      document.exitPointerLock && document.exitPointerLock();
      this.ui.showScreen('pause');
      this.ui.el.hud.classList.remove('hidden');
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.paused = false;
      this.pausedByMenu = false;
      this.ui.showScreen(null);
      this.ui.el.hud.classList.remove('hidden');
      this.requestLock();
    }

    toMenu() {
      this.state = 'menu';
      this.paused = true;
      this.ui.showScreen('menu');
      this.ui.closeNote();
      this.ui.closeKeypad();
      document.exitPointerLock && document.exitPointerLock();
      this.audio.stopAll();
    }

    toggleJournal() {
      const box = this.ui.el.objectiveBox;
      box.classList.toggle('collapsed');
    }

    /* подсказка «кликните, чтобы играть» */
    updateLockHint() {
      const el = document.getElementById('lock-hint');
      if (!el) return;
      const need = this.state === 'playing' && !this.modalOpen &&
        document.pointerLockElement !== this.canvas;
      el.classList.toggle('show', need);
    }

    /* ============================ СТАРТ ============================ */
    startGame() {
      const loading = document.getElementById('loading');
      loading.classList.remove('hidden');
      setTimeout(() => {
        try {
          this._buildWorld();
        } catch (err) {
          console.error(err);
          this.ui.toast('Ошибка генерации: ' + err.message);
        }
        loading.classList.add('hidden');
        this.state = 'playing';
        this.paused = false;
        this.modalOpen = false;
        this.ui.showScreen(null);
        this.ui.el.hud.classList.remove('hidden');
        this.ui.closeNote();
        this.ui.closeKeypad();
        this.audio.init();
        this.audio.resume();
        this.audio.setVolume(this.settings.volume);
        this.audio.startAmbience();
        this.requestLock();
        this.ui.toast('Найдите топливо и инструменты. Запустите генератор.');
      }, 40);
    }

    _buildWorld() {
      /* чистим старую сцену */
      if (this.world) {
        this.scene.remove(this.world.group);
        this.world.group.traverse(o => {
          if (o.geometry) o.geometry.dispose();
        });
      }
      for (const e of this.enemies) this.scene.remove(e.group);
      this.enemies = [];
      if (this.fakeGranny) { this.scene.remove(this.fakeGranny); this.fakeGranny = null; }
      if (this.hallucination) this.hallucination = null;

      const diff = DIFFICULTIES[this.settings.difficulty] || DIFFICULTIES.nightmare;
      this.diff = diff;
      this.world = new global.HG.World({ difficulty: this.settings.difficulty });
      this.world.generate();
      this.world.build(this.scene);
      this.nav = new global.HG.Nav(this.world);
      this.player = new global.HG.Player(this);
      this.player.reset(this.world.playerSpawn);
      this.applyQuality();

      this.time = 0;
      this.playTime = 0;
      this.pagesFound = 0;
      this.foundDigits = {};
      this.danger = 0;
      this.holdProgress = 0;
      this.escapeTimer = 0;
      this._setupObjectives();
      this._spawnEnemies(diff);
    }

    _setupObjectives() {
      this.objectives = [
        { id: 'fuel', text: 'Найти канистру топлива (подвал)', done: false },
        { id: 'tools', text: 'Найти набор инструментов', done: false },
        { id: 'power', text: 'Починить и запустить генератор', done: false },
        { id: 'pages', text: 'Найти страницы дневника (0/4) — код выхода', done: false },
        { id: 'escape', text: 'Ввести код на выходной двери', done: false }
      ];
      this.refreshObjectives();
    }

    refreshObjectives() {
      const el = this.ui.el.objectiveList;
      if (!el) return;
      const p0 = this.player;
      const cacheKey = [p0 ? p0.countItem('fuel') : 0, p0 ? p0.countItem('toolkit') : 0,
        this.pagesFound, JSON.stringify(this.foundDigits),
        this.world.powerOn, this.world.exit && this.world.exit.unlocked].join('|');
      if (cacheKey === this._objKey) return;
      this._objKey = cacheKey;
      const p = this.player;
      const fuelOk = p && p.countItem('fuel') > 0;
      const toolsOk = p && p.countItem('toolkit') > 0;
      let html = '';
      for (const o of this.objectives) {
        let done = o.done;
        let text = o.text;
        if (o.id === 'fuel') done = fuelOk || this.world.powerOn;
        if (o.id === 'tools') done = toolsOk || this.world.powerOn;
        if (o.id === 'pages') {
          const code = [];
          for (let i = 0; i < 4; i++) {
            code.push(this.foundDigits[i] !== undefined ? this.foundDigits[i] : '?');
          }
          text = 'Код выхода: ' + code.join(' ') + '   (' + this.pagesFound + '/4 страниц)';
        }
        if (o.id === 'escape') done = this.world.exit && this.world.exit.unlocked;
        html += `<div class="obj ${done ? 'done' : ''}">${done ? '✔' : '•'} ${text}</div>`;
      }
      el.innerHTML = html;
    }

    _spawnEnemies(diff) {
      const types = diff.enemies;
      const w = this.world;
      const spawnFar = (minD, maxD) => {
        for (let i = 0; i < 60; i++) {
          const room = w.rooms[Math.floor(Math.random() * w.rooms.length)];
          const gx = room.ix + Math.floor(Math.random() * room.iw);
          const gy = room.iy + Math.floor(Math.random() * room.ih);
          if (w.type[w.idx(gx, gy)] !== 2) continue;
          const x = w.gridToWorldX(gx), z = w.gridToWorldZ(gy);
          const d = Math.hypot(x - this.world.playerSpawn.x, z - this.world.playerSpawn.z);
          if (d < minD || d > maxD) continue;
          return { x, y: w.floorAt(x, z), z, yaw: Math.random() * 6.28 };
        }
        const room = w.rooms[w.rooms.length - 1];
        return {
          x: w.gridToWorldX(room.ix), y: 0, z: w.gridToWorldZ(room.iy), yaw: 0
        };
      };

      types.forEach((t) => {
        let e = null;
        const spawn = spawnFar(26, 90);
        if (t === 'granny') e = new global.HG.Granny(this, spawn);
        else if (t === 'butcher') e = new global.HG.Butcher(this, spawn);
        else if (t === 'slender') e = new global.HG.Slender(this, spawn);
        else if (t === 'doll') e = new global.HG.Doll(this, spawn);
        if (!e) return;
        e.type = t;
        e.speed *= diff.speed;
        e.chaseSpeed *= diff.speed;
        e.hearingMul *= diff.hearing;
        e.cfg = diff;
        this.enemies.push(e);
      });
    }

    /* ============================ ЦИКЛ ============================ */
    _loop(now) {
      requestAnimationFrame(this._loop);
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.25) dt = 0.25;
      if (dt <= 0) dt = 0.016;

      if (this.state === 'playing' && !this.paused) {
        this.time += dt;
        this.playTime += dt;
        this._updatePlaying(dt);
      } else if (this.state === 'grapple') {
        this._updateGrapple(dt);
      } else if (this.state === 'escaping') {
        this.escapeTimer += dt;
        if (this.escapeTimer > 0.6 || (performance.now() - (this.escapeStart || 0)) > 2400) this._win();
      }

      this.world && this.world.update(this.state === 'playing' ? dt : 0, this.time);
      this._updateLights();
      this.audio.setListener(this.camera.position.x, this.camera.position.z, this.player ? this.player.yaw : 0);
      this.ui.update(dt);
      this.updateLockHint();
      this.renderer.render(this.scene, this.camera);
      this.input.mouseDX = 0; this.input.mouseDY = 0;
      this.input.mousePressed = false;
      this.input.interactPressed = false;
    }

    _updatePlaying(dt) {
      const p = this.player;
      p.update(dt, this.input);
      this.audio.setListener(this.camera.position.x, this.camera.position.z, p.yaw);

      for (const e of this.enemies) {
        if (e.dead) continue;
        e.update(dt);
        if (e.type === 'slender') e.drainSanity(dt);
      }
      this._updateActivation(dt);
      this._updateInteraction(dt);
      this._updateDanger(dt);
      this._updateAudioMix(dt);
      if (this.input.mousePressed) this.swingPipe();
      this.input.mousePressed = false;

      /* урон от темноты? нет — но проверяем «жжение» куклы и т.п. */
      if (p.sanity <= 0.5) {
        p.sanity = 0.5;
      }
      this.refreshObjectives();
    }

    /* монстры появляются постепенно */
    _updateActivation(dt) {
      const list = this.enemies;
      const active = list.filter(e => !e.dead);
      if (active.length <= 1) return;
      /* темп нарастания: чем дольше живёшь, тем больше гостей */
      const t = this.playTime;
      for (const e of active) {
        if (e.activated) continue;
        let activate = true;
        if (e.type === 'slender') activate = t > 75 || this.player.sanity < 58;
        else if (e.type === 'doll') activate = t > 40;
        else if (e.type === 'butcher') activate = t > 25;
        if (activate) {
          e.activated = true;
          /* переместим подальше от игрока */
          const room = this.world.rooms[Math.floor(Math.random() * this.world.rooms.length)];
          const x = this.world.gridToWorldX(room.ix + Math.floor(Math.random() * room.iw));
          const z = this.world.gridToWorldZ(room.iy + Math.floor(Math.random() * room.ih));
          if (!this.world.solidAtWorld(x, z)) {
            e.pos.set(x, this.world.floorAt(x, z), z);
            e.group.position.copy(e.pos);
          }
          if (e.type === 'slender') this.ui.subtitle('Вы почувствовали, что за вами наблюдают...');
          if (e.type === 'doll') this.ui.subtitle('Где-то скрипнул пол.');
          if (e.type === 'butcher') this.ui.subtitle('Кто-то тяжело дышит в соседней комнате.');
        }
      }
    }

    _updateDanger(dt) {
      let d = 0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dist = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z);
        if (e.state === 'chase') d = Math.max(d, U.clamp(1 - dist / 24, 0, 1));
        else if (e.state === 'investigate' || e.state === 'search') d = Math.max(d, U.clamp(1 - dist / 30, 0, 1) * 0.5);
      }
      this.danger = U.damp(this.danger, d, 3, dt);
      if (this.danger > 0.55 && Math.random() < dt * 0.5) {
        this.ui.subtitle('Она рядом.');
      }
    }

    _updateAudioMix(dt) {
      let inten = 0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dist = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z);
        inten = Math.max(inten, U.clamp(1 - dist / 22, 0, 1) * (e.state === 'chase' ? 1 : 0.55));
      }
      inten = Math.max(inten, (100 - this.player.sanity) / 100 * 0.6);
      this.audio.setIntensity(inten);
    }

    /* ============================ ВЗАИМОДЕЙСТВИЕ ============================ */
    _updateInteraction(dt) {
      const p = this.player;
      const it = this.world.findInteractable(this.camera);
      this.currentInteract = it;

      /* в укрытии выйти можно всегда, даже если в кадре нет объектов */
      if (p.hiding) {
        this.ui.el.prompt.textContent = '[E] Выйти из укрытия';
        this.ui.el.prompt.classList.add('show');
        this.ui.el.hold.classList.remove('show');
        this.holdProgress = 0;
        if (this.input.interactPressed || this.input.hidePressed) {
          this.input.hidePressed = false;
          this.input.interactPressed = false;
          p.exitHide();
        }
        return;
      }

      if (!it) {
        this.ui.el.prompt.textContent = '';
        this.ui.el.prompt.classList.remove('show');
        this.ui.el.hold.classList.remove('show');
        this.holdProgress = 0;
        return;
      }
      let label = it.label();
      const openedHide = it.type === 'container' && it.canHide && it.obj.opened;
      if (it.obj.hiddenEnemy) label = 'Открыть шкаф';
      else if (openedHide) label = '[E] Спрятаться в шкафу   ·   [X] Спрятаться';
      else if (it.canHide && it.type === 'container') label += '   ·   [X] Спрятаться';
      this.ui.el.prompt.textContent = label;
      this.ui.el.prompt.classList.add('show');

      /* уже обысканный шкаф: E сразу прячет, а не запускает пустой обыск */
      if (openedHide && (this.input.interactPressed || this.input.hidePressed)) {
        this.input.hidePressed = false;
        this.input.interactPressed = false;
        this.holdProgress = 0;
        this._enterHide(it.obj);
        this.ui.el.prompt.textContent = '';
        this.ui.el.hold.classList.remove('show');
        return;
      }

      if (it.type === 'container') {
        if (this.input.hidePressed && it.canHide) {
          this.input.hidePressed = false;
          this._enterHide(it.obj);
          this.ui.el.prompt.textContent = '';
          this.ui.el.hold.classList.remove('show');
          return;
        }
        if (this.input.interact) {
          this.holdProgress += dt / 1.25;
          this.ui.el.hold.classList.add('show');
          this.ui.el.holdFill.style.width = U.clamp(this.holdProgress, 0, 1) * 100 + '%';
          if (this.holdProgress >= 1) {
            this.holdProgress = 0;
            this._openContainer(it.obj);
          }
        } else {
          this.holdProgress = U.clamp(this.holdProgress - dt * 1.5, 0, 1);
          this.ui.el.holdFill.style.width = this.holdProgress * 100 + '%';
          if (this.holdProgress <= 0) this.ui.el.hold.classList.remove('show');
        }
      } else {
        if (this.input.interactPressed) this._interact(it);
        else if (this.input.hidePressed && it.canHide) { this.input.hidePressed = false; this._enterHide(it.obj); }
      }
      this.input.hidePressed = false;
    }

    _interact(it) {
      const p = this.player;
      switch (it.type) {
        case 'item': this._pickup(it.obj); break;
        case 'hide': this._enterHide(it.obj); break;
        case 'generator': this._useGenerator(); break;
        case 'exit': this._useExit(); break;
        case 'door': this.toggleDoor(it.obj); break;
      }
    }

    _openContainer(c) {
      if (c.opened) { this.ui.toast('Здесь уже пусто.'); return; }
      /* если в шкафу сидит Бабушка — выскакивает */
      if (c.hiddenEnemy) {
        const e = c.hiddenEnemy;
        c.hiddenEnemy = null;
        e.hidden = null;
        e.pos.set(c.x, c.y, c.z);
        e.group.position.copy(e.pos);
        e.setState('chase');
        this.audio.stinger();
        this.grapple(e);
        return;
      }
      const types = this.world.openContainer(c);
      this.audio.doorCreak(true, 0);
      this.emitNoise(c.x, c.z, 7, 'door', 0.55);
      if (!types.length) { this.ui.toast('Ничего интересного.'); return; }
      for (let i = 0; i < types.length; i++) {
        const a = Math.random() * Math.PI * 2;
        const x = c.x + Math.cos(a) * 0.9, z = c.z + Math.sin(a) * 0.9;
        this.world.items.push(this.world._makeItem(types[i], x, this.world.floorAt(x, z) + 0.1, z, {}));
      }
      this.ui.toast('Найдено: ' + types.map(t => global.HG.ITEMS[t].name).join(', '));
    }

    _pickup(item) {
      if (item.taken) return;
      item.taken = true;
      item.mesh.visible = false;
      if (item.glow) item.glow.visible = false;
      const p = this.player;
      p.addItem(item.type);
      this.audio.pickup();
      this.emitNoise(p.pos.x, p.pos.z, 2.5, 'item', 0.15);
      if (item.type === 'page') {
        this.pagesFound++;
        this.foundDigits[item.data.index] = item.data.digit;
        this.ui.subtitle('Ещё одна страница (' + this.pagesFound + '/4).');
        this.ui.toast('Страница дневника: цифра кода — ' + item.data.digit);
        this.ui.showNote('Страница дневника #' + (item.data.index + 1),
          '«...он считает дни, пока я не выйду. Каждая его запись — цифра.\n' +
          'Код двери: цифра с этой страницы — ' + item.data.digit + '.\n' +
          'Он всегда прав. Он никогда не ошибается в числах.»');
        p.sanity = Math.max(0, p.sanity - 6);
      } else if (item.type === 'note') {
        this.ui.showNote(item.data.lore.title, item.data.lore.text);
        p.sanity = Math.max(0, p.sanity - 4);
      } else {
        this.ui.toast('Получено: ' + item.name);
      }
      this.refreshObjectives();
    }

    _enterHide(obj) {
      const spot = this.world.hideSpots.find(s => s.obj === obj);
      if (!spot) return;
      if (!spot) return;
      if (obj.hiddenEnemy) {
        const e = obj.hiddenEnemy;
        obj.hiddenEnemy = null;
        e.hidden = null;
        e.pos.set(spot.x, spot.y, spot.z);
        e.group.position.copy(e.pos);
        e.setState('chase');
        this.audio.stinger();
        this.grapple(e);
        return;
      }
      this.player.enterHide(spot);
      this.ui.subtitle('Тихо. Не двигайся.');
    }

    _useGenerator() {
      const gen = this.world.generator;
      const p = this.player;
      if (!gen || gen.state === 'running') { this.ui.toast('Генератор работает.'); return; }
      if (!this.world.powerOn && p.countItem('fuel') > 0 && p.countItem('toolkit') > 0) {
        p.inventory.fuel--;
        p.inventory.toolkit--;
        gen.state = 'running';
        gen.lamp.material.color.setHex(0x33ff55);
        this.world.powerUp();
        this.audio.startGenerator();
        this.audio.metalClang(0);
        this.emitNoise(gen.x, gen.z, 40, 'generator', 1.0);
        this.ui.toast('Генератор запущен! Свет включился. Но шум привлечёт всех.');
        this.ui.subtitle('Дом проснулся.');
        this.objectives.find(o => o.id === 'power').done = true;
        /* Бабушка услышала */
        for (const e of this.enemies) {
          if (e.type === 'granny' || e.type === 'butcher') {
            e.lastKnown = new THREE.Vector3(gen.x, 0, gen.z);
            e.setState('investigate');
          }
        }
      } else if (p.countItem('fuel') === 0) {
        this.ui.toast('Нужна канистра топлива.');
        this.audio.denied();
      } else if (p.countItem('toolkit') === 0) {
        this.ui.toast('Нужен набор инструментов.');
        this.audio.denied();
      }
    }

    _useExit() {
      const exit = this.world.exit;
      if (exit.unlocked) { this.ui.toast('Дверь открыта. Беги!'); return; }
      if (!this.world.powerOn) {
        this.ui.toast('Замок обесточен. Нужен генератор.');
        this.audio.denied();
        this.ui.subtitle('Лампочка кода не горит.');
        return;
      }
      this.ui.openKeypad();
    }

    submitCode(code) {
      const exit = this.world.exit;
      if (code.length !== 4) { this.audio.denied(); return; }
      if (code === exit.code.join('')) {
        exit.unlocked = true;
        this.ui.closeKeypad();
        this.state = 'escaping';
        this.escapeTimer = 0;
        this.escapeStart = performance.now();
        this.audio.stinger();
        this.audio.stopGenerator();
        document.exitPointerLock && document.exitPointerLock();
      } else {
        this.ui.keypadError();
        this.audio.denied();
        /* неверный код — сигнализация привлекает монстров */
        this.emitNoise(this.player.pos.x, this.player.pos.z, 30, 'alarm', 1.0);
        this.ui.subtitle('Стена вскрикнула. Вас услышали!');
      }
    }

    closeKeypad() {
      this.ui.closeKeypad();
    }

    throwBottle() {
      const p = this.player;
      if (p.bottles <= 0) { this.audio.denied(); this.ui.toast('Нет бутылок.'); return; }
      p.bottles--;
      p.inventory.bottle--;
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const dist = U.rand(6, 10);
      const x = p.pos.x + dir.x * dist, z = p.pos.z + dir.z * dist;
      setTimeout(() => {
        this.audio.glassBreak(0);
        this.emitNoise(x, z, 16, 'bottle', 0.9);
        this.ui.subtitle('Звук разбитого стекла...');
      }, 550);
    }

    swingPipe() {
      const p = this.player;
      if (!p.hasPipe) return;
      this.audio.metalClang(0);
      this.emitNoise(p.pos.x, p.pos.z, 8, 'swing', 0.5);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const origin = this.camera.position.clone();
      let hit = null, hitDist = 2.4;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const to = new THREE.Vector3(e.pos.x - origin.x, (e.pos.y + 1) - origin.y, e.pos.z - origin.z);
        const d = to.length();
        if (d > hitDist) continue;
        to.normalize();
        if (to.dot(dir) < 0.82) continue;
        hit = e; hitDist = d;
      }
      if (hit) {
        hit.onPlayerPipeHit();
        this.ui.subtitle('Удар! ' + hit.name);
        p.shake = Math.min(1, p.shake + 0.3);
      }
    }

    /* ============================ ШУМ ============================ */
    emitNoise(x, z, radius, type, strength) {
      const evt = { x, z, radius, type, strength: strength || 0.6 };
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.hear(evt);
      }
    }

    /* ============================ СВЕТ ============================ */
    _updateLights() {
      if (!this.world) return;
      const p = this.player;
      const pool = this.lightPool;
      const cand = [];
      for (const l of this.world.lights) {
        if (!l.on) continue;
        const d = Math.hypot(l.x - p.pos.x, l.z - p.pos.z);
        if (d > 26) continue;
        cand.push({ l, d });
      }
      cand.sort((a, b) => a.d - b.d);
      for (let i = 0; i < pool.length; i++) {
        const pl = pool[i];
        if (i < cand.length) {
          const l = cand[i].l;
          pl.position.set(l.x, l.y, l.z);
          pl.color.setHex(l.color);
          pl.distance = l.distance;
          const flick = l.current !== undefined ? l.current : l.intensity;
          pl.intensity = flick * 16;
        } else {
          pl.intensity = 0;
        }
      }
    }

    lightLevelAt(x, y, z) {
      let level = 0;
      for (const l of this.world.lights) {
        if (!l.on) continue;
        const d = Math.hypot(l.x - x, l.z - z, (l.y - y) * 0.6);
        if (d > l.distance) continue;
        const v = (1 - d / l.distance) * (l.current !== undefined ? l.current : l.intensity);
        level = Math.max(level, v);
      }
      /* фонарь игрока */
      const p = this.player;
      if (p && p.flashlightOn && Math.hypot(p.pos.x - x, p.pos.z - z) < 2.5) level = Math.max(level, 0.9);
      return U.clamp(level, 0, 1.5);
    }

    dangerLevel() { return this.danger; }

    /* ============================ ГАЛЛЮЦИНАЦИИ ============================ */
    hallucinate(sanity) {
      const p = this.player;
      const chance = Math.random();
      if (chance < 0.45) {
        /* шорох */
        this.audio.doorCreak(true, (Math.random() - 0.5));
        this.ui.subtitle('Где-то открылась дверь...');
      } else if (chance < 0.75) {
        /* чей-то силуэт */
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const a = (Math.random() - 0.5) * 1.2;
        const rot = new THREE.Vector3(dir.x, 0, dir.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        const x = p.pos.x + rot.x * U.rand(3.5, 6), z = p.pos.z + rot.z * U.rand(3.5, 6);
        if (!this.world.solidAtWorld(x, z)) {
          const mb = new global.HG.MeshBuilder();
          mb.cone(0.5, 1.5, 0, 0.75, 0, 0x2a1f24);
          mb.sphere(0.2, 0, 1.6, 0, 0x8a8a80, 10);
          const mesh = mb.build(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
          mesh.position.set(x, this.world.floorAt(x, z), z);
          this.scene.add(mesh);
          this.fakeGranny = mesh;
          setTimeout(() => {
            if (this.fakeGranny === mesh) { this.scene.remove(mesh); this.fakeGranny = null; }
          }, 2200);
          this.audio.whisper(0);
          this.ui.subtitle('Это было... это было?..');
        }
      } else {
        this.audio.footstep(false, false, (Math.random() - 0.5) * 1.2);
        this.ui.subtitle('Шаги? Нет, это сердце.');
      }
    }

    /* ============================ СМЕРТЬ / ПОБЕДА ============================ */
    grapple(enemy) {
      if (this.state !== 'playing') return;
      this.state = 'grapple';
      this.grappleEnemy = enemy;
      this.grappleTimer = 0;
      this.audio.stinger();
      this.audio.growl(0, 0.4);
      document.exitPointerLock && document.exitPointerLock();
    }

    _updateGrapple(dt) {
      this.grappleTimer += dt;
      const e = this.grappleEnemy;
      const cam = this.camera;
      const t = U.clamp(this.grappleTimer / 2.1, 0, 1);
      if (e) {
        /* тянем камеру к врагу */
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const target = cam.position.clone().add(dir.multiplyScalar(U.lerp(2.6, 0.55, t)));
        e.pos.x = U.damp(e.pos.x, target.x, 8, dt);
        e.pos.z = U.damp(e.pos.z, target.z, 8, dt);
        e.pos.y = U.damp(e.pos.y, target.y - 0.6, 8, dt);
        e.group.position.copy(e.pos);
        e.group.rotation.y = Math.atan2(cam.position.x - e.pos.x, cam.position.z - e.pos.z);
        e.group.scale.setScalar(U.lerp(1, 1.5, t));
      }
      cam.position.x += (Math.random() - 0.5) * 0.05 * (1 - t);
      cam.position.y += (Math.random() - 0.5) * 0.05 * (1 - t);
      this.player.shake = 1.2;
      if (this.grappleTimer > 2.3) {
        const reason = e ? ('Вас настиг ' + e.name) : 'Вы погибли';
        this.player.die(reason);
      }
    }

    onPlayerDeath(reason) {
      this.state = 'dead';
      document.exitPointerLock && document.exitPointerLock();
      const el = this.ui.el;
      el.deathReason.textContent = reason || 'Вы погибли';
      el.deathStats.innerHTML = `
        <div>Время в доме: <b>${U.formatTime(this.playTime)}</b></div>
        <div>Страниц найдено: <b>${this.pagesFound}/4</b></div>
        <div>Генератор: <b>${this.world.powerOn ? 'запущен' : 'не запущен'}</b></div>`;
      this.ui.showScreen('death');
      this.ui.el.hud.classList.add('hidden');
      this.audio.stopGenerator();
    }

    _win() {
      this.state = 'won';
      const el = this.ui.el;
      el.victoryStats.innerHTML = `
        <div>Время в доме: <b>${U.formatTime(this.playTime)}</b></div>
        <div>Рассудок: <b>${Math.ceil(this.player.sanity)}%</b></div>
        <div>Здоровье: <b>${Math.ceil(this.player.health)}%</b></div>`;
      this.ui.showScreen('victory');
      this.ui.el.hud.classList.add('hidden');
    }

    /* ============================ ПРОЧЕЕ ============================ */
    /* короткие обёртки для удобства вызовов из игрока/монстров */
    toast(text) { this.ui && this.ui.toast(text); }
    subtitle(text) { this.ui && this.ui.subtitle(text); }
    hurtOverlay(amount) {
      if (this.player) this.player.hurtFlash = Math.min(1, this.player.hurtFlash + amount * 0.02);
    }

    inventoryList() {
      const p = this.player;
      const out = [];
      if (!p) return out;
      const add = (type) => {
        const n = p.countItem(type);
        if (n > 0) out.push({ type, count: n, name: global.HG.ITEMS[type].name, icon: global.HG.ITEMS[type].icon });
      };
      ['toolkit', 'fuel', 'battery', 'medkit', 'bottle', 'pipe'].forEach(add);
      return out;
    }

    randomRoomPoint(x, z) {
      const w = this.world;
      for (let i = 0; i < 40; i++) {
        const room = w.rooms[Math.floor(Math.random() * w.rooms.length)];
        const gx = room.ix + Math.floor(Math.random() * room.iw);
        const gy = room.iy + Math.floor(Math.random() * room.ih);
        const i2 = w.idx(gx, gy);
        if (w.type[i2] !== 2 || w.blocked[i2]) continue;
        return { x: w.gridToWorldX(gx), z: w.gridToWorldZ(gy) };
      }
      return { x, z };
    }

    randomHideSpotNear(x, z, radius, filter) {
      const spots = this.world.hideSpots.filter(s => {
        if (filter && !filter(s)) return false;
        return Math.hypot(s.x - x, s.z - z) < radius;
      });
      if (!spots.length) return null;
      const s = spots[Math.floor(Math.random() * spots.length)];
      if (s.obj && s.obj.hiddenEnemy) return null;
      return s;
    }

    toggleDoor(door) {
      if (door.locked) { this.audio.denied(); this.ui.toast('Заперто.'); return; }
      door.open = !door.open;
      const s = this.audio.spatial(door.x, door.z, 18);
      if (door.open) this.audio.doorCreak(true, s.pan);
      else this.audio.doorSlam(s.pan);
      this.emitNoise(door.x, door.z, door.open ? 6 : 9, 'door', 0.5);
    }

    openDoor(door, byEnemy) {
      if (door.open || door.locked) return;
      door.open = true;
      const s = this.audio.spatial(door.x, door.z, 18);
      this.audio.doorCreak(true, s.pan);
      this.emitNoise(door.x, door.z, 8, 'door', 0.5);
    }

    onEnemySpotted(e) {
      if (e.type === 'granny') {
        this.audio.growl(0, 0.3);
        this.ui.subtitle('Бабушка увидела вас!');
        this.emitNoise(e.pos.x, e.pos.z, 22, 'scream', 1.0);
      } else if (e.type === 'butcher') {
        this.ui.subtitle('Мясник услышал вас!');
      } else if (e.type === 'slender') {
        this.ui.subtitle('Он смотрит прямо на вас.');
      } else if (e.type === 'doll') {
        this.audio.dollCackle(0);
      }
    }
    onEnemyChase() { }
    onEnemyKilled(e) { this.refreshObjectives(); }
    onNoteClosed() { }
  }

  global.HG = global.HG || {};
  global.HG.Game = Game;
  global.HG.DIFFICULTIES = DIFFICULTIES;
})(window);
