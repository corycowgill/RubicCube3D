import * as THREE from 'three';

/**
 * Project the drag onto the plane of the hit face, snap it to the dominant
 * in-plane world axis, and derive the slice's rotation axis (always positive).
 */
function computeSliceFromDrag(faceNormal, dragWorld) {
  const proj = dragWorld.clone().sub(
    faceNormal.clone().multiplyScalar(dragWorld.dot(faceNormal))
  );
  if (proj.lengthSq() < 1e-6) return null;
  proj.normalize();

  const ax = Math.abs(proj.x);
  const ay = Math.abs(proj.y);
  const az = Math.abs(proj.z);
  let dragAxis;
  if (ax >= ay && ax >= az) dragAxis = new THREE.Vector3(Math.sign(proj.x), 0, 0);
  else if (ay >= az) dragAxis = new THREE.Vector3(0, Math.sign(proj.y), 0);
  else dragAxis = new THREE.Vector3(0, 0, Math.sign(proj.z));

  // Slice axis is perpendicular to face normal and drag direction.
  // We always normalize to a positive-direction axis so callers can use a
  // canonical layer index without flipping signs.
  const cross = new THREE.Vector3().crossVectors(faceNormal, dragAxis);
  const cx = Math.abs(cross.x), cy = Math.abs(cross.y), cz = Math.abs(cross.z);
  let positiveAxis;
  if (cx >= cy && cx >= cz) positiveAxis = new THREE.Vector3(1, 0, 0);
  else if (cy >= cz) positiveAxis = new THREE.Vector3(0, 1, 0);
  else positiveAxis = new THREE.Vector3(0, 0, 1);

  return { sliceAxis: positiveAxis, dragAxis };
}

export class CubeControls {
  constructor({ camera, renderer, cube, cameraRig, onMove }) {
    this.camera = camera;
    this.renderer = renderer;
    this.cube = cube;
    this.cameraRig = cameraRig; // group we rotate to orbit
    this.onMove = onMove || (() => {});

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.activePointers = new Map(); // id -> { x, y, startX, startY, mode, hit }
    this.dragThresholdPx = 8;
    this.minRotPx = 30;

    this.orbit = {
      target: new THREE.Vector3(0, 0, 0),
      yaw: -0.6,
      pitch: 0.5,
      distance: 6.5,
    };
    this._applyOrbit();

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    el.addEventListener('wheel', this._onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  destroy() {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    el.removeEventListener('wheel', this._onWheel);
  }

  _ndc(x, y) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );
  }

  _hitTest(x, y) {
    const ndc = this._ndc(x, y);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = this.cube.cubies.map((c) => c.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);
    if (intersects.length === 0) return null;
    const hit = intersects[0];
    const cubie = this.cube.cubies.find((c) => c.mesh === hit.object);
    // World face normal at hit
    const worldNormal = hit.face.normal.clone()
      .transformDirection(hit.object.matrixWorld)
      .normalize();
    // Snap to nearest world axis
    const ax = Math.abs(worldNormal.x), ay = Math.abs(worldNormal.y), az = Math.abs(worldNormal.z);
    let snapNormal;
    if (ax >= ay && ax >= az) snapNormal = new THREE.Vector3(Math.sign(worldNormal.x), 0, 0);
    else if (ay >= az) snapNormal = new THREE.Vector3(0, Math.sign(worldNormal.y), 0);
    else snapNormal = new THREE.Vector3(0, 0, Math.sign(worldNormal.z));

    return {
      cubie,
      hitPoint: hit.point.clone(),
      faceNormal: snapNormal,
      // World-space position of the cubie center (for layer detection)
      cubieWorldPos: hit.object.getWorldPosition(new THREE.Vector3()),
    };
  }

