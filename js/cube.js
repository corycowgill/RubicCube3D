import * as THREE from 'three';

const FACE_KEYS = ['R', 'L', 'U', 'D', 'F', 'B'];

const FACE_AXIS = {
  R: { axis: new THREE.Vector3(1, 0, 0), layer: 1 },
  L: { axis: new THREE.Vector3(1, 0, 0), layer: -1 },
  U: { axis: new THREE.Vector3(0, 1, 0), layer: 1 },
  D: { axis: new THREE.Vector3(0, 1, 0), layer: -1 },
  F: { axis: new THREE.Vector3(0, 0, 1), layer: 1 },
  B: { axis: new THREE.Vector3(0, 0, 1), layer: -1 },
};

export const COLOR_THEMES = {
  classic: {
    bg: 0x07080f,
    body: 0x111111,
    R: 0xc41e3a, // red
    L: 0xff8c2a, // orange
    U: 0xffffff, // white
    D: 0xffd400, // yellow
    F: 0x009b48, // green
    B: 0x2d6cdf, // blue
  },
  neon: {
    bg: 0x05030a,
    body: 0x07050f,
    R: 0xff2d6f,
    L: 0xff8c2a,
    U: 0xeefff7,
    D: 0xfff200,
    F: 0x2af598,
    B: 0x18a0fb,
  },
  pastel: {
    bg: 0x1a1626,
    body: 0x161221,
    R: 0xff9aa2,
    L: 0xffb692,
    U: 0xfff3b0,
    D: 0xfff5ba,
    F: 0xb5ead7,
    B: 0xc7ceea,
  },
  mono: {
    bg: 0x0a0a0a,
    body: 0x0a0a0a,
    R: 0xeeeeee,
    L: 0xbbbbbb,
    U: 0xffffff,
    D: 0x888888,
    F: 0x555555,
    B: 0x222222,
  },
};

