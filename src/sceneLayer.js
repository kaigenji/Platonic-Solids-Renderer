/**
 * Scene layer: camera + custom controls; preview is flattened projection (same as export).
 *
 * Controls:
 * - Left drag: rotate model (modelRotationX/Y); hold Shift to lock to one axis (horizontal → Y only, vertical → X only); hold Y to rotate all shapes in place by the same amount (orientation delta)
 * - Right drag: orbit camera around target
 * - Middle drag: pan camera (and target)
 * - Two-finger drag (trackpad): pan (same as middle drag)
 * - Scroll / pinch: zoom
 * - Space: hide/show UI, R: reset camera (handled in UI)
 */

import * as THREE from 'three';
import { getState, getStyleForSolid, DEFAULT_FILL_COLOR } from './state.js';
import {
  getSolidsForIds,
  getArrangement,
  applyRotationToVertices,
} from './solidLibrary.js';
import { renderPreview } from './previewLayer.js';

let scene, camera, ambientLight, directionalLight;
let meshGroup;
let canvasEl;

const Y_UP = new THREE.Vector3(0, 1, 0);
const ROTATE_SENSITIVITY = 0.006;
const ORBIT_SENSITIVITY = 0.003;
const PAN_PIXEL_SCALE = 1.2;
const ZOOM_SENSITIVITY = 0.0012;
const MIN_POLAR = 0.05;
const MAX_POLAR = Math.PI - 0.05;

const cameraTarget = new THREE.Vector3(0, 0, 0);

function positionToSpherical(p, target) {
  const v = new THREE.Vector3().subVectors(p, target);
  const radius = v.length();
  if (radius < 1e-6) return { radius: 8, theta: 0, phi: Math.PI / 2 };
  const theta = Math.atan2(v.x, v.z);
  const phi = Math.acos(THREE.MathUtils.clamp(v.y / radius, -1, 1));
  return { radius, theta, phi };
}

function sphericalToPosition(target, radius, theta, phi) {
  const x = target.x + radius * Math.sin(phi) * Math.sin(theta);
  const y = target.y + radius * Math.cos(phi);
  const z = target.z + radius * Math.sin(phi) * Math.cos(theta);
  return new THREE.Vector3(x, y, z);
}

function setupSceneControls(canvas, cam, state) {
  let mode = null;
  let prevX = 0, prevY = 0;
  let keyYHeld = false;

  function getStateOrFallback() {
    return state || getState();
  }

  function isInputFocused() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'y' || e.key === 'Y') && !isInputFocused()) keyYHeld = true;
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'y' || e.key === 'Y') keyYHeld = false;
  });

  function syncCameraToState() {
    const s = getStateOrFallback();
    cam.position.set(...(s.cameraPosition || [0, 0, 8]));
    cameraTarget.set(...(s.cameraTarget || [0, 0, 0]));
    cam.lookAt(cameraTarget);
    cam.zoom = s.zoom ?? 1;
    cam.updateProjectionMatrix();
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 0) {
      mode = 'model';
    } else if (e.button === 1) {
      mode = 'pan';
    } else if (e.button === 2) {
      mode = 'orbit';
    } else return;
    prevX = e.clientX;
    prevY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (mode === null) return;
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    prevX = e.clientX;
    prevY = e.clientY;
    const s = getStateOrFallback();

    if (mode === 'model') {
      let dmx = dy * ROTATE_SENSITIVITY;
      let dmy = dx * ROTATE_SENSITIVITY;
      if (e.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          dmx = 0;
        } else {
          dmy = 0;
        }
      }
      if (keyYHeld) {
        s.orientationDeltaX = (s.orientationDeltaX ?? 0) + dmx;
        s.orientationDeltaY = (s.orientationDeltaY ?? 0) + dmy;
        syncScene(s);
      } else {
        const mx = (s.modelRotationX ?? 0) + dmx;
        const my = (s.modelRotationY ?? 0) + dmy;
        s.modelRotationX = mx;
        s.modelRotationY = my;
        if (meshGroup) {
          meshGroup.rotation.x = mx;
          meshGroup.rotation.y = my;
          meshGroup.rotation.z = 0;
        }
      }
      return;
    }

    if (mode === 'orbit') {
      const { radius, theta, phi } = positionToSpherical(cam.position, cameraTarget);
      const newTheta = theta - dx * ORBIT_SENSITIVITY;
      const newPhi = THREE.MathUtils.clamp(phi - dy * ORBIT_SENSITIVITY, MIN_POLAR, MAX_POLAR);
      cam.position.copy(sphericalToPosition(cameraTarget, radius, newTheta, newPhi));
      cam.lookAt(cameraTarget);
      s.cameraPosition = cam.position.toArray();
      s.cameraTarget = cameraTarget.toArray();
      return;
    }

    if (mode === 'pan') {
      const h = Math.max(canvas.height || 1, 1);
      const w = Math.max(canvas.width || 1, 1);
      const visibleHeight = 6 / (cam.zoom || 1);
      const worldPerPixel = (visibleHeight / h) * PAN_PIXEL_SCALE;
      const moveX = dx * worldPerPixel;
      const moveY = dy * worldPerPixel;
      const viewDir = new THREE.Vector3().subVectors(cameraTarget, cam.position).normalize();
      const right = new THREE.Vector3().crossVectors(Y_UP, viewDir);
      if (right.lengthSq() < 1e-12) return;
      right.normalize();
      const up = new THREE.Vector3().crossVectors(viewDir, right).normalize();
      const delta = new THREE.Vector3().addVectors(
        right.clone().multiplyScalar(moveX),
        up.clone().multiplyScalar(moveY)
      );
      cameraTarget.add(delta);
      cam.position.add(delta);
      s.cameraPosition = cam.position.toArray();
      s.cameraTarget = cameraTarget.toArray();
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (e.button === 0 || e.button === 1 || e.button === 2) mode = null;
    canvas.releasePointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointercancel', () => { mode = null; });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const s = getStateOrFallback();
    const panX = -e.deltaX;
    const panY = e.deltaY;
    const isTwoFingerPan = Math.abs(panX) > Math.abs(panY) || Math.abs(panX) > 8;
    if (isTwoFingerPan && (Math.abs(panX) > 0.5 || Math.abs(panY) > 0.5)) {
      const h = Math.max(canvas.height || 1, 1);
      const visibleHeight = 6 / (cam.zoom || 1);
      const worldPerPixel = (visibleHeight / h) * PAN_PIXEL_SCALE;
      const moveX = panX * worldPerPixel;
      const moveY = panY * worldPerPixel;
      const viewDir = new THREE.Vector3().subVectors(cameraTarget, cam.position).normalize();
      const right = new THREE.Vector3().crossVectors(Y_UP, viewDir);
      if (right.lengthSq() >= 1e-12) {
        right.normalize();
        const up = new THREE.Vector3().crossVectors(viewDir, right).normalize();
        const delta = new THREE.Vector3().addVectors(
          right.clone().multiplyScalar(moveX),
          up.clone().multiplyScalar(moveY)
        );
        cameraTarget.add(delta);
        cam.position.add(delta);
        s.cameraPosition = cam.position.toArray();
        s.cameraTarget = cameraTarget.toArray();
      }
    } else {
      const z = (s.zoom ?? 1) * (1 - e.deltaY * ZOOM_SENSITIVITY);
      const newZoom = Math.max(0.2, Math.min(8, z));
      s.zoom = newZoom;
      cam.zoom = newZoom;
      cam.updateProjectionMatrix();
    }
  }, { passive: false });

  syncCameraToState();
}