  _onPointerDown = (e) => {
    e.preventDefault();
    this.renderer.domElement.setPointerCapture(e.pointerId);
    const hit = this._hitTest(e.clientX, e.clientY);
    this.activePointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      mode: null, // 'orbit' or 'slice' (decided after drag threshold)
      hit,
      pointerType: e.pointerType,
    });
  };

  _onPointerMove = (e) => {
    const p = this.activePointers.get(e.pointerId);
    if (!p) return;

    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    const dist = Math.hypot(dx, dy);

    if (!p.mode) {
      if (dist < this.dragThresholdPx) {
        p.x = e.clientX; p.y = e.clientY;
        return;
      }
      // Decide mode
      if (this.activePointers.size > 1) {
        // Two-finger -> always orbit
        p.mode = 'orbit';
      } else if (!p.hit) {
        p.mode = 'orbit';
      } else if (this.cube.animating) {
        p.mode = 'orbit';
      } else {
        p.mode = 'slice';
        p.sliceTriggered = false;
      }
    }

    if (p.mode === 'orbit') {
      const moveX = e.clientX - p.x;
      const moveY = e.clientY - p.y;
      this.orbit.yaw -= moveX * 0.008;
      this.orbit.pitch += moveY * 0.008;
      this.orbit.pitch = Math.max(-1.4, Math.min(1.4, this.orbit.pitch));
      this._applyOrbit();
    } else if (p.mode === 'slice' && !p.sliceTriggered && dist >= this.minRotPx) {
      p.sliceTriggered = true;
      this._performSliceFromDrag(p, e.clientX, e.clientY).then((moved) => {
        if (moved) this.onMove();
      });
    }

    p.x = e.clientX; p.y = e.clientY;
  };

  _onPointerUp = (e) => {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.delete(e.pointerId);
    }
    try { this.renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  _onWheel = (e) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.001);
    this.orbit.distance = Math.max(3.5, Math.min(14, this.orbit.distance * factor));
    this._applyOrbit();
  };

  _applyOrbit() {
    const { yaw, pitch, distance, target } = this.orbit;
    const x = target.x + distance * Math.cos(pitch) * Math.sin(yaw);
    const y = target.y + distance * Math.sin(pitch);
    const z = target.z + distance * Math.cos(pitch) * Math.cos(yaw);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(target);
  }

  async _performSliceFromDrag(p, curX, curY) {
    const hit = p.hit;
    if (!hit) return false;

    // Compute the drag direction in world space by projecting screen delta
    // onto the plane of the hit face.
    const startWorld = hit.hitPoint.clone();
    const planeNormal = hit.faceNormal.clone();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, startWorld);

    const ndc = this._ndc(curX, curY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const endWorld = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, endWorld)) return false;

    const dragWorld = endWorld.sub(startWorld);
    const sel = computeSliceFromDrag(planeNormal, dragWorld);
    if (!sel) return false;

    // Layer is intrinsic to the clicked cubie's position along the slice axis.
    const positiveAxis = sel.sliceAxis;
    const axisName = positiveAxis.x !== 0 ? 'x' : positiveAxis.y !== 0 ? 'y' : 'z';
    const step = this.cube.step;
    const layer = Math.round(hit.cubieWorldPos[axisName] / step); // -1, 0, or 1

    // Rotation sign: the linear velocity at a point on the face from spinning
    // the slice around `positiveAxis` is (positiveAxis × faceNormal). If the
    // drag agrees with that direction, the angle is positive.
    const tangent = new THREE.Vector3().crossVectors(positiveAxis, planeNormal);
    const sign = Math.sign(sel.dragAxis.dot(tangent)) || 1;
    const angle = sign * (Math.PI / 2);

    const ok = await this.cube.rotateLayer(positiveAxis, layer, angle, 200);
    if (ok) {
      this.cube.totalMoves++;
      if (this.cube.recordHistory) {
        // Record using face/dir representation for undo. Map back via axis+layer+angle.
        const face = this._axisLayerToFace(positiveAxis, layer);
        if (face) {
          // Determine CW/CCW relative to that face's outward normal
          const faceSign = (face === 'L' || face === 'D' || face === 'B') ? -1 : 1;
          const dir = Math.sign(angle) * faceSign;
          this.cube.history.push({ face, dir });
        }
      }
    }
    return ok;
  }

  _axisLayerToFace(axisVec, layer) {
    if (axisVec.x !== 0) {
      if (layer === 1) return 'R';
      if (layer === -1) return 'L';
    } else if (axisVec.y !== 0) {
      if (layer === 1) return 'U';
      if (layer === -1) return 'D';
    } else if (axisVec.z !== 0) {
      if (layer === 1) return 'F';
      if (layer === -1) return 'B';
    }
    return null; // middle slice — not undoable in this simple model
  }
}
