/* =============================================================
 *  meshes.js — сборка геометрии из примитивов в один меш.
 *  Позволяет держать сотни объектов при 1 draw call на материал.
 * ============================================================= */
(function (global) {
  'use strict';
  const THREE = global.THREE;

  const _cache = {};
  function cached(key, factory) {
    if (!_cache[key]) _cache[key] = factory();
    return _cache[key];
  }

  const UNIT_BOX = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
  const UNIT_CYL = (seg) => cached('cyl' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1));
  const UNIT_CYL_T = (seg) => cached('cylt' + seg, () => new THREE.CylinderGeometry(0.5, 1, 1, seg, 1));
  const UNIT_SPHERE = (seg) => cached('sph' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1)));

  class MeshBuilder {
    constructor() {
      this.pos = [];
      this.norm = [];
      this.uv = [];
      this.col = [];
      this.idx = [];
      this.stack = [];
      this.t = { x: 0, y: 0, z: 0, ry: 0, rx: 0, rz: 0, s: 1 };
    }

    push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
      this.stack.push(Object.assign({}, this.t));
      this.t = {
        x: this.t.x + x * Math.cos(this.t.ry) + z * Math.sin(this.t.ry),
        y: this.t.y + y,
        z: this.t.z - x * Math.sin(this.t.ry) + z * Math.cos(this.t.ry),
        ry: this.t.ry + ry,
        rx: this.t.rx + rx,
        rz: this.t.rz + rz,
        s: this.t.s * s
      };
      return this;
    }
    pop() { if (this.stack.length) this.t = this.stack.pop(); return this; }

    _xf(x, y, z) {
      const t = this.t;
      let px = x, py = y, pz = z;
      if (t.rx) { const c = Math.cos(t.rx), s = Math.sin(t.rx); const ny = py * c - pz * s, nz = py * s + pz * c; py = ny; pz = nz; }
      if (t.rz) { const c = Math.cos(t.rz), s = Math.sin(t.rz); const nx = px * c - py * s, ny = px * s + py * c; px = nx; py = ny; }
      const c = Math.cos(t.ry), s = Math.sin(t.ry);
      return [
        t.x + px * c + pz * s,
        t.y + py,
        t.z - px * s + pz * c
      ];
    }

    add(geom, x, y, z, color, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
      const g = geom.index ? geom : geom.toNonIndexed();
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      const uvs = g.attributes.uv;
      const base = this.pos.length / 3;
      const c = new THREE.Color(color);
      const crx = Math.cos(rx), srx = Math.sin(rx);
      const cry = Math.cos(ry), sry = Math.sin(ry);
      const crz = Math.cos(rz), srz = Math.sin(rz);
      for (let i = 0; i < pos.count; i++) {
        let vx = pos.getX(i) * sx, vy = pos.getY(i) * sy, vz = pos.getZ(i) * sz;
        if (rx) { const ny = vy * crx - vz * srx, nz = vy * srx + vz * crx; vy = ny; vz = nz; }
        if (rz) { const nx = vx * crz - vy * srz, ny = vx * srz + vy * crz; vx = nx; vy = ny; }
        if (ry) { const nx = vx * cry + vz * sry, nz = -vx * sry + vz * cry; vx = nx; vz = nz; }
        const p = this._xf(vx + x, vy + y, vz + z);
        this.pos.push(p[0], p[1], p[2]);
        if (nor) {
          const n = this._xf(nor.getX(i), nor.getY(i), nor.getZ(i));
          const len = Math.hypot(n[0], n[1], n[2]) || 1;
          this.norm.push(n[0] / len, n[1] / len, n[2] / len);
        } else this.norm.push(0, 1, 0);
        if (uvs) this.uv.push(uvs.getX(i), uvs.getY(i));
        else this.uv.push(0, 0);
        this.col.push(c.r, c.g, c.b);
      }
      if (g.index) {
        const gi = g.index.array;
        for (let i = 0; i < gi.length; i++) this.idx.push(base + gi[i]);
      }
      return this;
    }

    box(w, h, d, x, y, z, color, ry = 0) {
      return this.add(UNIT_BOX(), x, y, z, color, 0, ry, 0, w, h, d);
    }
    cyl(r, h, x, y, z, color, seg = 12, ry = 0) {
      return this.add(UNIT_CYL(seg), x, y, z, color, 0, ry, 0, r, h, r);
    }
    cone(r, h, x, y, z, color, seg = 12) {
      return this.add(UNIT_CYL_T(seg), x, y, z, color, 0, 0, 0, r * 2, h, r * 2);
    }
    sphere(r, x, y, z, color, seg = 12) {
      return this.add(UNIT_SPHERE(seg), x, y, z, color, 0, 0, 0, r, r, r);
    }
    plane(w, d, x, y, z, color, ry = 0, rx = 0) {
      return this.add(cached('plane', () => new THREE.PlaneGeometry(1, 1)), x, y, z, color, rx, ry, 0, w, d, 1);
    }

    isEmpty() { return this.pos.length === 0; }

    build(material, { shadows = true, receive = true } = {}) {
      if (this.isEmpty()) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.setIndex(this.idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, material);
      m.castShadow = shadows;
      m.receiveShadow = receive;
      return m;
    }
  }

  global.HG = global.HG || {};
  global.HG.MeshBuilder = MeshBuilder;
  global.HG.THREE = THREE;
})(window);
