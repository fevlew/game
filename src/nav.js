/* =============================================================
 *  nav.js — навигация: сетка проходимости, A*, видимость (LOS)
 *  Все монстры думают через этот модуль: слышат, видят, ищут путь.
 * ============================================================= */
(function (global) {
  'use strict';
  const U = global.HG.U;

  class Nav {
    constructor(world) {
      this.world = world;
      this.w = world.gridW;
      this.h = world.gridH;
    }

    idx(gx, gy) { return gy * this.w + gx; }

    inBounds(gx, gy) { return gx >= 0 && gy >= 0 && gx < this.w && gy < this.h; }

    /* Блокирует ли клетку стена/объект */
    isSolid(gx, gy) {
      if (!this.inBounds(gx, gy)) return true;
      return this.world.solid[this.idx(gx, gy)] === 1;
    }

    /* Проходима ли клетка для перемещения (без учёта дверей) */
    isWalkable(gx, gy) {
      if (!this.inBounds(gx, gy)) return false;
      const i = this.idx(gx, gy);
      return this.world.solid[i] === 0 && this.world.blocked[i] === 0;
    }

    /* Ближайшая проходимая клетка (спиральный поиск) */
    nearestWalkable(gx, gy, maxR = 12) {
      if (this.isWalkable(gx, gy)) return { gx, gy };
      for (let r = 1; r <= maxR; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const nx = gx + dx, ny = gy + dy;
            if (this.isWalkable(nx, ny)) return { gx: nx, gy: ny };
          }
        }
      }
      return null;
    }

    /* Прямая видимость между двумя мировыми точками (DDA по сетке) */
    lineOfSight(ax, az, bx, bz) {
      const w = this.world;
      let gx = w.toGridX(ax), gy = w.toGridY(az);
      const ex = w.toGridX(bx), ey = w.toGridY(bz);
      const dx = Math.abs(ex - gx), dy = Math.abs(ey - gy);
      const sx = gx < ex ? 1 : -1, sy = gy < ey ? 1 : -1;
      let err = dx - dy;
      let guard = 0;
      while (guard++ < 500) {
        if (gx === ex && gy === ey) return true;
        if (!(gx === w.toGridX(ax) && gy === w.toGridY(az))) {
          if (this.isSolid(gx, gy)) {
            /* двери не блокируют обзор */
            const t = w.type[this.idx(gx, gy)];
            if (t !== 3 && t !== 5) return false;
          }
        }
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; gx += sx; }
        else if (e2 < dx) { err += dx; gy += sy; }
      }
      return false;
    }

    /* Поиск пути A* по мировым координатам.
       Возвращает массив точек {x, z} (в мире) либо null. */
    findPath(sx, sz, tx, tz, opts = {}) {
      const w = this.world;
      const allowDoors = opts.allowDoors !== false;
      let s = this.nearestWalkable(w.toGridX(sx), w.toGridY(sz));
      let t = this.nearestWalkable(w.toGridX(tx), w.toGridY(tz));
      if (!s || !t) return null;
      const startI = this.idx(s.gx, s.gy), goalI = this.idx(t.gx, t.gy);
      if (startI === goalI) return [{ x: tx, z: tz }];

      const gScore = new Float32Array(this.w * this.h).fill(Infinity);
      const came = new Int32Array(this.w * this.h).fill(-1);
      const closed = new Uint8Array(this.w * this.h);
      const open = new U.MinHeap();
      gScore[startI] = 0;
      open.push(startI, 0);
      const goalX = t.gx, goalY = t.gy;
      let found = false;
      let guard = 0;

      while (open.size > 0 && guard++ < 20000) {
        const cur = open.pop();
        if (cur === goalI) { found = true; break; }
        if (closed[cur]) continue;
        closed[cur] = 1;
        const cx = cur % this.w, cy = (cur / this.w) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx, ny = cy + dy;
            if (!this.inBounds(nx, ny)) continue;
            const ni = this.idx(nx, ny);
            if (closed[ni]) continue;
            const type = w.type[ni];
            let step;
            if (type === 3) {
              /* дверь: проходима, но закрытая — дороже (и её придётся открыть) */
              const door = w.doorAt(nx, ny);
              const closedDoor = door && !door.open;
              if (closedDoor && !allowDoors) continue;
              step = closedDoor ? 4.0 : 1.0;
            } else if (type === 5) {
              continue;                              /* запертые двери — непроходимы */
            } else if (w.solid[ni] === 1) {
              continue;
            } else if (w.blocked[ni] === 1) {
              step = 2.6;                            /* мебель: обходим с трудом */
            } else {
              step = 1;
            }
            if (dx !== 0 && dy !== 0) {
              /* не режем углы */
              if (w.solid[this.idx(cx + dx, cy)] === 1 || w.solid[this.idx(cx, cy + dy)] === 1) continue;
              step *= 1.414;
            }
            const ng = gScore[cur] + step;
            if (ng < gScore[ni]) {
              gScore[ni] = ng;
              came[ni] = cur;
              const hx = Math.abs(goalX - nx), hy = Math.abs(goalY - ny);
              const hCost = (hx + hy) + (Math.SQRT2 - 2) * Math.min(hx, hy);
              open.push(ni, ng + hCost * 1.05);
            }
          }
        }
      }
      if (!found) {
        /* цель недостижима — идём к ближайшей клетке к цели */
        let best = -1, bestH = Infinity;
        for (let i = 0; i < gScore.length; i++) {
          if (!isFinite(gScore[i])) continue;
          const ix = i % this.w, iy = (i / this.w) | 0;
          const hx = Math.abs(goalX - ix), hy = Math.abs(goalY - iy);
          const h = hx + hy;
          if (h < bestH) { bestH = h; best = i; }
        }
        if (best < 0) return null;
        return this._rebuild(came, best);
      }
      return this._rebuild(came, goalI);
    }

    _rebuild(came, endI) {
      const pts = [];
      let cur = endI;
      let guard = 0;
      while (cur !== -1 && guard++ < 4000) {
        const gx = cur % this.w, gy = (cur / this.w) | 0;
        pts.push({ x: this.world.gridToWorldX(gx), z: this.world.gridToWorldZ(gy) });
        cur = came[cur];
      }
      pts.reverse();
      /* убираем дубли подряд */
      const out = [];
      for (const p of pts) {
        const last = out[out.length - 1];
        if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.z - p.z) > 0.01) out.push(p);
      }
      return out;
    }

    /* Насколько «громко» слышно источник в точке: стены глушат звук */
    soundAttenuation(ax, az, bx, bz) {
      if (this.lineOfSight(ax, az, bx, bz)) return 1;
      return 0.45;
    }
  }

  global.HG = global.HG || {};
  global.HG.Nav = Nav;
})(window);
