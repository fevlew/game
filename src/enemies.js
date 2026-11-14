/* =============================================================
 *  enemies.js — четыре антагониста с разным «мышлением»
 *
 *   Бабушка   — слышит, ищет, открывает двери, прячется в шкафах
 *   Слендер   — появляется из ниоткуда, крадёт рассудок, замирает
 *               под взглядом, боится света в глаза
 *   Мясник    — слепой, охотится на звук, бьёт с разбегу
 *   Кукла     — движется, только пока на неё не смотрят
 * ============================================================= */
(function (global) {
  'use strict';
  const U = global.HG.U;
  const THREE = global.HG.THREE;
  const MB = global.HG.MeshBuilder;

  const STATE = {
    IDLE: 'idle', PATROL: 'patrol', INVESTIGATE: 'investigate', SEARCH: 'search',
    CHASE: 'chase', ATTACK: 'attack', STUN: 'stun', FLEE: 'flee', AMBUSH: 'ambush',
    PHASE: 'phase', BURN: 'burn'
  };

  /* ------------------------- общая база ------------------------- */
  class Enemy {
    constructor(game, spawn) {
      this.game = game;
      this.world = game.world;
      this.nav = game.nav;
      this.pos = new THREE.Vector3(spawn.x, spawn.y || 0, spawn.z);
      this.yaw = spawn.yaw || 0;
      this.vel = new THREE.Vector3();
      this.radius = 0.4;
      this.state = STATE.PATROL;
      this.stateTime = 0;
      this.alert = 0;
      this.path = null;
      this.pathIdx = 0;
      this.repathTimer = 0;
      this.lastKnown = null;
      this.target = new THREE.Vector3();
      this.speed = 1.3;
      this.chaseSpeed = 3.2;
      this.attackRange = 1.6;
      this.damage = 40;
      this.hearingMul = 1;
      this.canSee = false;
      this.canOpenDoors = true;
      this.phaseThrough = false;
      this.stunned = false;
      this.dead = false;
      this.animPhase = Math.random() * 6.28;
      this.soundTimer = 1 + Math.random() * 3;
      this.footTimer = 0;
      this.doorTarget = null;
      this.doorTimer = 0;
      this.doorOpenTime = 1.3;
      this.lastDamageTime = -99;
      this.group = new THREE.Group();
      this.group.position.copy(this.pos);
      this.parts = {};
      this.buildModel();
      this.game.scene.add(this.group);
    }

    /* ------------------------- модель ------------------------- */
    buildModel() { }

    makeMesh(mb, material) { return mb.build(material); }

    /* ------------------------- восприятие ------------------------- */
    get player() { return this.game.player; }

    distanceToPlayer() {
      const p = this.player;
      if (!p) return Infinity;
      return Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    }

    playerVisible() {
      const p = this.player;
      if (!p || p.dead) return false;
      if (p.hiding) return false;
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.visionRange) return false;
      const ang = Math.atan2(dx, dz);
      const diff = Math.abs(U.angleDelta(this.yaw, ang));
      const inCone = diff < this.fovHalf || dist < 2.2;
      if (!inCone) {
        /* совсем близко — всё равно слышит/чует */
        if (dist > 3.5) return false;
      }
      if (!this.nav.lineOfSight(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) return false;
      /* в темноте хуже видно */
      const lit = this.game.lightLevelAt(p.pos.x, p.pos.z, p.pos.y);
      const range = this.visionRange * (0.35 + lit * 0.65);
      if (dist > range) return false;
      return true;
    }

    playerInFlashlight() {
      const p = this.player;
      if (!p || !p.flashlightOn || p.flash.intensity < 0.5) return false;
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.game.camera.quaternion);
      const to = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
      const d = to.length();
      if (d > 16 || d < 0.01) return false;
      to.normalize();
      const dot = dir.x * to.x + dir.z * to.z;
      return dot > 0.93;
    }

    hear(evt) {
      const d = Math.hypot(evt.x - this.pos.x, evt.z - this.pos.z);
      const range = evt.radius * this.hearingMul;
      if (d > range) return false;
      const atten = this.nav.soundAttenuation(evt.x, evt.z, this.pos.x, this.pos.z);
      const strength = evt.strength * atten * (1 - d / (range + 0.001));
      if (strength < 0.08) return false;
      this.alert = U.clamp(this.alert + strength, 0, 1);
      if (this.alert > 0.25) {
        this.lastKnown = new THREE.Vector3(evt.x, 0, evt.z);
        if (this.state === STATE.PATROL || this.state === STATE.IDLE) {
          this.setState(STATE.INVESTIGATE);
          this.stateTime = 0;
        }
      }
      return true;
    }

    /* ------------------------- состояния ------------------------- */
    setState(s) {
      if (this.state === s) return;
      this.state = s;
      this.stateTime = 0;
      this.repathTimer = 0;
      if (s === STATE.CHASE) this.game.onEnemyChase(this);
    }

    /* ------------------------- движение ------------------------- */
    setPathTo(x, z) {
      const path = this.nav.findPath(this.pos.x, this.pos.z, x, z, { allowDoors: this.canOpenDoors });
      if (path && path.length) {
        this.path = path;
        this.pathIdx = 0;
        return true;
      }
      this.path = null;
      return false;
    }

    followPath(dt, speed) {
      if (!this.path || this.pathIdx >= this.path.length) return false;
      const wp = this.path[this.pathIdx];
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) { this.pathIdx++; return this.pathIdx < this.path.length; }
      const nx = dx / d, nz = dz / d;
      this.yaw = U.dampAngle(this.yaw, Math.atan2(nx, nz), 8, dt);
      this._move(nx * speed * dt, nz * speed * dt);
      return true;
    }

    _move(dx, dz) {
      if (this.phaseThrough) {
        this.pos.x += dx; this.pos.z += dz;
        return;
      }
      const world = this.world;
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
          if (world.solid[i] !== 1 && world.blocked[i] !== 1) continue;
          /* границы клетки строго по сетке — иначе хитбоксы съезжают на полклетки */
          const CELL = global.HG.CELL;
          const minX = x * CELL, minZ = y * CELL;
          const maxX = minX + CELL, maxZ = minZ + CELL;
          const px = this.pos.x, pz = this.pos.z;
          if (!(px + this.radius > minX && px - this.radius < maxX &&
                pz + this.radius > minZ && pz - this.radius < maxZ)) continue;
          if (axis === 'x') {
            if (d > 0) this.pos.x = minX - this.radius;
            else if (d < 0) this.pos.x = maxX + this.radius;
            this.vel.x = 0;
          } else {
            if (d > 0) this.pos.z = minZ - this.radius;
            else if (d < 0) this.pos.z = maxZ + this.radius;
            this.vel.z = 0;
          }
        }
      }
    }

    /* двери: если путь упирается в закрытую дверь — открываем (с задержкой!) */
    handleDoors(dt) {
      if (!this.canOpenDoors) return;
      const gx = this.world.toGridX(this.pos.x), gy = this.world.toGridY(this.pos.z);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const door = this.world.doorAt(gx + dx, gy + dy);
        if (door && !door.open && !door.locked) {
          if (this.doorTarget !== door) { this.doorTarget = door; this.doorTimer = this.doorOpenTime; }
          this.doorTimer -= (dt || 0.016);
          if (this.doorTimer <= 0) {
            this.game.openDoor(door, this);
            this.doorTarget = null;
          }
          return;
        }
      }
      this.doorTarget = null;
    }

    /* ------------------------- апдейт ------------------------- */
    update(dt) {
      if (this.dead) return;
      this.stateTime += dt;
      this.animPhase += dt;
      this.alert = Math.max(0, this.alert - dt * 0.12);
      this.repathTimer -= dt;

      /* закрытая дверь на пути: открываем её (у каждого своя скорость) */
      this.handleDoors(dt);

      this.think(dt);
      this.act(dt);
      this.animate(dt);

      /* вертикаль */
      const fy = this.world.floorAt(this.pos.x, this.pos.z);
      this.pos.y = U.damp(this.pos.y, fy, 10, dt);
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.yaw;

      this.ambientSound(dt);
    }

    think(dt) { }
    act(dt) { }

    animate(dt) {
      const moving = Math.hypot(this.vel.x, this.vel.z) > 0.2;
      const p = this.parts;
      if (p.armL && p.armR) {
        const swing = moving ? Math.sin(this.animPhase * 5.5) * 0.55 : Math.sin(this.animPhase * 1.2) * 0.08;
        p.armL.rotation.x = swing;
        p.armR.rotation.x = -swing;
      }
      if (p.legL && p.legR) {
        const swing = moving ? Math.sin(this.animPhase * 5.5 + Math.PI) * 0.6 : 0;
        p.legL.rotation.x = swing;
        p.legR.rotation.x = -swing;
      }
      if (p.body) {
        p.body.position.y = (p.bodyBaseY || 0) + (moving ? Math.abs(Math.sin(this.animPhase * 5.5)) * 0.05 : 0);
      }
      if (p.head) {
        p.head.rotation.y = Math.sin(this.animPhase * 0.9) * 0.22;
        p.head.rotation.x = Math.sin(this.animPhase * 1.3) * 0.08;
      }
    }

    ambientSound(dt) {
      this.soundTimer -= dt;
      if (this.soundTimer <= 0) {
        this.soundTimer = U.rand(3, 9);
        const d = this.distanceToPlayer();
        if (d < 18) {
          const s = this.game.audio.spatial(this.pos.x, this.pos.z, 20);
          this.soundCue(s);
        }
      }
    }

    soundCue(s) { }

    /* ----------------------- общие воздействия ----------------------- */
    stun(duration) {
      this.stunned = true;
      this.stunTimer = duration;
      this.setState(STATE.STUN);
    }

    onPlayerPipeHit() {
      /* переопределяется в наследниках */
    }

    destroy() {
      this.game.scene.remove(this.group);
      this.dead = true;
    }
  }

  /* =========================== БАБУШКА =========================== */
  class Granny extends Enemy {
    constructor(game, spawn, cfg) {
      super(game, spawn);
      this.name = 'Бабушка';
      this.speed = 1.15;
      this.chaseSpeed = 3.45;
      this.visionRange = 13;
      this.fovHalf = 0.95;
      this.hearingMul = 1.45;
      this.attackRange = 1.55;
      this.damage = 100;
      this.ambushChance = 0.35;
      this.nextCallout = 0;
      this.hitCooldown = 0;
      this.grabTime = 0;
      this.lastKnownTime = 0;
      this.hidden = null;      // шкаф, в котором она сидит
      this.patrolTarget = null;
      this.cfg = cfg || {};
    }

    /* Бабушка слышит шум лучше всех и комментирует его вслух —
       игрок понимает, что его засекли, ещё до погони. */
    hear(evt) {
      const heard = super.hear(evt);
      if (!heard) return false;
      this.lastKnown = new THREE.Vector3(evt.x, 0, evt.z);
      this.lastKnownTime = this.game.time;
      if (this.state !== STATE.CHASE && evt.strength > 0.28 && this.game.time > this.nextCallout) {
        this.nextCallout = this.game.time + 15;
        const pan = this.game.audio.spatial(this.pos.x, this.pos.z, 22).pan;
        this.game.audio.growl(pan, 0.3);
        this.game.ui.subtitle('Бабушка: «Слышу тебя, милок...»');
      }
      return true;
    }

    buildModel() {
      const g = new THREE.Group();
      const skin = new THREE.MeshPhongMaterial({ color: 0xa4927c, shininess: 7 });
      const dress = new THREE.MeshPhongMaterial({ color: 0x3a2c38, shininess: 5 });
      const dress2 = new THREE.MeshPhongMaterial({ color: 0x241a24, shininess: 4 });
      const apron = new THREE.MeshPhongMaterial({ color: 0x776d5f, shininess: 4 });
      const hairM = new THREE.MeshPhongMaterial({ color: 0xb7b5aa, shininess: 2 });
      const dark = new THREE.MeshBasicMaterial({ color: 0x140d0d });
      const white = new THREE.MeshBasicMaterial({ color: 0xd8d3c5 });

      /* юбка-колокол */
      const mbSkirt = new MB();
      mbSkirt.cone(0.19, 1.42, 0, 0.73, 0, 0, 18);
      const bodyPivot = new THREE.Group();
      bodyPivot.rotation.x = 0.13;
      bodyPivot.add(mbSkirt.build(dress));
      const mbHem = new MB();
      mbHem.cyl(0.392, 0.09, 0, 0.06, 0, 0, 18);
      bodyPivot.add(mbHem.build(dress2));
      g.add(bodyPivot);

      /* корпус и фартук */
      const mbTorso = new MB();
      mbTorso.box(0.42, 0.5, 0.27, 0, 1.46, 0, 0);
      bodyPivot.add(mbTorso.build(dress));
      const mbCollar = new MB();
      mbCollar.box(0.48, 0.11, 0.33, 0, 1.73, 0.005, 0);
      bodyPivot.add(mbCollar.build(dress2));
      const mbApron = new MB();
      mbApron.box(0.32, 0.28, 0.05, 0, 0.28, 0.335, 0);
      mbApron.box(0.3, 0.28, 0.05, 0, 0.54, 0.305, 0);
      mbApron.box(0.28, 0.28, 0.05, 0, 0.8, 0.275, 0);
      mbApron.box(0.25, 0.3, 0.05, 0, 1.08, 0.245, 0);
      bodyPivot.add(mbApron.build(apron));

      /* голова */
      const mbHead = new MB();
      mbHead.sphere(0.185, 0, 0, 0, 0, 16);
      mbHead.box(0.22, 0.14, 0.2, 0, -0.125, 0.02, 0);
      mbHead.box(0.06, 0.085, 0.07, 0, -0.02, 0.19, 0);
      mbHead.sphere(0.05, -0.195, -0.01, -0.01, 0, 8);
      mbHead.sphere(0.05, 0.195, -0.01, -0.01, 0, 8);
      const head = mbHead.build(skin);
      const headPivot = new THREE.Group();
      headPivot.position.set(0, 1.84, 0.03);
      headPivot.add(head);
      g.add(headPivot);

      /* седые волосы: шапка, виски, узел */
      const mbHair = new MB();
      mbHair.sphere(0.198, 0, 0.045, -0.02, 0, 16);
      mbHair.sphere(0.1, 0, 0.16, -0.08, 0, 10);
      mbHair.sphere(0.095, -0.13, 0.06, -0.12, 0, 10);
      mbHair.sphere(0.095, 0.13, 0.06, -0.12, 0, 10);
      mbHair.sphere(0.085, 0, 0.13, -0.24, 0, 10);
      headPivot.add(mbHair.build(hairM));

      /* лицо */
      const mbEye = new MB();
      mbEye.sphere(0.045, -0.075, 0.02, 0.165, 0, 10);
      mbEye.sphere(0.045, 0.075, 0.02, 0.165, 0, 10);
      headPivot.add(mbEye.build(white));
      const mbPup = new MB();
      mbPup.sphere(0.021, -0.078, 0.02, 0.196, 0, 8);
      mbPup.sphere(0.021, 0.078, 0.02, 0.196, 0, 8);
      headPivot.add(mbPup.build(dark));
      const mbMouth = new MB();
      mbMouth.box(0.1, 0.022, 0.02, 0, -0.14, 0.185, 0);
      headPivot.add(mbMouth.build(dark));

      /* руки: рукав + предплечье + кисть */
      const mkArm = (side) => {
        const root = new THREE.Group();
        root.position.set(0.33 * side, 1.66, 0.02);
        const tilt = new THREE.Group();
        tilt.rotation.z = -0.2 * side;
        const sl = new MB(); sl.cyl(0.08, 0.34, 0, -0.17, 0, 0, 10);
        const fa = new MB(); fa.cyl(0.055, 0.52, 0, -0.58, 0, 0, 10);
        const hd = new MB(); hd.sphere(0.078, 0, -0.86, 0, 0, 10);
        tilt.add(sl.build(dress), fa.build(skin), hd.build(skin));
        root.add(tilt);
        return root;
      };
      const armL = mkArm(-1), armR = mkArm(1);
      g.add(armL, armR);

      /* бита */
      const mbb = new MB();
      mbb.cyl(0.048, 0.78, 0, -0.34, 0.05, 0, 10);
      mbb.cyl(0.082, 0.34, 0, -0.86, 0.05, 0, 10);
      const bat = mbb.build(new THREE.MeshPhongMaterial({ color: 0x6b4a2c, shininess: 12 }));
      bat.position.set(0, -0.7, 0.05);
      armR.add(bat);

      this.group.add(g);
      this.parts = { body: bodyPivot, head: headPivot, armL, armR, bodyBaseY: 0 };
      this.inner = g;
    }

    think(dt) {
      const p = this.player;
      const sees = this.playerVisible();
      const inBeam = this.playerInFlashlight();
      this.canSee = sees;

      if (sees || inBeam) {
        this.alert = 1;
        this.lastKnown = new THREE.Vector3(p.pos.x, 0, p.pos.z);
        this.lastKnownTime = this.game.time;
        if (this.state !== STATE.CHASE && this.state !== STATE.ATTACK) {
          this.setState(STATE.CHASE);
          this.game.onEnemySpotted(this);
        }
        return;
      }

      if (this.state === STATE.CHASE) {
        /* потеряли из виду — идём к последней точке и ищем */
        if (this.lastKnown) {
          const d = Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z);
          if (d < 1.6) this.setState(STATE.SEARCH);
          else this.setState(STATE.CHASE);
        } else this.setState(STATE.PATROL);
      }
      if (this.state === STATE.SEARCH && this.stateTime > 9) this.setState(STATE.PATROL);
    }

    act(dt) {
      if (this.stunned) {
        this.stunTimer -= dt;
        if (this.stunTimer <= 0) { this.stunned = false; this.setState(STATE.PATROL); }
        this.vel.set(0, 0, 0);
        return;
      }
      const p = this.player;
      const dist = this.distanceToPlayer();

      switch (this.state) {
        case STATE.CHASE: {
          if (dist < this.attackRange) { this.setState(STATE.ATTACK); break; }
          this._goTo(p.pos.x, p.pos.z, this.chaseSpeed, dt);
          break;
        }
        case STATE.ATTACK: {
          this.vel.set(0, 0, 0);
          this.yaw = U.dampAngle(this.yaw, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 10, dt);
          this.hitCooldown -= dt;
          if (this.hitCooldown <= 0 && dist < 2.0) {
            this.hitCooldown = 1.2;
            this.game.grapple(this);
          }
          if (dist > 3.2) this.setState(STATE.CHASE);
          break;
        }
        case STATE.INVESTIGATE:
        case STATE.SEARCH: {
          if (!this.lastKnown) { this.setState(STATE.PATROL); break; }
          const d = Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z);
          if (d < 1.8) {
            /* осматривается */
            this.yaw += dt * 1.4;
            this.vel.set(0, 0, 0);
            if (this.state === STATE.INVESTIGATE) this.setState(STATE.SEARCH);
            /* может спрятаться в шкаф */
            if (this.state === STATE.SEARCH && this.stateTime > 2 && Math.random() < dt * this.ambushChance * 0.5) {
              const spot = this.game.randomHideSpotNear(this.pos.x, this.pos.z, 7, c => c.kind === 'inside');
              if (spot) {
                this.hidden = spot;
                this.hideSpotObj = spot.obj;
                if (spot.obj) spot.obj.hiddenEnemy = this;
                this.pos.set(spot.enter.x, spot.enter.y, spot.enter.z);
                this.group.position.copy(this.pos);
                this.setState(STATE.AMBUSH);
                this.game.audio.doorCreak(true, 0);
              }
            }
          } else {
            this._goTo(this.lastKnown.x, this.lastKnown.z, this.speed * 1.7, dt);
          }
          break;
        }
        case STATE.AMBUSH: {
          this.vel.set(0, 0, 0);
          /* выскакивает, если игрок близко */
          if (dist < 2.6) {
            this.hidden = null;
            if (this.hideSpotObj) this.hideSpotObj.hiddenEnemy = null;
            this.hideSpotObj = null;
            this.setState(STATE.CHASE);
            this.game.onEnemySpotted(this);
          }
          break;
        }
        default: { /* патруль */
          if (!this.patrolTarget || this.repathTimer <= 0) {
            const r = this.game.randomRoomPoint(this.pos.x, this.pos.z);
            this.patrolTarget = r;
            this.repathTimer = 8 + Math.random() * 6;
          }
          const d = this.patrolTarget ? Math.hypot(this.patrolTarget.x - this.pos.x, this.patrolTarget.z - this.pos.z) : 0;
          if (d < 1.2) {
            this.patrolTarget = null;
            this.repathTimer = 0;
          }
          this._goTo(this.patrolTarget ? this.patrolTarget.x : this.pos.x,
                     this.patrolTarget ? this.patrolTarget.z : this.pos.z, this.speed, dt);
        }
      }
    }

    _goTo(x, z, speed, dt) {
      const d = Math.hypot(x - this.pos.x, z - this.pos.z);
      if (d < 1.0) { this.vel.set(0, 0, 0); return; }
      if (!this.path || this.pathIdx >= this.path.length || this.repathTimer <= 0) {
        this.setPathTo(x, z);
        this.repathTimer = this.state === STATE.CHASE ? 0.8 : 2.5;
        if (!this.path) {
          /* нет пути — идём напрямую (упираемся в стены) */
          const nx = (x - this.pos.x) / d, nz = (z - this.pos.z) / d;
          this.yaw = U.dampAngle(this.yaw, Math.atan2(nx, nz), 6, dt);
          this._move(nx * speed * 0.5 * dt, nz * speed * 0.5 * dt);
          this.vel.set(nx * speed, 0, nz * speed);
          return;
        }
      }
      const moved = this.followPath(dt, speed);
      if (moved) {
        const wp = this.path[Math.min(this.pathIdx, this.path.length - 1)];
        this.vel.set(wp.x - this.pos.x, 0, wp.z - this.pos.z);
        this.handleDoors(dt);
      }
    }

    soundCue(s) {
      this.game.audio.growl(s.pan, 0.12 + s.vol * 0.2);
    }

    onPlayerPipeHit() {
      this.stun(2.6);
      this.game.audio.metalClang(0);
      this.game.toast('Бабушка оглушена!');
    }
  }

  /* =========================== СЛЕНДЕР =========================== */
  class Slender extends Enemy {
    constructor(game, spawn, cfg) {
      super(game, spawn);
      this.name = 'Слендер';
      this.speed = 1.7;
      this.chaseSpeed = 3.9;
      this.visionRange = 40;
      this.fovHalf = 1.6;
      this.hearingMul = 0;
      this.attackRange = 1.5;
      this.damage = 100;
      this.phaseThrough = true;
      this.canOpenDoors = false;
      this.teleportTimer = 6;
      this.observedTimer = 0;
      this.fleeTimer = 0;
      this.burnTimer = 0;
      this.cfg = cfg || {};
      this.matHead = new THREE.MeshBasicMaterial({ color: 0xe9e9e9 });
    }

    buildModel() {
      const g = new THREE.Group();
      const suit = new THREE.MeshPhongMaterial({ color: 0x15151b, shininess: 4 });
      const headMat = new THREE.MeshBasicMaterial({ color: 0xe6e6e6 });
      const black = new THREE.MeshBasicMaterial({ color: 0x05050a });
      const tieMat = new THREE.MeshPhongMaterial({ color: 0x6d1018, shininess: 6 });

      /* узкое пальто-силуэт */
      const mb = new MB();
      mb.cone(0.115, 2.32, 0, 1.16, 0, 0, 18);
      mb.box(0.42, 0.16, 0.2, 0, 2.31, 0, 0);
      mb.cyl(0.14, 0.1, 0, 2.02, 0, 0, 12);
      const body = mb.build(suit);
      const bodyPivot = new THREE.Group();
      bodyPivot.add(body);
      g.add(bodyPivot);

      /* галстук */
      const mbc = new MB();
      mbc.box(0.19, 0.14, 0.16, 0, 2.22, 0.015, 0);
      bodyPivot.add(mbc.build(new THREE.MeshPhongMaterial({ color: 0xcac6bb, shininess: 6 })));
      const mbt = new MB();
      mbt.box(0.075, 0.5, 0.03, 0, 1.98, 0.115, 0);
      mbt.box(0.11, 0.09, 0.035, 0, 2.26, 0.11, 0);
      bodyPivot.add(mbt.build(tieMat));

      /* голова */
      const mbh = new MB();
      mbh.sphere(0.185, 0, 0, 0, 0, 16);
      mbh.box(0.2, 0.16, 0.19, 0, -0.16, 0, 0);
      mbh.cyl(0.055, 0.16, 0, -0.14, 0, 0, 10);
      const head = mbh.build(headMat);
      const headPivot = new THREE.Group();
      headPivot.position.set(0, 2.53, 0);
      headPivot.add(head);
      g.add(headPivot);

      /* пустые глазницы — никакой улыбки */
      const mbe = new MB();
      mbe.sphere(0.052, -0.075, 0.025, 0.155, 0, 10);
      mbe.sphere(0.052, 0.075, 0.025, 0.155, 0, 10);
      mbe.sphere(0.026, -0.075, 0.02, 0.195, 0, 8);
      mbe.sphere(0.026, 0.075, 0.02, 0.195, 0, 8);
      headPivot.add(mbe.build(black));

      /* длинные руки */
      const mkArm = (side) => {
        const root = new THREE.Group();
        root.position.set(0.235 * side, 2.24, 0);
        const tilt = new THREE.Group();
        tilt.rotation.z = -0.05 * side;
        const m = new MB();
        m.cyl(0.047, 1.68, 0, -0.84, 0, 0, 8);
        m.sphere(0.06, 0, -1.68, 0, 0, 8);
        tilt.add(m.build(suit));
        root.add(tilt);
        return root;
      };
      const armL = mkArm(-1), armR = mkArm(1);
      g.add(armL, armR);

      this.group.add(g);
      this.parts = { body: bodyPivot, head: headPivot, armL, armR, bodyBaseY: 0 };
      this.inner = g;
      this.matHead = headMat;
    }

    think(dt) {
      const p = this.player;
      if (!p) return;
      const dist = this.distanceToPlayer();

      /* наблюдает ли игрок его? */
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      const ang = Math.atan2(dx, dz);
      const diff = Math.abs(U.angleDelta(p.yaw, ang + Math.PI));
      const observed = diff < 0.55 && dist < 26 &&
        this.nav.lineOfSight(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
      this.observed = observed;

      if (observed) {
        this.observedTimer += dt;
        this.alert = 1;
        this.lastKnown = new THREE.Vector3(p.pos.x, 0, p.pos.z);
      } else {
        this.observedTimer = 0;
      }

      /* свет в глаза — бежит */
      if (this.playerInFlashlight() && dist < 12 && this.fleeTimer <= 0) {
        this.fleeTimer = 14;
        this.setState(STATE.FLEE);
        this.game.audio.stinger();
        this.game.toast('Слендер отшатнулся от света!');
      }

      if (this.fleeTimer > 0) this.fleeTimer -= dt;

      if (this.state !== STATE.FLEE) {
        if (dist < 26 && (observed || this.lastKnown)) this.setState(STATE.CHASE);
        else if (this.state === STATE.CHASE) {
          this.teleportTimer -= dt;
          if (this.teleportTimer <= 0) { this.teleport(); this.teleportTimer = 7 + Math.random() * 5; }
        }
      }
    }

    act(dt) {
      const p = this.player;
      const dist = this.distanceToPlayer();
      if (this.state === STATE.FLEE) {
        /* убегает от игрока */
        const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        this.yaw = U.dampAngle(this.yaw, Math.atan2(dx / d, dz / d), 6, dt);
        this._move(dx / d * this.chaseSpeed * dt, dz / d * this.chaseSpeed * dt);
        this.vel.set(dx / d * this.chaseSpeed, 0, dz / d * this.chaseSpeed);
        if (this.fleeTimer <= 0) this.setState(STATE.CHASE);
        return;
      }
      if (this.state === STATE.CHASE) {
        if (dist < this.attackRange) { this.game.grapple(this); return; }
        /* замирает, если на него смотрят */
        if (this.observed) {
          this.vel.set(0, 0, 0);
          /* но всё равно крадётся по чуть-чуть */
          const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          this.yaw = U.dampAngle(this.yaw, Math.atan2(dx / d, dz / d), 4, dt);
          if (this.observedTimer > 2.5) {
            this._move(dx / d * 0.35 * dt, dz / d * 0.35 * dt);
          }
          return;
        }
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const speed = this.chaseSpeed * (dist > 8 ? 1 : 0.8);
        this.yaw = U.dampAngle(this.yaw, Math.atan2(dx / d, dz / d), 5, dt);
        this._move(dx / d * speed * dt, dz / d * speed * dt);
        this.vel.set(dx / d * speed, 0, dz / d * speed);
        return;
      }
      this.vel.set(0, 0, 0);
    }

    /* телепорт: появляется в тени рядом с игроком */
    teleport() {
      const p = this.player;
      let best = null, bestScore = -1;
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = U.rand(5, 11);
        const x = p.pos.x + Math.cos(a) * r;
        const z = p.pos.z + Math.sin(a) * r;
        if (this.world.solidAtWorld(x, z)) continue;
        /* не прямо перед игроком */
        const ang = Math.atan2(x - p.pos.x, z - p.pos.z);
        const diff = Math.abs(U.angleDelta(p.yaw, ang + Math.PI));
        const score = diff;
        if (score > bestScore) { bestScore = score; best = { x, z }; }
      }
      if (!best) return;
      this.pos.set(best.x, this.world.floorAt(best.x, best.z), best.z);
      this.group.position.copy(this.pos);
      this.game.audio.whisper(0);
      this.game.subtitle('Что-то стало не так...');
    }

    /* урон рассудку */
    drainSanity(dt) {
      const p = this.player;
      const d = this.distanceToPlayer();
      if (d > 15) return 0;
      let rate = (1 - d / 15) * 5.5;
      if (this.observed) rate *= 0.45;
      if (this.state === STATE.FLEE) rate = 0;
      p.sanity = U.clamp(p.sanity - rate * dt, 0, p.maxSanity);
      if (p.sanity < 12 && Math.random() < dt * 0.6) this.game.audio.whisper(0);
    }

    soundCue(s) {
      this.game.audio.whisper(s.pan);
    }
  }

  /* =========================== МЯСНИК =========================== */
  class Butcher extends Enemy {
    constructor(game, spawn, cfg) {
      super(game, spawn);
      this.name = 'Мясник';
      this.speed = 1.5;
      this.chaseSpeed = 4.35;
      this.visionRange = 0;
      this.fovHalf = 0;
      this.hearingMul = 1.9;
      this.attackRange = 2.25;
      this.damage = 42;
      this.canSee = false;
      this.hitCooldown = 0;
      this.deafTimer = 0;
      this.cfg = cfg || {};
    }

    buildModel() {
      const g = new THREE.Group();
      const flesh = new THREE.MeshPhongMaterial({ color: 0x9a7b66, shininess: 6 });
      const apronM = new THREE.MeshPhongMaterial({ color: 0x7d2b23, shininess: 4 });
      const cloth = new THREE.MeshPhongMaterial({ color: 0x2b2724, shininess: 3 });
      const steel = new THREE.MeshPhongMaterial({ color: 0xa6a69f, shininess: 48 });
      const hairM = new THREE.MeshPhongMaterial({ color: 0x191211, shininess: 2 });
      const dark = new THREE.MeshBasicMaterial({ color: 0x0d0a09 });
      const white = new THREE.MeshBasicMaterial({ color: 0xdcd6c8 });
      const red = new THREE.MeshBasicMaterial({ color: 0x6d1512 });

      const bodyPivot = new THREE.Group();
      g.add(bodyPivot);

      /* массивный торс */
      const mbT = new MB();
      mbT.box(0.84, 1.04, 0.5, 0, 1.62, 0, 0);
      mbT.box(0.92, 0.2, 0.54, 0, 2.12, 0, 0);
      mbT.cyl(0.1, 0.22, 0, 2.3, 0, 0, 10);
      bodyPivot.add(mbT.build(flesh));

      /* фартук и ремень */
      const mbA = new MB();
      mbA.box(0.6, 0.84, 0.06, 0, 1.52, 0.27, 0);
      bodyPivot.add(mbA.build(apronM));
      const mbBelt = new MB();
      mbBelt.box(0.88, 0.13, 0.54, 0, 1.14, 0, 0);
      bodyPivot.add(mbBelt.build(cloth));

      /* голова */
      const mbH = new MB();
      mbH.sphere(0.235, 0, 0, 0, 0, 14);
      mbH.box(0.28, 0.16, 0.24, 0, -0.15, 0.02, 0);
      mbH.box(0.05, 0.09, 0.08, 0, -0.02, 0.23, 0);
      const head = mbH.build(flesh);
      const headPivot = new THREE.Group();
      headPivot.position.set(0, 2.48, 0);
      headPivot.add(head);
      g.add(headPivot);

      const mbHair = new MB();
      mbHair.box(0.44, 0.15, 0.42, 0, 0.13, -0.01, 0);
      mbHair.box(0.42, 0.24, 0.13, 0, -0.02, -0.2, 0);
      headPivot.add(mbHair.build(hairM));

      const mbEye = new MB();
      mbEye.box(0.085, 0.035, 0.03, -0.09, 0.03, 0.225, 0);
      mbEye.box(0.085, 0.035, 0.03, 0.09, 0.03, 0.225, 0);
      headPivot.add(mbEye.build(white));
      const mbPup = new MB();
      mbPup.box(0.026, 0.035, 0.02, -0.09, 0.03, 0.24, 0);
      mbPup.box(0.026, 0.035, 0.02, 0.09, 0.03, 0.24, 0);
      headPivot.add(mbPup.build(dark));
      const mbBrow = new MB();
      mbBrow.box(0.11, 0.03, 0.025, -0.09, 0.095, 0.225, 0);
      mbBrow.box(0.11, 0.03, 0.025, 0.09, 0.095, 0.225, 0);
      headPivot.add(mbBrow.build(hairM));
      const mbMouth = new MB();
      mbMouth.box(0.16, 0.035, 0.025, 0, -0.13, 0.215, 0);
      headPivot.add(mbMouth.build(red));

      /* руки */
      const mkArm = (side) => {
        const root = new THREE.Group();
        root.position.set(0.52 * side, 2.06, 0);
        const tilt = new THREE.Group();
        tilt.rotation.z = -0.12 * side;
        const m = new MB();
        m.cyl(0.13, 0.72, 0, -0.36, 0, 0, 10);
        tilt.add(m.build(flesh));
        const h = new MB();
        h.sphere(0.14, 0, -0.78, 0, 0, 10);
        tilt.add(h.build(flesh));
        root.add(tilt);
        return root;
      };
      const armL = mkArm(-1), armR = mkArm(1);
      g.add(armL, armR);

      /* тесак */
      const mbc = new MB();
      mbc.box(0.34, 0.4, 0.035, 0, -0.28, 0.06, 0);
      mbc.box(0.09, 0.28, 0.07, 0, -0.02, 0.02, 0);
      const cleaver = mbc.build(steel);
      cleaver.position.set(0, -0.8, 0.1);
      armR.add(cleaver);

      /* ноги */
      const mkLeg = (side) => {
        const root = new THREE.Group();
        root.position.set(0.24 * side, 1.06, 0);
        const m = new MB();
        m.cyl(0.16, 1.06, 0, -0.53, 0, 0, 10);
        root.add(m.build(cloth));
        const b = new MB();
        b.box(0.26, 0.18, 0.36, 0, -1.0, 0.05, 0);
        root.add(b.build(dark));
        return root;
      };
      const legL = mkLeg(-1), legR = mkLeg(1);
      g.add(legL, legR);

      this.group.add(g);
      this.parts = { body: bodyPivot, head: headPivot, armL, armR, legL, legR, bodyBaseY: 0 };
      this.inner = g;
    }

    think(dt) {
      if (this.deafTimer > 0) { this.deafTimer -= dt; return; }
      if (this.lastKnown) {
        this.setState(STATE.CHASE);
      } else if (this.state === STATE.CHASE) {
        this.setState(STATE.PATROL);
      }
    }

    act(dt) {
      if (this.stunned) {
        this.stunTimer -= dt;
        if (this.stunTimer <= 0) { this.stunned = false; this.setState(STATE.PATROL); }
        this.vel.set(0, 0, 0);
        return;
      }
      const p = this.player;
      const dist = this.distanceToPlayer();
      this.hitCooldown -= dt;

      if (this.state === STATE.CHASE && this.lastKnown) {
        const d = Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z);
        if (d < 1.9) {
          /* бьёт */
          this.vel.set(0, 0, 0);
          this.yaw = U.dampAngle(this.yaw, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 9, dt);
          if (this.hitCooldown <= 0) {
            this.hitCooldown = 1.35;
            this.game.audio.slamHit(0);
            if (dist < 2.6) p.damage(this.damage, 'Мясник догнал вас');
            else p.sanity = Math.max(0, p.sanity - 8);
          }
          if (dist > 4) this.setState(STATE.PATROL);
        } else if (d > 4.5) {
          /* далеко — пробирается по коридорам */
          if (!this.path || this.pathIdx >= this.path.length || this.repathTimer <= 0) {
            this.setPathTo(this.lastKnown.x, this.lastKnown.z);
            this.repathTimer = 1.4;
          }
          const moved = this.followPath(dt, this.chaseSpeed * 0.85);
          if (!moved) {
            const nx = (this.lastKnown.x - this.pos.x) / d, nz = (this.lastKnown.z - this.pos.z) / d;
            this.yaw = U.dampAngle(this.yaw, Math.atan2(nx, nz), 7, dt);
            this._move(nx * this.chaseSpeed * dt, nz * this.chaseSpeed * dt);
          } else {
            const wp = this.path[Math.min(this.pathIdx, this.path.length - 1)];
            this.vel.set(wp.x - this.pos.x, 0, wp.z - this.pos.z);
          }
          this.game.audio.footstep(true, false, 0, 'concrete');
          this.game.emitNoise(this.pos.x, this.pos.z, 7, 'roar', 0.7);
        } else {
          /* несётся по прямой */
          const nx = (this.lastKnown.x - this.pos.x) / d, nz = (this.lastKnown.z - this.pos.z) / d;
          this.yaw = U.dampAngle(this.yaw, Math.atan2(nx, nz), 7, dt);
          this._move(nx * this.chaseSpeed * dt, nz * this.chaseSpeed * dt);
          this.vel.set(nx * this.chaseSpeed, 0, nz * this.chaseSpeed);
          this.game.audio.footstep(true, false, 0, 'concrete');
          this.game.emitNoise(this.pos.x, this.pos.z, 7, 'roar', 0.7);
        }
      } else {
        /* патруль — медленно бродит, прислушиваясь */
        if (!this.path || this.pathIdx >= this.path.length || this.repathTimer <= 0) {
          const r = this.game.randomRoomPoint(this.pos.x, this.pos.z);
          this.setPathTo(r.x, r.z);
          this.repathTimer = 9 + Math.random() * 7;
        }
        const moved = this.followPath(dt, this.speed);
        if (moved) {
          const wp = this.path[Math.min(this.pathIdx, this.path.length - 1)];
          this.vel.set(wp.x - this.pos.x, 0, wp.z - this.pos.z);
        } else this.vel.set(0, 0, 0);
      }
    }

    hear(evt) {
      if (this.deafTimer > 0) return false;
      const heard = super.hear(evt);
      if (heard && evt.strength > 0.25) {
        this.lastKnown = new THREE.Vector3(evt.x, 0, evt.z);
        this.setState(STATE.CHASE);
        if (evt.type === 'step' || evt.type === 'bottle') {
          this.game.audio.butcherRoar(this.game.audio.spatial(this.pos.x, this.pos.z, 25).pan);
        }
      }
      return heard;
    }

    soundCue(s) {
      this.game.audio.butcherRoar(s.pan);
    }

    onPlayerPipeHit() {
      this.stun(3.0);
      this.deafTimer = 9;
      this.game.audio.metalClang(0);
      this.game.toast('Мясник оглушён! Он не слышит.');
    }
  }

  /* =========================== КУКЛА =========================== */
  class Doll extends Enemy {
    constructor(game, spawn, cfg) {
      super(game, spawn);
      this.name = 'Кукла';
      this.speed = 1.0;
      this.chaseSpeed = 3.5;
      this.visionRange = 0;
      this.fovHalf = 0;
      this.hearingMul = 0;
      this.attackRange = 1.35;
      this.damage = 22;
      this.burnTime = 0;
      this.attackCooldown = 0;
      this.cfg = cfg || {};
    }

    buildModel() {
      const g = new THREE.Group();
      const pale = new THREE.MeshPhongMaterial({ color: 0xdad3c7, shininess: 12 });
      const dressM = new THREE.MeshPhongMaterial({ color: 0x8d8478, shininess: 4 });
      const hairM = new THREE.MeshPhongMaterial({ color: 0x2a2320, shininess: 5 });
      const dark = new THREE.MeshBasicMaterial({ color: 0x0b0809 });
      const red = new THREE.MeshBasicMaterial({ color: 0x8a1220 });

      const bodyPivot = new THREE.Group();
      g.add(bodyPivot);

      /* платье-колокол и корпус */
      const mbD = new MB();
      mbD.cone(0.17, 0.56, 0, 0.3, 0, 0, 14);
      bodyPivot.add(mbD.build(dressM));
      const mbT = new MB();
      mbT.box(0.32, 0.42, 0.21, 0, 0.62, 0, 0);
      mbT.box(0.34, 0.08, 0.23, 0, 0.84, 0, 0);
      bodyPivot.add(mbT.build(pale));

      /* голова */
      const mbH = new MB();
      mbH.sphere(0.17, 0, 0, 0, 0, 14);
      mbH.box(0.2, 0.12, 0.17, 0, -0.11, 0.01, 0);
      const head = mbH.build(pale);
      const headPivot = new THREE.Group();
      headPivot.position.set(0, 1.02, 0);
      headPivot.add(head);
      g.add(headPivot);

      const mbHair = new MB();
      mbHair.box(0.3, 0.11, 0.28, 0, 0.13, -0.01, 0);
      mbHair.box(0.3, 0.22, 0.09, 0, 0.0, -0.16, 0);
      mbHair.box(0.07, 0.2, 0.24, -0.17, 0.02, -0.02, 0);
      mbHair.box(0.07, 0.2, 0.24, 0.17, 0.02, -0.02, 0);
      headPivot.add(mbHair.build(hairM));

      /* пустые глазницы с красным огоньком */
      const mbS = new MB();
      mbS.sphere(0.055, -0.062, 0.02, 0.135, 0, 10);
      mbS.sphere(0.055, 0.062, 0.02, 0.135, 0, 10);
      headPivot.add(mbS.build(dark));
      const mbR = new MB();
      mbR.sphere(0.021, -0.062, 0.02, 0.168, 0, 8);
      mbR.sphere(0.021, 0.062, 0.02, 0.168, 0, 8);
      headPivot.add(mbR.build(red));
      const mbM = new MB();
      mbM.box(0.075, 0.022, 0.02, 0, -0.09, 0.15, 0);
      headPivot.add(mbM.build(red));

      /* руки с шарнирами */
      const mkArm = (side) => {
        const root = new THREE.Group();
        root.position.set(0.19 * side, 0.82, 0.02);
        const tilt = new THREE.Group();
        tilt.rotation.z = -0.08 * side;
        const m = new MB();
        m.sphere(0.045, 0, 0, 0, 0, 8);
        m.cyl(0.042, 0.5, 0, -0.26, 0, 0, 8);
        m.sphere(0.055, 0, -0.53, 0, 0, 8);
        tilt.add(m.build(pale));
        root.add(tilt);
        return root;
      };
      const armL = mkArm(-1), armR = mkArm(1);
      g.add(armL, armR);

      /* ноги */
      const mkLeg = (side) => {
        const root = new THREE.Group();
        root.position.set(0.09 * side, 0.32, 0);
        const m = new MB();
        m.cyl(0.05, 0.32, 0, -0.16, 0, 0, 8);
        m.box(0.1, 0.06, 0.18, 0, -0.33, 0.03, 0);
        root.add(m.build(pale));
        return root;
      };
      const legL = mkLeg(-1), legR = mkLeg(1);
      g.add(legL, legR);

      this.group.add(g);
      this.parts = { body: bodyPivot, head: headPivot, armL, armR, legL, legR, bodyBaseY: 0 };
      this.inner = g;
      /* приглушённый свет — чтобы её было видно в темноте */
      const l = new THREE.PointLight(0xbfd8e0, 2.6, 5, 1.8);
      l.position.y = 1.0;
      this.group.add(l);
      this.glow = l;
    }

    think(dt) {
      const p = this.player;
      if (!p) return;
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      /* наблюдает ли игрок куклу? */
      const diff = Math.abs(U.angleDelta(p.yaw, ang + Math.PI));
      const observed = diff < 0.62 && dist < 22 &&
        this.nav.lineOfSight(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
      this.observed = observed;

      /* горит на свету */
      if (this.playerInFlashlight() && dist < 12 && observed) {
        this.burnTime += dt;
        this.glow.intensity = 2.6 + this.burnTime * 3.0;
        if (this.burnTime > 2.2) { this.burn(); return; }
      } else {
        this.burnTime = Math.max(0, this.burnTime - dt * 0.5);
        this.glow.intensity = 2.6;
      }

      if (this.attackCooldown > 0) this.attackCooldown -= dt;
      if (dist < this.attackRange && this.attackCooldown <= 0) {
        this.attackCooldown = 4.5;
        p.damage(this.damage, 'Кукла схватила вас');
        p.sanity = Math.max(0, p.sanity - 16);
        this.game.audio.dollCackle(0);
        this.game.toast('Кукла дотронулась до вас! Она отступила.');
        this.relocate();
        return;
      }
      if (!observed) {
        this.setState(STATE.CHASE);
      } else {
        this.setState(STATE.IDLE);
      }
    }

    act(dt) {
      if (this.state === STATE.CHASE) {
        const p = this.player;
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        this.yaw = U.dampAngle(this.yaw, Math.atan2(dx / d, dz / d), 9, dt);
        this._move(dx / d * this.chaseSpeed * dt, dz / d * this.chaseSpeed * dt);
        this.vel.set(dx / d * this.chaseSpeed, 0, dz / d * this.chaseSpeed);
        /* ползёт */
        if (this.parts.body) this.parts.body.rotation.x = 0.5 + Math.sin(this.animPhase * 8) * 0.08;
        if (this.parts.armL) this.parts.armL.rotation.x = -1.4 + Math.sin(this.animPhase * 9) * 0.5;
        if (this.parts.armR) this.parts.armR.rotation.x = -1.4 - Math.sin(this.animPhase * 9) * 0.5;
      } else {
        this.vel.set(0, 0, 0);
        if (this.parts.body) this.parts.body.rotation.x = U.damp(this.parts.body.rotation.x, 0, 6, dt);
      }
    }

    relocate() {
      const p = this.player;
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = U.rand(6, 14);
        const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
        if (!this.world.solidAtWorld(x, z)) {
          this.pos.set(x, this.world.floorAt(x, z), z);
          this.group.position.copy(this.pos);
          return;
        }
      }
    }

    burn() {
      this.game.audio.stinger();
      this.game.audio.growl(0, 0.3);
      this.game.toast('Кукла сгорела в свете фонаря!');
      this.game.onEnemyKilled(this);
      this.destroy();
    }

    onPlayerPipeHit() {
      this.burn();
    }

    soundCue(s) {
      this.game.audio.dollCackle(s.pan);
    }
  }

  global.HG = global.HG || {};
  global.HG.Enemy = Enemy;
  global.HG.Granny = Granny;
  global.HG.Slender = Slender;
  global.HG.Butcher = Butcher;
  global.HG.Doll = Doll;
  global.HG.STATE = STATE;
})(window);
