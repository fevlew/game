/* =============================================================
 *  player.js — игрок: движение, камера, фонарь, рассудок,
 *  выносливость, здоровье, укрытия, инвентарь, шум.
 * ============================================================= */
(function (global) {
  'use strict';
  const U = global.HG.U;
  const THREE = global.HG.THREE;

  const RADIUS = 0.34;
  const EYE_STAND = 1.62;
  const EYE_CROUCH = 0.98;
  const SPEED_WALK = 2.55;
  const SPEED_RUN = 4.55;
  const SPEED_CROUCH = 1.15;

  class Player {
    constructor(game) {
      this.game = game;
      this.world = game.world;
      this.camera = game.camera;

      this.pos = new THREE.Vector3();
      this.vel = new THREE.Vector3();
      this.yaw = 0;
      this.pitch = 0;
      this.roll = 0;

      this.health = 100;
      this.maxHealth = 100;
      this.stamina = 100;
      this.maxStamina = 100;
      this.sanity = 100;
      this.maxSanity = 100;
      this.battery = 100;
      this.maxBattery = 100;

      this.crouch = false;
      this.sprinting = false;
      this.moving = false;
      this.eyeHeight = EYE_STAND;

      this.flashlightOn = true;
      this.flashlightEnabled = true;
      this.hasPipe = false;
      this.inventory = Object.create(null);
      this.bottles = 0;

      this.noise = 0;
      this.stepAccum = 0;
      this.bob = 0;
      this.shake = 0;
      this.shakeDecay = 1;
      this.hideSpot = null;
      this.hiding = false;
      this.hideYaw = 0;
      this.breathTimer = 0;
      this.heartTimer = 0;
      this.staminaRegenDelay = 0;
      this.lastDamageTime = -99;
      this.dead = false;
      this.deathReason = '';
      this.hurtFlash = 0;
      this.blinkTimer = 0;
      this.sway = 0;

      /* фонарь */
      this.flash = new THREE.SpotLight(0xfff0d0, 0, 32, 0.46, 0.38, 1.5);
      this.flash.castShadow = true;
      this.flash.shadow.mapSize.set(1024, 1024);
      this.flash.shadow.camera.near = 0.2;
      this.flash.shadow.camera.far = 26;
      this.flash.shadow.bias = -0.0012;
      this.flashTarget = new THREE.Object3D();
      game.scene.add(this.flash, this.flashTarget);
      this.flash.target = this.flashTarget;

      this.spill = new THREE.PointLight(0xffe6bb, 0.0, 5.0, 1.9);
      game.scene.add(this.spill);
    }

    reset(spawn) {
      this.pos.set(spawn.x, spawn.y, spawn.z);
      this.yaw = spawn.yaw; this.pitch = 0;
      this.health = this.maxHealth;
      this.stamina = this.maxStamina;
      this.sanity = this.maxSanity;
      this.battery = this.maxBattery;
      this.crouch = false; this.sprinting = false;
      this.hideSpot = null; this.hiding = false;
      this.hasPipe = false;
      this.inventory = Object.create(null);
      this.bottles = 0;
      this.dead = false;
      this.deathReason = '';
      this.shake = 0;
      this.hurtFlash = 0;
      this.flashlightOn = true;
    }

    /* ------------------------------ ввод ------------------------------ */
    update(dt, input) {
      if (this.dead) return;
      const game = this.game;

      /* открыта записка/замок — игрок не двигается */
      if (game.modalOpen) {
        this.vel.set(0, 0, 0);
        this.moving = false;
        this.noise = 0.02;
        this._updateCamera(dt);
        this._updateBattery(dt);
        return;
      }

      /* --- обзор --- */
      if (!this.hiding && !game.ui.modalOpen) {
        this.yaw -= input.mouseDX * game.settings.sensitivity * 0.0022;
        this.pitch -= input.mouseDY * game.settings.sensitivity * 0.0022;
        this.pitch = U.clamp(this.pitch, -1.45, 1.45);
      } else if (this.hiding) {
        this.yaw -= input.mouseDX * game.settings.sensitivity * 0.0014;
        const rel = U.angleDelta(this.hideYaw, this.yaw);
        this.yaw = this.hideYaw + U.clamp(rel, -1.15, 1.15);
        this.pitch = U.clamp(this.pitch, -0.7, 0.7);
      }

      /* --- укрытие --- */
      if (this.hiding) {
        this.vel.set(0, 0, 0);
        this.noise = 0.03;
        this._updateCamera(dt);
        this._updateSanity(dt);
        this._updateBattery(dt);
        return;
      }

      /* --- движение --- */
      /* камера смотрит в локальную -Z, поэтому «вперёд» = (-sin yaw, 0, -cos yaw) */
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      let wish = new THREE.Vector3();
      if (input.forward) wish.add(forward);
      if (input.back) wish.sub(forward);
      if (input.right) wish.add(right);
      if (input.left) wish.sub(right);
      const wishLen = wish.length();
      if (wishLen > 0) wish.divideScalar(wishLen);

      this.crouch = !!input.crouch;
      this.sprinting = input.sprint && !this.crouch && this.stamina > 3 && wishLen > 0;

      let speed = this.crouch ? SPEED_CROUCH : (this.sprinting ? SPEED_RUN : SPEED_WALK);
      if (this.stamina <= 0.5) speed = Math.min(speed, SPEED_WALK * 0.85);

      const target = wish.multiplyScalar(speed);
      const accel = this.moving ? 14 : 20;
      this.vel.x = U.damp(this.vel.x, target.x, accel, dt);
      this.vel.z = U.damp(this.vel.z, target.z, accel, dt);
      if (Math.abs(this.vel.x) < 0.01) this.vel.x = 0;
      if (Math.abs(this.vel.z) < 0.01) this.vel.z = 0;

      this.moving = Math.hypot(this.vel.x, this.vel.z) > 0.4;

      /* --- выносливость --- */
      if (this.sprinting && this.moving) {
        this.stamina -= dt * 17;
        this.staminaRegenDelay = 1.1;
        if (this.stamina <= 0) { this.stamina = 0; this.sprinting = false; }
      } else {
        this.staminaRegenDelay -= dt;
        if (this.staminaRegenDelay <= 0) this.stamina = Math.min(this.maxStamina, this.stamina + dt * 13);
      }

      /* --- перемещение и столкновения --- */
      this._move(this.vel.x * dt, this.vel.z * dt);

      /* --- вертикаль (лестницы) --- */
      const fy = this.world.floorAt(this.pos.x, this.pos.z);
      this.pos.y = U.damp(this.pos.y, fy, 12, dt);

      /* --- шаги и шум --- */
      const spd = Math.hypot(this.vel.x, this.vel.z);
      this.stepAccum += spd * dt;
      const stepLen = this.crouch ? 1.5 : (this.sprinting ? 1.55 : 1.35);
      if (this.stepAccum > stepLen) {
        this.stepAccum = 0;
        this._footstep();
      }
      const baseNoise = this.crouch ? 0.03 : this.sprinting ? 0.85 : (this.moving ? 0.26 : 0.04);
      this.noise = U.damp(this.noise, baseNoise, 8, dt);

      /* --- дыхание, сердце --- */
      this._updateBreath(dt);
      this._updateSanity(dt);
      this._updateBattery(dt);

      this._updateCamera(dt);
    }

    _move(dx, dz) {
      /* раздельно по осям, чтобы скользить вдоль стен */
      this.pos.x += dx;
      this._resolve('x', dx);
      this.pos.z += dz;
      this._resolve('z', dz);
    }

    _resolve(axis, d) {
      const world = this.world;
      const gx = world.toGridX(this.pos.x), gy = world.toGridY(this.pos.z);
      for (let y = gy - 1; y <= gy + 1; y++) {
        for (let x = gx - 1; x <= gx + 1; x++) {
          if (x < 0 || y < 0 || x >= world.gridW || y >= world.gridH) continue;
          const i = world.idx(x, y);
          const solid = world.solid[i] === 1 || world.blocked[i] === 1;
          if (!solid) continue;
          const minX = x * global.HG.CELL - global.HG.CELL / 2;
          const minZ = y * global.HG.CELL - global.HG.CELL / 2;
          const maxX = minX + 2.4, maxZ = minZ + 2.4;
          const px = this.pos.x, pz = this.pos.z;
          const overlapX = px + RADIUS > minX && px - RADIUS < maxX;
          const overlapZ = pz + RADIUS > minZ && pz - RADIUS < maxZ;
          if (!overlapX || !overlapZ) continue;
          if (axis === 'x') {
            if (d > 0) this.pos.x = minX - RADIUS;
            else if (d < 0) this.pos.x = maxX + RADIUS;
            this.vel.x = 0;
          } else {
            if (d > 0) this.pos.z = minZ - RADIUS;
            else if (d < 0) this.pos.z = maxZ + RADIUS;
            this.vel.z = 0;
          }
        }
      }
    }

    _footstep() {
      const room = this.world.roomAt(this.pos.x, this.pos.z);
      const isBase = this.pos.y < -1.5;
      let surface = 'wood';
      if (isBase) surface = 'concrete';
      else if (room && (room.type === 'bathroom' || room.type === 'kitchen')) surface = 'tile';
      this.game.audio.footstep(this.sprinting, this.crouch, 0, surface);
      const radius = this.crouch ? 2.2 : this.sprinting ? 11 : 5.5;
      this.game.emitNoise(this.pos.x, this.pos.z, radius, 'step', this.sprinting ? 1 : this.crouch ? 0.3 : 0.6);
    }

    _updateBreath(dt) {
      const exertion = this.sprinting ? 1 : (this.stamina < 30 ? 0.6 : 0.15);
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        this.breathTimer = U.lerp(2.6, 0.9, exertion);
        this.game.audio.breath(0, 0.03 + exertion * 0.07);
        if (exertion > 0.5) {
          this.game.emitNoise(this.pos.x, this.pos.z, 4.5, 'breath', 0.5);
        }
      }
      /* сердцебиение */
      const stress = U.clamp((1 - this.health / 100) * 0.6 + (1 - this.sanity / 100) * 0.7 + (this.sprinting ? 0.4 : 0), 0, 1.6);
      if (stress > 0.35) {
        this.heartTimer -= dt * (0.7 + stress);
        if (this.heartTimer <= 0) {
          this.heartTimer = 1.1;
          this.game.audio.heartbeat(stress);
        }
      }
    }

    _updateSanity(dt) {
      const lit = this.game.lightLevelAt(this.pos.x, this.pos.z, this.pos.y);
      const inLight = lit > 0.25;
      let d = 0;
      if (!inLight) d -= 0.9 * (this.flashlightOn ? 0.35 : 1);
      else d += 1.6;
      if (this.hiding) d -= 0.35;
      this.sanity = U.clamp(this.sanity + d * dt, 0, this.maxSanity);

      /* низкий рассудок: галлюцинации */
      if (this.sanity < 35) {
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
          this.blinkTimer = U.rand(6, 18) * (this.sanity / 35);
          this.game.hallucinate(this.sanity);
        }
      }
    }

    _updateBattery(dt) {
      if (!this.flashlightEnabled) { this.flash.intensity = 0; this.spill.intensity = 0; return; }
      if (this.flashlightOn && this.battery > 0) {
        this.battery = Math.max(0, this.battery - dt * 1.35);
        if (this.battery <= 0) this.flashlightOn = false;
      }
      const target = this.flashlightOn ? 72 : 0;
      this.flash.intensity = U.damp(this.flash.intensity, target, 6, dt);
      this.spill.intensity = U.damp(this.spill.intensity, this.flashlightOn ? 2.2 : 0, 6, dt);
      /* мерцание на низком заряде */
      if (this.flashlightOn && this.battery < 22) {
        const n = Math.random();
        if (n < (22 - this.battery) / 60) this.flash.intensity *= 0.25;
      }
    }

    toggleFlashlight() {
      if (!this.flashlightEnabled) return;
      if (this.battery <= 0) { this.game.audio.denied(); return; }
      this.flashlightOn = !this.flashlightOn;
      this.game.audio.staticBurst(0);
    }

    _updateCamera(dt) {
      const cam = this.camera;
      /* eyeHeight — смещение от пола, а не мировая высота:
         иначе в подвале (pos.y = -3.6) камера уходила под пол */
      const targetEye = this.crouch ? EYE_CROUCH : EYE_STAND;
      this.eyeHeight = U.damp(this.eyeHeight, targetEye, 12, dt);

      const spd = Math.hypot(this.vel.x, this.vel.z);
      this.bob += dt * spd * 2.1;
      const bobAmt = this.hiding ? 0 : (this.crouch ? 0.012 : 0.022);
      const bobY = Math.sin(this.bob * 2) * bobAmt * (this.sprinting ? 1.7 : 1);
      const bobX = Math.cos(this.bob) * bobAmt * 0.7;

      /* тряска */
      this.shake = Math.max(0, this.shake - dt * this.shakeDecay);
      const sh = this.shake * this.shake;
      const shX = (Math.random() - 0.5) * sh * 0.35;
      const shY = (Math.random() - 0.5) * sh * 0.35;

      let hx = 0, hy = 0, hz = 0;
      if (this.hiding && this.hideSpot) {
        hx = this.hideSpot.look.x; hy = this.hideSpot.look.y; hz = this.hideSpot.look.z;
      } else {
        hx = this.pos.x; hy = this.pos.y + this.eyeHeight; hz = this.pos.z;
      }
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      cam.position.set(
        hx + right.x * bobX + shX,
        hy + bobY + shY,
        hz + right.z * bobX
      );

      /* крен камеры */
      let targetRoll = 0;
      if (this.sprinting) targetRoll = -0.018;
      if (this.crouch) targetRoll = 0.012;
      if (this.sanity < 40) targetRoll += Math.sin(U.now() * 1.7) * 0.02 * (1 - this.sanity / 40);
      this.roll = U.damp(this.roll, targetRoll, 6, dt);

      cam.rotation.set(0, 0, 0);
      cam.rotation.order = 'YXZ';
      cam.rotation.y = this.yaw;
      cam.rotation.x = this.pitch + (this.hurtFlash > 0 ? -this.hurtFlash * 0.25 : 0);
      cam.rotation.z = this.roll;

      /* матрицы камеры — сразу, чтобы проекция прицела была актуальной */
      cam.updateMatrixWorld();
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();

      /* фонарь следует за камерой */
      this.flash.position.set(cam.position.x, cam.position.y - 0.12, cam.position.z);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      this.flashTarget.position.set(cam.position.x + dir.x * 6, cam.position.y + dir.y * 6, cam.position.z + dir.z * 6);
      this.spill.position.set(cam.position.x, cam.position.y - 0.3, cam.position.z);
    }

    /* --------------------------- взаимодействие --------------------------- */
    enterHide(spot) {
      this.hideSpot = spot;
      this.hiding = true;
      this.hideYaw = this.yaw;
      this.pos.set(spot.enter.x, spot.enter.y, spot.enter.z);
      this.vel.set(0, 0, 0);
      this.game.audio.staticBurst(0);
    }

    exitHide() {
      if (!this.hiding) return;
      const spot = this.hideSpot;
      this.hiding = false;
      this.hideSpot = null;
      if (spot) {
        /* выходим наружу — ищем свободную клетку рядом */
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const nx = spot.x + dx * 1.1, nz = spot.z + dz * 1.1;
          if (!this.world.solidAtWorld(nx, nz)) {
            this.pos.x = nx; this.pos.z = nz;
            break;
          }
        }
        this.pos.y = this.world.floorAt(this.pos.x, this.pos.z);
      }
      this.game.audio.staticBurst(0);
    }

    /* ------------------------------ урон ------------------------------ */
    damage(amount, reason) {
      if (this.dead) return;
      this.health = Math.max(0, this.health - amount);
      this.shake = Math.min(1.4, this.shake + amount * 0.02);
      this.hurtFlash = Math.min(1, this.hurtFlash + amount * 0.02);
      this.lastDamageTime = U.now();
      this.game.audio.slamHit(0);
      this.game.hurtOverlay(amount);
      if (this.health <= 0) this.die(reason);
    }

    die(reason) {
      if (this.dead) return;
      this.dead = true;
      this.deathReason = reason || 'Вы погибли';
      this.game.onPlayerDeath(reason);
    }

    heal(amount) {
      this.health = Math.min(this.maxHealth, this.health + amount);
    }

    addItem(type) {
      this.inventory[type] = (this.inventory[type] || 0) + 1;
      if (type === 'pipe') this.hasPipe = true;
      if (type === 'bottle') this.bottles++;
    }

    countItem(type) { return this.inventory[type] || 0; }

    useMedkit() {
      if (this.countItem('medkit') <= 0) { this.game.audio.denied(); return false; }
      if (this.health >= this.maxHealth - 1) { this.game.audio.denied(); return false; }
      this.inventory.medkit--;
      this.heal(38);
      this.game.audio.pickup();
      this.game.toast('Аптечка применена (+38 здоровья)');
      return true;
    }

    useBattery() {
      if (this.countItem('battery') <= 0) { this.game.audio.denied(); return false; }
      if (this.battery > 92) { this.game.audio.denied(); return false; }
      this.inventory.battery--;
      this.battery = Math.min(this.maxBattery, this.battery + 55);
      this.game.audio.pickup();
      this.game.toast('Батарейка заменена');
      return true;
    }
  }

  global.HG = global.HG || {};
  global.HG.Player = Player;
  global.HG.CELL_HALF = 1.2;
})(window);