export function initScene(canvas, state) {
  canvasEl = canvas;
  if (!canvas) return null;

  scene = new THREE.Scene();
  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = 6;
  camera = new THREE.OrthographicCamera(
    -frustumSize * aspect * 0.5,
    frustumSize * aspect * 0.5,
    frustumSize * 0.5,
    -frustumSize * 0.5,
    0.1,
    1000
  );
  camera.position.set(...(state.cameraPosition || [0, 0, 8]));
  cameraTarget.set(...(state.cameraTarget || [0, 0, 0]));
  camera.lookAt(cameraTarget);
  camera.zoom = state.zoom ?? 1;
  camera.updateProjectionMatrix();

  setupSceneControls(canvas, camera, state);

  ambientLight = new THREE.AmbientLight(0xffffff, state.ambientIntensity ?? 0.25);
  scene.add(ambientLight);
  directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  updateLightDirection(state);
  scene.add(directionalLight);
  meshGroup = new THREE.Group();
  meshGroup.rotation.order = 'XYZ';
  scene.add(meshGroup);

  meshGroup.rotation.x = state.modelRotationX ?? 0;
  meshGroup.rotation.y = state.modelRotationY ?? 0;
  meshGroup.rotation.z = 0;

  window.addEventListener('resize', () => resize(state));
  return { scene, camera, controls: { target: cameraTarget } };
}

function updateLightDirection(state) {
  const az = state.lightAzimuth * Math.PI * 2;
  const el = state.lightElevation * Math.PI * 0.5;
  const x = Math.cos(el) * Math.cos(az);
  const y = Math.sin(el);
  const z = Math.cos(el) * Math.sin(az);
  directionalLight.position.set(x, y, z).normalize();
  directionalLight.intensity = 1;
}