function makeStickerTexture(hexColor) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, size, size);

  const r = 18;
  const m = 8;
  const w = size - m * 2;
  const h = size - m * 2;
  ctx.fillStyle = '#' + hexColor.toString(16).padStart(6, '0');
  ctx.beginPath();
  ctx.moveTo(m + r, m);
  ctx.arcTo(m + w, m, m + w, m + h, r);
  ctx.arcTo(m + w, m + h, m, m + h, r);
  ctx.arcTo(m, m + h, m, m, r);
  ctx.arcTo(m, m, m + w, m, r);
  ctx.closePath();
  ctx.fill();

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class RubiksCube {
  constructor(scene, theme = 'classic') {
    this.scene = scene;
    this.size = 3;
    this.cubieSize = 1;
    this.spacing = 0.04;
    this.step = this.cubieSize + this.spacing;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.cubies = []; // each: { mesh, stickers: { face: mesh } }
    this.theme = theme;
    this.themeData = COLOR_THEMES[theme];
    this.materialsByColor = {};
    this.bodyMaterial = null;

    this.animating = false;
    this.history = []; // { face, dir }  (recorded after a shuffle)
    this.recordHistory = false;
    this.totalMoves = 0;

    this._buildMaterials();
    this._buildCubies();
  }

  _buildMaterials() {
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: this.themeData.body,
      roughness: 0.65,
      metalness: 0.05,
    });
    for (const face of FACE_KEYS) {
      const tex = makeStickerTexture(this.themeData[face]);
      this.materialsByColor[face] = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.4,
        metalness: 0.05,
      });
    }
  }

  _buildCubies() {
    const half = (this.size - 1) / 2;
    const geo = new THREE.BoxGeometry(this.cubieSize, this.cubieSize, this.cubieSize);
    // Slight bevel via vertex push not necessary — body geometry is fine; the stickers float above.
    const stickerGeo = new THREE.PlaneGeometry(this.cubieSize * 0.92, this.cubieSize * 0.92);

    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        for (let z = 0; z < this.size; z++) {
          const mesh = new THREE.Mesh(geo, this.bodyMaterial);
          mesh.position.set((x - half) * this.step, (y - half) * this.step, (z - half) * this.step);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.group.add(mesh);

          const stickers = {};

          // Apply stickers on outer faces only
          if (x === this.size - 1) stickers.R = this._addSticker(mesh, stickerGeo, 'R');
          if (x === 0) stickers.L = this._addSticker(mesh, stickerGeo, 'L');
          if (y === this.size - 1) stickers.U = this._addSticker(mesh, stickerGeo, 'U');
          if (y === 0) stickers.D = this._addSticker(mesh, stickerGeo, 'D');
          if (z === this.size - 1) stickers.F = this._addSticker(mesh, stickerGeo, 'F');
          if (z === 0) stickers.B = this._addSticker(mesh, stickerGeo, 'B');

          this.cubies.push({ mesh, stickers });
        }
      }
    }
  }

  _addSticker(parent, geo, face) {
    const mat = this.materialsByColor[face];
    const sticker = new THREE.Mesh(geo, mat);
    const off = this.cubieSize / 2 + 0.001;
    switch (face) {
      case 'R': sticker.position.set(off, 0, 0); sticker.rotation.y = Math.PI / 2; break;
      case 'L': sticker.position.set(-off, 0, 0); sticker.rotation.y = -Math.PI / 2; break;
      case 'U': sticker.position.set(0, off, 0); sticker.rotation.x = -Math.PI / 2; break;
      case 'D': sticker.position.set(0, -off, 0); sticker.rotation.x = Math.PI / 2; break;
      case 'F': sticker.position.set(0, 0, off); break;
      case 'B': sticker.position.set(0, 0, -off); sticker.rotation.y = Math.PI; break;
    }
    sticker.userData.face = face;
    parent.add(sticker);
    return sticker;
  }

  setTheme(themeName) {
    if (!COLOR_THEMES[themeName]) return;
    this.theme = themeName;
    this.themeData = COLOR_THEMES[themeName];

    this.bodyMaterial.color.setHex(this.themeData.body);
    for (const face of FACE_KEYS) {
      const oldMat = this.materialsByColor[face];
      if (oldMat.map) oldMat.map.dispose();
      const newTex = makeStickerTexture(this.themeData[face]);
      oldMat.map = newTex;
      oldMat.needsUpdate = true;
    }

    if (this.scene.background && this.scene.background.isColor) {
      this.scene.background.setHex(this.themeData.bg);
    }
  }

  // ---------- Slice rotation ----------

  /**
   * Get cubies whose center is on the given layer of an axis.
   * axis: 'x' | 'y' | 'z'
   * layer: -1 | 0 | 1
   */
  _getLayerCubies(axis, layer) {
    const half = (this.size - 1) / 2;
    const target = layer * this.step;
    const eps = this.step * 0.4;
    return this.cubies.filter((c) => {
      const v = c.mesh.position[axis];
      return Math.abs(v - target) < eps;
    });
  }

  /**
   * Rotate a layer with animation.
   * axis: THREE.Vector3 (unit)
   * layer: -1, 0, 1 along the chosen axis
   * angle: target rotation in radians (signed)
   * duration: ms
   */
  rotateLayer(axisVec, layer, angle, duration = 220) {
    if (this.animating) return Promise.resolve(false);
    this.animating = true;

    const axisName = axisVec.x !== 0 ? 'x' : axisVec.y !== 0 ? 'y' : 'z';
    const layerCubies = this._getLayerCubies(axisName, layer);

    const pivot = new THREE.Group();
    this.group.add(pivot);
    for (const c of layerCubies) pivot.attach(c.mesh);

    const start = performance.now();
    const fromAngle = 0;
    const toAngle = angle;

    return new Promise((resolve) => {
      const animate = (now) => {
        const t = Math.min(1, (now - start) / duration);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        const a = fromAngle + (toAngle - fromAngle) * eased;
        pivot.rotation.set(0, 0, 0);
        pivot.rotateOnAxis(axisVec, a);
        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          // Reparent cubies and snap positions
          for (const c of layerCubies) this.group.attach(c.mesh);
          this.group.remove(pivot);
          this._snapCubie(layerCubies);
          this.animating = false;
          resolve(true);
        }
      };
      requestAnimationFrame(animate);
    });
  }

  _snapCubie(cubies) {
    const s = this.step;
    for (const c of cubies) {
      const p = c.mesh.position;
      p.x = Math.round(p.x / s) * s;
      p.y = Math.round(p.y / s) * s;
      p.z = Math.round(p.z / s) * s;

      // Snap rotation to nearest 90deg
      const e = c.mesh.rotation;
      const q = new THREE.Quaternion().setFromEuler(e);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
      // Snap each basis vector
      const snap = (v) => {
        const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
        if (ax >= ay && ax >= az) v.set(Math.sign(v.x), 0, 0);
        else if (ay >= az) v.set(0, Math.sign(v.y), 0);
        else v.set(0, 0, Math.sign(v.z));
        return v;
      };
      const xv = snap(new THREE.Vector3().setFromMatrixColumn(m, 0));
      const yv = snap(new THREE.Vector3().setFromMatrixColumn(m, 1));
      const zv = snap(new THREE.Vector3().setFromMatrixColumn(m, 2));
      const m2 = new THREE.Matrix4().makeBasis(xv, yv, zv);
      c.mesh.quaternion.setFromRotationMatrix(m2);
    }
  }

  // ---------- High-level moves ----------

  /**
   * Apply a move by face name and direction.
   * face: 'R','L','U','D','F','B'
   * dir: +1 (CW looking at face) or -1 (CCW)
   */
  async move(face, dir = 1, duration = 220) {
    const def = FACE_AXIS[face];
    if (!def) return false;
    const sign = (face === 'L' || face === 'D' || face === 'B') ? -1 : 1;
    const angle = sign * dir * (Math.PI / 2);
    const ok = await this.rotateLayer(def.axis, def.layer, angle, duration);
    if (ok) {
      this.totalMoves++;
      if (this.recordHistory) this.history.push({ face, dir });
    }
    return ok;
  }

  async undo() {
    if (this.animating || !this.history.length) return false;
    const last = this.history.pop();
    // Apply inverse without recording
    const wasRecording = this.recordHistory;
    this.recordHistory = false;
    await this.move(last.face, -last.dir);
    this.recordHistory = wasRecording;
    return true;
  }

  async shuffle(count = 25, onMove = null) {
    if (this.animating) return;
    this.history = [];
    this.recordHistory = false;
    let lastFace = null;
    for (let i = 0; i < count; i++) {
      let face;
      do {
        face = FACE_KEYS[Math.floor(Math.random() * FACE_KEYS.length)];
      } while (face === lastFace);
      lastFace = face;
      const dir = Math.random() < 0.5 ? -1 : 1;
      await this.move(face, dir, 90);
      if (onMove) onMove(i + 1, count);
    }
    this.totalMoves = 0;
    this.recordHistory = true;
  }

  reset() {
    if (this.animating) return;
    // Remove existing
    for (const c of this.cubies) {
      this.group.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    this.cubies = [];
    this.history = [];
    this.totalMoves = 0;
    this.recordHistory = false;
    this._buildCubies();
  }

  isSolved() {
    // For each external face, check that all stickers face a consistent world direction
    // and share the same color (face key). We grouped stickers under their cubie meshes
    // with the userData.face indicating the original color. After rotations we need to
    // determine the world-direction each sticker now points.
    const faceVectors = {
      R: new THREE.Vector3(1, 0, 0),
      L: new THREE.Vector3(-1, 0, 0),
      U: new THREE.Vector3(0, 1, 0),
      D: new THREE.Vector3(0, -1, 0),
      F: new THREE.Vector3(0, 0, 1),
      B: new THREE.Vector3(0, 0, -1),
    };

    // For each face direction, gather all stickers whose world-normal points that way.
    const stickersByDir = { R: [], L: [], U: [], D: [], F: [], B: [] };
    const tmpQ = new THREE.Quaternion();
    const tmpV = new THREE.Vector3();

    for (const c of this.cubies) {
      c.mesh.getWorldQuaternion(tmpQ);
      for (const face of Object.keys(c.stickers)) {
        // Sticker original local normal:
        // For our planes: F/B -> (0,0,±1), R/L -> (±1,0,0), U/D -> (0,±1,0)
        const localNormal = faceVectors[face].clone();
        const worldNormal = localNormal.applyQuaternion(tmpQ);
        // Find dominant axis
        const dir = this._dominantDir(worldNormal);
        if (!dir) return false;
        stickersByDir[dir].push(face);
      }
    }
    for (const dir of Object.keys(stickersByDir)) {
      const arr = stickersByDir[dir];
      if (arr.length === 0) continue;
      const first = arr[0];
      for (const f of arr) if (f !== first) return false;
    }
    return true;
  }

  _dominantDir(v) {
    const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
    if (ax > ay && ax > az) return v.x > 0 ? 'R' : 'L';
    if (ay > ax && ay > az) return v.y > 0 ? 'U' : 'D';
    if (az > ax && az > ay) return v.z > 0 ? 'F' : 'B';
    return null;
  }
}
