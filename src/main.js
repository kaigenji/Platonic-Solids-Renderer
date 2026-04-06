/**
 * Entry: init scene (2D flattened view), state, UI, export. Animation loop.
 */

import './style.css';
import { state, setState } from './state.js';
import {
  initScene,
  syncScene,
  setCameraMode,
  fitToView,
  getCameraState,
  applyCameraState,
  getCamera,
  getControls,
  render,
  resize,
} from './sceneLayer.js';
import { exportSVG } from './exportLayer.js';
import { initUI } from './ui.js';

const app = document.getElementById('app');
let canvas = document.getElementById('canvas');
if (!canvas) {
  canvas = document.createElement('canvas');
  canvas.id = 'canvas';
}
const canvasWrapper = document.createElement('div');
canvasWrapper.className = 'canvas-wrapper';
canvasWrapper.appendChild(canvas);

const titleEl = document.createElement('div');
titleEl.className = 'canvas-title';
titleEl.textContent = 'ETHEREAL ARTIFACTS PLATONIC SOLIDS PARAMETRIC SVG RENDERER';
canvasWrapper.appendChild(titleEl);

const bottomLeftEl = document.createElement('div');
bottomLeftEl.className = 'canvas-bottom-left';
const fpsEl = document.createElement('div');
fpsEl.className = 'canvas-fps';
fpsEl.textContent = '— fps';
const modelRotEl = document.createElement('div');
modelRotEl.className = 'canvas-model-rot';
modelRotEl.textContent = 'RX: 0.00  RY: 0.00';
bottomLeftEl.appendChild(fpsEl);
bottomLeftEl.appendChild(modelRotEl);
canvasWrapper.appendChild(bottomLeftEl);

app.appendChild(canvasWrapper);

/** State keys that affect 3D scene geometry/arrangement; syncScene is only called when these change. */
const SCENE_GEOMETRY_KEYS = [
  'selectedSolidIds',
  'arrangement',
  'spacing',
  'circleRadius',
  'perspectiveDistortion',
  'rotationPreset',
  'solidOrientations',
  'modelRotationX',
  'modelRotationY',
  'orientationDeltaX',
  'orientationDeltaY',
];

function getSceneGeometrySnapshot(st) {
  const o = {};
  for (const k of SCENE_GEOMETRY_KEYS) o[k] = st[k];
  return JSON.stringify(o);
}

initScene(canvas, state);
resize(state);
syncScene(state);
let lastSceneGeometrySnapshot = getSceneGeometrySnapshot(state);
let lastCameraMode = state.cameraMode;
const initialCameraState = getCameraState();

const sceneApi = {
  resize,
  fitToView,
  setCameraMode,
  getCameraState,
  applyCameraState,
  getCamera,
};

initUI(app, {
  initialCameraState,
  canvasOverlayContainer: canvasWrapper,
  sceneApi,
  exportSvg: exportSVG,
  onStateChange() {
    const snapshot = getSceneGeometrySnapshot(state);
    if (snapshot !== lastSceneGeometrySnapshot) {
      lastSceneGeometrySnapshot = snapshot;
      syncScene(state);
    }
    if (state.cameraMode !== lastCameraMode) {
      lastCameraMode = state.cameraMode;
      setCameraMode(state.cameraMode === 'perspective', state);
    }
    const cam = getCamera();
    if (cam) state.cameraPosition = cam.position.toArray();
    const ctrl = getControls();
    if (ctrl) state.cameraTarget = ctrl.target.toArray();
  },
});

let lastFpsTime = performance.now();
let fpsFrames = 0;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  fpsFrames += 1;
  if (now - lastFpsTime >= 400) {
    const fps = Math.round((fpsFrames * 1000) / (now - lastFpsTime));
    fpsEl.textContent = `${fps} fps`;
    fpsFrames = 0;
    lastFpsTime = now;
  }
  const rx = (state.modelRotationX ?? 0);
  const ry = (state.modelRotationY ?? 0);
  modelRotEl.textContent = `RX: ${rx.toFixed(2)}  RY: ${ry.toFixed(2)}`;
  const cam = getCamera();
  const ctrl = getControls();
  if (cam) {
    state.cameraPosition = cam.position.toArray();
    state.zoom = cam.zoom;
  }
  if (ctrl && ctrl.target) state.cameraTarget = ctrl.target.toArray();
  render(state);
}
animate();