function buildGeometryIndexed(solid, presetName, solidId = null, orientationDelta = null) {
  const vertices = applyRotationToVertices(solid.vertices, presetName, solidId, orientationDelta);
  const positions = vertices.flat();
  const indices = [];
  for (const face of solid.faces) {
    for (let i = 1; i < face.length - 1; i++) {
      indices.push(face[0], face[i], face[i + 1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function syncScene(state) {
  const { ids, scales, positions } = getArrangement(state);
  const list = getSolidsForIds(ids);

  meshGroup.clear();
  const orientationDelta = {
    x: state.orientationDeltaX ?? 0,
    y: state.orientationDeltaY ?? 0,
    z: 0,
  };
  list.forEach(({ id, solid }, i) => {
    const preset = (state.solidOrientations && state.solidOrientations[id]) || state.rotationPreset || 'isometric';
    const geometry = buildGeometryIndexed(solid, preset, id, orientationDelta);
    const style = getStyleForSolid(state, id);
    const fillColor = style.fillColor || DEFAULT_FILL_COLOR;
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color().setStyle(fillColor),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const pos = positions[i] || [0, 0, 0];
    const s = scales[i] ?? 1;
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.scale.set(s, s, s);
    mesh.userData.solidId = id;
    mesh.userData.solid = solid;
    mesh.userData.worldPosition = [...pos];
    meshGroup.add(mesh);
  });

  meshGroup.rotation.order = 'XYZ';
  meshGroup.rotation.x = state.modelRotationX ?? 0;
  meshGroup.rotation.y = state.modelRotationY ?? 0;
  meshGroup.rotation.z = 0;
  ambientLight.intensity = state.ambientIntensity ?? 0.25;
  updateLightDirection(state);
}

export function setCameraMode(perspective, state) {
  if (!camera) return;
  const aspect = window.innerWidth / window.innerHeight;
  const pos = new THREE.Vector3().setFromArray(state.cameraPosition || [0, 0, 8]);
  const target = new THREE.Vector3().setFromArray(state.cameraTarget || [0, 0, 0]);
  if (perspective) {
    const next = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    next.position.copy(pos);
    next.lookAt(target);
    next.zoom = 1;
    replaceCamera(next);
  } else {
    const frustumSize = 6;
    const next = new THREE.OrthographicCamera(
      -frustumSize * aspect * 0.5,
      frustumSize * aspect * 0.5,
      frustumSize * 0.5,
      -frustumSize * 0.5,
      0.1,
      1000
    );
    next.position.copy(pos);
    next.lookAt(target);
    next.zoom = state.zoom ?? 1;
    next.updateProjectionMatrix();
    replaceCamera(next);
  }
  cameraTarget.copy(target);
  state.cameraMode = perspective ? 'perspective' : 'orthographic';
}

function replaceCamera(newCam) {
  newCam.zoom = camera.zoom;
  newCam.updateProjectionMatrix();
  camera = newCam;
}

export function resize(state) {
  if (!canvasEl || !camera) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvasEl.width = w;
  canvasEl.height = h;
  if (state.exportDimensionsFollowViewport) {
    state.exportWidth = Math.max(100, Math.floor(w));
    state.exportHeight = Math.max(100, Math.floor(h));
  }
  const aspect = w / h;
  if (camera.isOrthographicCamera) {
    const frustumSize = 6;
    camera.left = -frustumSize * aspect * 0.5;
    camera.right = frustumSize * aspect * 0.5;
    camera.top = frustumSize * 0.5;
    camera.bottom = -frustumSize * 0.5;
    camera.updateProjectionMatrix();
  } else {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
}

export function fitToView(state) {
  if (!meshGroup || !camera) return;
  const box = new THREE.Box3();
  meshGroup.traverse((obj) => {
    if (obj.isMesh && obj.geometry) {
      obj.geometry.computeBoundingBox();
      const b = obj.geometry.boundingBox.clone();
      b.applyMatrix4(obj.matrixWorld);
      box.union(b);
    }
  });
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const distance = maxDim * 1.8;
  if (camera.isOrthographicCamera) {
    camera.zoom = Math.min(window.innerWidth, window.innerHeight) / (maxDim * 1.2);
    camera.updateProjectionMatrix();
  }
  camera.position.set(center.x + distance * 0.5, center.y + distance * 0.5, center.z + distance * 0.7);
  camera.lookAt(center);
  cameraTarget.copy(center);
  state.cameraPosition = camera.position.toArray();
  state.cameraTarget = center.toArray();
  state.zoom = camera.zoom;
}

export function getCameraState() {
  if (!camera) return null;
  return {
    position: camera.position.toArray(),
    target: cameraTarget.toArray(),
    zoom: camera.zoom,
    modelRotationX: getState().modelRotationX ?? 0,
    modelRotationY: getState().modelRotationY ?? 0,
    isOrthographic: camera.isOrthographicCamera,
  };
}

export function applyCameraState(state, camState) {
  if (!camState) return;
  state.cameraPosition = camState.position;
  state.cameraTarget = camState.target;
  state.zoom = camState.zoom;
  if (camState.modelRotationX != null) state.modelRotationX = camState.modelRotationX;
  if (camState.modelRotationY != null) state.modelRotationY = camState.modelRotationY;
  if (camera) {
    camera.position.set(...camState.position);
    camera.zoom = camState.zoom;
    camera.updateProjectionMatrix();
    cameraTarget.set(...camState.target);
    camera.lookAt(cameraTarget);
    if (meshGroup) {
      meshGroup.rotation.order = 'XYZ';
      meshGroup.rotation.x = state.modelRotationX ?? 0;
      meshGroup.rotation.y = state.modelRotationY ?? 0;
      meshGroup.rotation.z = 0;
    }
  }
}

export function render(state) {
  if (!canvasEl || !camera) return;
  renderPreview(state, canvasEl);
}

export function getCamera() {
  return camera;
}

export function getControls() {
  return { target: cameraTarget };
}
