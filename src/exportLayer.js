/**
 * Export layer: exportSVG(state) → string. Vector-only from model + camera + style.
 */

import {
  getSolidsForIds,
  getArrangement,
  applyRotationToVertices,
  applyEulerToVertices,
} from './solidLibrary.js';
import { parseRgba, toRgbaCss, normalizeToRgba, applySaturation } from './colorUtils.js';
import { getStyleForSolid, getLightingForSolid, DEFAULT_FILL_COLOR, DEFAULT_STROKE_COLOR } from './state.js';

/** State keys that affect getFlattenedView result; used for cache fingerprint. */
const FLATTENED_VIEW_STATE_KEYS = [
  'cameraPosition', 'cameraTarget', 'zoom', 'cameraMode', 'modelRotationX', 'modelRotationY',
  'selectedSolidIds', 'arrangement', 'spacing', 'circleRadius', 'perspectiveDistortion', 'rotationPreset', 'solidOrientations', 'orientationDeltaX', 'orientationDeltaY',
  'fillColor', 'faceStrokeColor', 'strokeOverridden', 'faceStrokeWidth', 'faceStrokeInset', 'cornerRadius',
  'useGradient', 'gradientFillColors', 'gradientStrokeColors', 'gradientInnerFill', 'gradientInnerStroke', 'innerFaceVibrancy',
  'outsideLayerOverrideEnabled', 'outsideLayerOverrideRgba',
  'useGlobalForSolid', 'solidOverrides',
  'lightAzimuth', 'lightElevation', 'ambientIntensity', 'gradientMode',
  'exportWidth', 'exportHeight', 'exportPadding', 'exportBackground',
];

let flattenedViewCache = { fingerprint: null, viewportKey: null, result: null };

function getFlattenedViewFingerprint(state) {
  const o = {};
  for (const k of FLATTENED_VIEW_STATE_KEYS) o[k] = state[k];
  return JSON.stringify(o);
}

function getViewportKey(viewport, state) {
  if (viewport) return `${viewport.width},${viewport.height},${viewport.padding ?? 40}`;
  return `${state.exportWidth ?? 800},${state.exportHeight ?? 600},${state.exportPadding ?? 40}`;
}

function viewBasis(cameraPosition, cameraTarget) {
  const dx = cameraTarget[0] - cameraPosition[0];
  const dy = cameraTarget[1] - cameraPosition[1];
  const dz = cameraTarget[2] - cameraPosition[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const vx = dx / len, vy = dy / len, vz = dz / len;
  const right = Math.abs(vx) < 0.9
    ? [-(vz - (vy * vy * vz) / (1 + vx)), vy * vz, 1 + vx - vy * vy - vz * vz]
    : [0, 1, 0];
  const rlen = Math.hypot(right[0], right[1], right[2]) || 1;
  const rx = right[0] / rlen, ry = right[1] / rlen, rz = right[2] / rlen;
  const ux = ry * vz - rz * vy, uy = rz * vx - rx * vz, uz = rx * vy - ry * vx;
  const ulen = Math.hypot(ux, uy, uz) || 1;
  const ux2 = ux / ulen, uy2 = uy / ulen, uz2 = uz / ulen;
  return { vx, vy, vz, rx, ry, rz, ux2, uy2, uz2 };
}

function projectOrtho(worldPt, cameraPosition, cameraTarget, zoom, viewportScale) {
  const b = viewBasis(cameraPosition, cameraTarget);
  const px = worldPt[0] - cameraPosition[0], py = worldPt[1] - cameraPosition[1], pz = worldPt[2] - cameraPosition[2];
  const sx = (px * b.rx + py * b.ry + pz * b.rz) * viewportScale * zoom;
  const sy = (px * b.ux2 + py * b.uy2 + pz * b.uz2) * viewportScale * zoom;
  const z = px * b.vx + py * b.vy + pz * b.vz;
  return [sx, sy, z];
}

function projectPerspective(worldPt, cameraPosition, cameraTarget, zoom, viewportScale) {
  const b = viewBasis(cameraPosition, cameraTarget);
  const px = worldPt[0] - cameraPosition[0], py = worldPt[1] - cameraPosition[1], pz = worldPt[2] - cameraPosition[2];
  const pz_view = px * b.vx + py * b.vy + pz * b.vz;
  if (pz_view <= 1e-6) return [0, 0, -1e6];
  const px_view = px * b.rx + py * b.ry + pz * b.rz;
  const py_view = px * b.ux2 + py * b.uy2 + pz * b.uz2;
  const sx = (px_view / pz_view) * viewportScale * zoom;
  const sy = (py_view / pz_view) * viewportScale * zoom;
  return [sx, sy, pz_view];
}

function faceNormal(vertices, face) {
  const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
  const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
  const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
  const nx = vy * wz - vz * wy, ny = vz * wx - vx * wz, nz = vx * wy - vy * wx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function viewDirection(state) {
  const t = state.cameraTarget, p = state.cameraPosition;
  const dx = t[0] - p[0], dy = t[1] - p[1], dz = t[2] - p[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  return [dx / len, dy / len, dz / len];
}

/** True when the face is visible (normal points toward camera). viewDir = target−camera points into scene, so visible when normal·viewDir < 0. */
function isFrontFacing(normal, viewDir) {
  return normal[0] * viewDir[0] + normal[1] * viewDir[1] + normal[2] * viewDir[2] < 0;
}

/** Remove vertices that lie nearly on the line through neighbors (fixes thick outline when face is perpendicular to camera). Caps the perpendicular-face case so outline doesn't flare. */
function simplifySilhouetteLoop(loop, relTol = 0.06) {
  const n = loop.length;
  if (n <= 3) return loop;
  let out = loop.slice();
  for (let pass = 0; pass < n; pass++) {
    const nextOut = [];
    const len = out.length;
    if (len <= 3) break;
    for (let i = 0; i < len; i++) {
      const prev = out[(i - 1 + len) % len];
      const curr = out[i];
      const next = out[(i + 1) % len];
      const ax = curr[0] - prev[0], ay = curr[1] - prev[1];
      const bx = next[0] - curr[0], by = next[1] - curr[1];
      const ab = Math.hypot(ax, ay) || 1e-10;
      const bc = Math.hypot(bx, by) || 1e-10;
      const minEdge = Math.min(ab, bc, 1);
      const dot = (ax * bx + ay * by) / (ab * bc);
      const nearPerpendicular = dot < -0.985;
      const ac = Math.hypot(next[0] - prev[0], next[1] - prev[1]);
      const gap = ab + bc - ac;
      const collinear = gap < relTol * minEdge;
      const dx = next[0] - prev[0], dy = next[1] - prev[1];
      const lineLen = Math.hypot(dx, dy) || 1e-10;
      const cross = ax * dy - ay * dx;
      const perpDist = Math.abs(cross) / lineLen;
      const thinStrip = perpDist < relTol * minEdge;
      if (nearPerpendicular || collinear || thinStrip) continue;
      nextOut.push(curr);
    }
    if (nextOut.length === len) break;
    out = nextOut.length >= 2 ? nextOut : out;
  }
  return out.length >= 2 ? out : loop;
}

/** Signed area of polygon (shoelace). Used to reject degenerate/near-collinear loops that draw as lines. */
function polygonAreaSigned(loop) {
  let area = 0;
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += loop[i][0] * loop[j][1] - loop[j][0] * loop[i][1];
  }
  return area * 0.5;
}

function roundPathIn2D(points2d, r) {
  if (points2d.length < 2) return '';
  const n = points2d.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const prev = points2d[(i - 1 + n) % n];
    const curr = points2d[i];
    const next = points2d[(i + 1) % n];
    const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1];
    const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1];
    const L1 = Math.hypot(dx1, dy1) || 1e-10;
    const L2 = Math.hypot(dx2, dy2) || 1e-10;
    const trim = Math.min(r, L1 / 2, L2 / 2);
    const t1 = trim / L1, t2 = trim / L2;
    const inX = prev[0] + (1 - t1) * dx1, inY = prev[1] + (1 - t1) * dy1;
    const outX = curr[0] + t2 * dx2, outY = curr[1] + t2 * dy2;
    if (i === 0) d += `M ${fmt(inX)} ${fmt(inY)} `;
    else d += `L ${fmt(inX)} ${fmt(inY)} `;
    if (trim > 1e-6) d += `A ${fmt(trim)} ${fmt(trim)} 0 0 1 ${fmt(outX)} ${fmt(outY)} `;
  }
  d += 'Z';
  return d;
}

/** Stroke inset = scale the face polygon toward its center. scaleFactor 1 = no change, <1 = shrink. Preserves winding. */
function scalePolygonAboutCenter2D(points2d, scaleFactor) {
  const n = points2d.length;
  if (n < 3 || scaleFactor >= 1 - 1e-10) return points2d;
  if (scaleFactor < 1e-6) scaleFactor = 1e-6;
  const cx = points2d.reduce((s, p) => s + p[0], 0) / n;
  const cy = points2d.reduce((s, p) => s + p[1], 0) / n;
  return points2d.map((p) => [
    cx + (p[0] - cx) * scaleFactor,
    cy + (p[1] - cy) * scaleFactor,
  ]);
}

/** Minimum edge length of polygon (2D). */
function minEdgeLength2D(points2d) {
  if (points2d.length < 2) return 0;
  let minLen = Infinity;
  const n = points2d.length;
  for (let i = 0; i < n; i++) {
    const a = points2d[i];
    const b = points2d[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 1e-10) minLen = Math.min(minLen, len);
  }
  return minLen === Infinity ? 0 : minLen;
}

/** Relative inset fraction from slider (0..sliderMax). Logarithmic so high values taper and avoid self-clip. */
const INSET_SLIDER_MAX = 0.6;
const MAX_INSET_FRACTION = 0.48;
function relativeInsetFraction(sliderValue) {
  if (sliderValue <= 0) return 0;
  const t = Math.min(1, sliderValue / INSET_SLIDER_MAX);
  return MAX_INSET_FRACTION * (1 - Math.exp(-4 * t));
}

/** Effective corner radius so rounding works on long/short edges: cap by fraction of min edge length. */
function effectiveCornerRadius(points2d, r) {
  if (points2d.length < 2) return 0;
  let minLen = Infinity;
  const n = points2d.length;
  for (let i = 0; i < n; i++) {
    const a = points2d[i];
    const b = points2d[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 1e-10) minLen = Math.min(minLen, len);
  }
  if (minLen === Infinity) return r;
  return Math.min(r, minLen * 0.48);
}

/** Crop face at each vertex; trim distance scaled by face interior angle at that vertex (so corner radius is relative to the face, not a global vertex). */
function cropAtVertex3DAndProject(worldVerts, r_3d, project, camPos, camTarget, zoom, viewportScale) {
  const n = worldVerts.length;
  if (n < 3 || r_3d <= 0) return null;
  const eps = 1e-10;
  const A = [];
  const B = [];
  const rAtVertices = [];
  for (let i = 0; i < n; i++) {
    const V = worldVerts[i];
    const prev = worldVerts[(i - 1 + n) % n];
    const next = worldVerts[(i + 1) % n];
    const Lprev = Math.hypot(prev[0] - V[0], prev[1] - V[1], prev[2] - V[2]) || eps;
    const Lnext = Math.hypot(next[0] - V[0], next[1] - V[1], next[2] - V[2]) || eps;
    const vPrev = [(prev[0] - V[0]) / Lprev, (prev[1] - V[1]) / Lprev, (prev[2] - V[2]) / Lprev];
    const vNext = [(next[0] - V[0]) / Lnext, (next[1] - V[1]) / Lnext, (next[2] - V[2]) / Lnext];
    const cosAngle = vPrev[0] * vNext[0] + vPrev[1] * vNext[1] + vPrev[2] * vNext[2];
    const interiorAngle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    const angleScale = Math.min(1, interiorAngle / (Math.PI / 2));
    const rAtVertex = r_3d * angleScale;
    rAtVertices.push(rAtVertex);
    const dPrev = Math.min(rAtVertex, Lprev / 2);
    const dNext = Math.min(rAtVertex, Lnext / 2);
    A.push([V[0] + (prev[0] - V[0]) * (dPrev / Lprev), V[1] + (prev[1] - V[1]) * (dPrev / Lprev), V[2] + (prev[2] - V[2]) * (dPrev / Lprev)]);
    B.push([V[0] + (next[0] - V[0]) * (dNext / Lnext), V[1] + (next[1] - V[1]) * (dNext / Lnext), V[2] + (next[2] - V[2]) * (dNext / Lnext)]);
  }
  const ordered = [];
  for (let i = 0; i < n; i++) {
    ordered.push(B[i]);
    ordered.push(A[(i + 1) % n]);
  }
  const points2d = ordered.map((p) => {
    const q = project(p, camPos, camTarget, zoom, viewportScale);
    return [q[0], q[1]];
  });
  let d = '';
  for (let i = 0; i < n; i++) {
    const pt0 = points2d[i * 2];
    const pt1 = points2d[i * 2 + 1];
    const pt2 = points2d[(i * 2 + 2) % (2 * n)];
    if (i === 0) d += `M ${fmt(pt0[0])} ${fmt(pt0[1])} `;
    d += `L ${fmt(pt1[0])} ${fmt(pt1[1])} `;
    const chord = Math.hypot(pt2[0] - pt1[0], pt2[1] - pt1[1]);
    const rWorld = rAtVertices[i] * viewportScale * zoom;
    const arcR = Math.max(1e-6, Math.min(chord / 2, rWorld));
    if (chord > 1e-6) d += `A ${fmt(arcR)} ${fmt(arcR)} 0 0 1 ${fmt(pt2[0])} ${fmt(pt2[1])} `;
    else d += `L ${fmt(pt2[0])} ${fmt(pt2[1])} `;
  }
  d += 'Z';
  return { pathD: d, points2d };
}

function fmt(x) {
  return Number(x).toFixed(2);
}

/**
 * Build flattened projection (same as export): face paths, silhouette.
 * Used by both exportSVG and the live preview so the engine reflects the export.
 * viewport: { width, height, padding? } (default padding 40)
 * Result is cached by state fingerprint + viewport; cache is reused when unchanged.
 */
export function getFlattenedView(state, viewport = null) {
  const fingerprint = getFlattenedViewFingerprint(state);
  const viewportKey = getViewportKey(viewport, state);
  if (flattenedViewCache.fingerprint === fingerprint && flattenedViewCache.viewportKey === viewportKey && flattenedViewCache.result) {
    return flattenedViewCache.result;
  }

  const maxW = typeof window !== 'undefined' ? window.innerWidth : 4096;
  const maxH = typeof window !== 'undefined' ? window.innerHeight : 4096;
  const rawW = viewport ? viewport.width : (state.exportWidth || 800);
  const rawH = viewport ? viewport.height : (state.exportHeight || 600);
  const w = viewport ? viewport.width : Math.min(maxW, Math.max(100, rawW));
  const h = viewport ? viewport.height : Math.min(maxH, Math.max(100, rawH));
  const pad = (viewport && viewport.padding != null) ? viewport.padding : (state.exportPadding ?? 40);

  const { ids, scales, positions } = getArrangement(state);
  const list = getSolidsForIds(ids);
  const viewDir = viewDirection(state);
  const camPos = state.cameraPosition;
  const camTarget = state.cameraTarget;
  const zoom = state.zoom || 1;
  const viewportScale = Math.min(w - 2 * pad, h - 2 * pad) / 6;
  const usePerspective = state.cameraMode === 'perspective';
  const project = usePerspective ? projectPerspective : projectOrtho;
  const basis = viewBasis(camPos, camTarget);

  const modelRotX = state.modelRotationX ?? 0;
  const modelRotY = state.modelRotationY ?? 0;
  const orientationDelta = {
    x: state.orientationDeltaX ?? 0,
    y: state.orientationDeltaY ?? 0,
    z: 0,
  };
  const allFaces = [];
  list.forEach(({ id, solid }, solidIndex) => {
    const preset = (state.solidOrientations && state.solidOrientations[id]) || state.rotationPreset || 'isometric';
    const pos = positions[solidIndex] || [0, 0, 0];
    const scaleI = scales[solidIndex] ?? 1;
    const localVerts = applyRotationToVertices(solid.vertices, preset, id, orientationDelta);
    const worldVerts = localVerts.map(([x, y, z]) => [pos[0] + scaleI * x, pos[1] + scaleI * y, pos[2] + scaleI * z]);
    const verts = applyEulerToVertices(worldVerts, modelRotX, modelRotY, 0);
    const faces = solid.faces.map((face, fi) => {
      const normal = faceNormal(verts, face);
      const worldVerts = face.map((vi) => [verts[vi][0], verts[vi][1], verts[vi][2]]);
      const proj = worldVerts.map((p) => project(p, camPos, camTarget, zoom, viewportScale));
      const depth = proj.reduce((s, p) => s + p[2], 0) / proj.length;
      return { solidIndex, faceIndex: fi, normal, proj, depth, front: isFrontFacing(normal, viewDir), vertexIndices: face, worldVerts };
    });
    faces.forEach((f) => allFaces.push(f));
  });

  allFaces.sort((a, b) => {
    const d = a.depth - b.depth;
    if (d !== 0) return d;
    // Same depth (e.g. cube faces meeting at an edge): draw back-facing first so front-facing is drawn on top and inner never shows through outer
    return (a.front ? 1 : 0) - (b.front ? 1 : 0);
  });

  const styleBySolid = {};
  const lightingBySolid = {};
  list.forEach(({ id }) => {
    styleBySolid[id] = getStyleForSolid(state, id);
    lightingBySolid[id] = getLightingForSolid(state, id);
  });

  const facePathData = [];
  for (const f of allFaces) {
    const solidId = list[f.solidIndex].id;
    const style = styleBySolid[solidId];
    const cornerRadiusRaw = Math.max(0, style.cornerRadius ?? 0.05);
    const cornerRadiusVal = Math.min(
      cornerRadiusRaw,
      style.faceStrokeInset ?? style.faceStrokeWidth ?? Infinity
    );
    const insetFraction = relativeInsetFraction(style.faceStrokeInset ?? style.faceStrokeWidth ?? 0);
    const worldInsetRef = 0.5 * insetFraction;
    const scaleI = scales[f.solidIndex] ?? 1;
    const scaleAtFace = usePerspective ? (viewportScale * zoom) / Math.max(1e-6, f.depth) : (viewportScale * zoom);
    const cornerRWorld = cornerRadiusVal * scaleAtFace * scaleI;
    const targetInset2D = worldInsetRef * scaleAtFace * scaleI;
    const pts = f.proj.map((p) => [p[0], p[1]]);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let pathD;
    let fillPts = pts;
    if (cornerRadiusVal > 1e-6 && f.worldVerts && f.worldVerts.length >= 3) {
      const r3d = cornerRadiusVal * scaleI;
      const cropped = cropAtVertex3DAndProject(f.worldVerts, r3d, project, camPos, camTarget, zoom, viewportScale);
      if (cropped) {
        fillPts = cropped.points2d;
        pathD = cropped.pathD;
        if (targetInset2D > 1e-6) {
          const cxf = fillPts.reduce((s, p) => s + p[0], 0) / fillPts.length;
          const cyf = fillPts.reduce((s, p) => s + p[1], 0) / fillPts.length;
          const minDist = Math.min(...fillPts.map((p) => Math.hypot(p[0] - cxf, p[1] - cyf)), Infinity);
          const s = minDist > 1e-10
            ? Math.max(1e-6, 1 - targetInset2D / minDist)
            : 1;
          const sCapped = cornerRWorld > 0 && minDist > 1e-10 ? Math.min(s, 1 - cornerRWorld / minDist) : s;
          fillPts = scalePolygonAboutCenter2D(fillPts, sCapped);
          pathD = roundPathIn2D(fillPts, 0);
        }
      } else {
        fillPts = pts;
        if (targetInset2D > 1e-6) {
          const minDist = Math.min(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)), Infinity);
          const s = minDist > 1e-10 ? Math.max(1e-6, 1 - targetInset2D / minDist) : 1;
          const sCapped = cornerRWorld > 0 && minDist > 1e-10 ? Math.min(s, 1 - cornerRWorld / minDist) : s;
          fillPts = scalePolygonAboutCenter2D(pts, sCapped);
        }
        pathD = roundPathIn2D(fillPts, effectiveCornerRadius(fillPts, cornerRWorld));
      }
    } else {
      if (targetInset2D > 1e-6) {
        const minDist = Math.min(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)), Infinity);
        const s = minDist > 1e-10 ? Math.max(1e-6, 1 - targetInset2D / minDist) : 1;
        const sCapped = cornerRWorld > 0 && minDist > 1e-10 ? Math.min(s, 1 - cornerRWorld / minDist) : s;
        fillPts = scalePolygonAboutCenter2D(pts, sCapped);
      }
      pathD = roundPathIn2D(fillPts, effectiveCornerRadius(fillPts, cornerRWorld));
    }
    const viewDot = f.normal[0] * viewDir[0] + f.normal[1] * viewDir[1] + f.normal[2] * viewDir[2];
    facePathData.push({ d: pathD, front: f.front, depth: f.depth, solidIndex: f.solidIndex, faceIndex: f.faceIndex, normal: f.normal, centerX: cx, centerY: cy, viewDot });
  }

  const { rx, ry, rz, ux2, uy2, uz2 } = basis;

  const maxViewDotBySolid = {};
  facePathData.forEach((fp) => {
    maxViewDotBySolid[fp.solidIndex] = Math.max(maxViewDotBySolid[fp.solidIndex] ?? -1, fp.viewDot ?? 0);
  });

  /** Per-face opacity: true if face fill is effectively opaque (alpha >= 0.99). Used to build occlusion for outside-layer override visibility. */
  const opacityByIndex = [];
  facePathData.forEach((fp, idx) => {
    const solidId = list[fp.solidIndex].id;
    const style = styleBySolid[solidId];
    const isInner = (fp.viewDot ?? 1) < (maxViewDotBySolid[fp.solidIndex] ?? 1) - 0.01;
    const useGlobal = (state.useGlobalForSolid && state.useGlobalForSolid[solidId]) !== false;
    const useGradientInner = state.useGradient && useGlobal && isInner && (state.gradientInnerFill != null || state.gradientInnerStroke != null);
    const fillColorForFace = useGradientInner && state.gradientInnerFill ? state.gradientInnerFill : (style.fillColor || DEFAULT_FILL_COLOR);
    const alpha = parseRgba(fillColorForFace).a;
    opacityByIndex[idx] = alpha >= 0.99;
  });

  const facePaths = [];
  facePathData.forEach((fp, i) => {
    const solidId = list[fp.solidIndex].id;
    const style = styleBySolid[solidId];
    const lighting = lightingBySolid[solidId];
    const lightAz = (lighting.lightAzimuth ?? 0.6) * Math.PI * 2;
    const lightEl = (lighting.lightElevation ?? 0.5) * Math.PI * 0.5;
    const lightDir = [
      Math.cos(lightEl) * Math.cos(lightAz),
      Math.sin(lightEl),
      Math.cos(lightEl) * Math.sin(lightAz),
    ];
    const light2Dx = lightDir[0] * rx + lightDir[1] * ry + lightDir[2] * rz;
    const light2Dy = lightDir[0] * ux2 + lightDir[1] * uy2 + lightDir[2] * uz2;
    const light2Dlen = Math.hypot(light2Dx, light2Dy) || 1;
    const l2dx = (light2Dx / light2Dlen) * 80;
    const l2dy = (light2Dy / light2Dlen) * 80;
    const ambient = lighting.ambientIntensity ?? 0.4;
    const gradientMode = lighting.gradientMode || 'averaged';
    const lightingNone = gradientMode === 'none';

    const isInner = (fp.viewDot ?? 1) < (maxViewDotBySolid[fp.solidIndex] ?? 1) - 0.01;
    const useGlobal = (state.useGlobalForSolid && state.useGlobalForSolid[solidId]) !== false;
    const scaleI = scales[fp.solidIndex] ?? 1;
    const scaleAtFace = usePerspective ? (viewportScale * zoom) / Math.max(1e-6, fp.depth) : (viewportScale * zoom);

    /** Outside layer override: apply to faces we see (normal toward camera, viewDot < 0). viewDir = target−camera points into scene. */
    const isOuterFacing = (fp.viewDot ?? 0) < 0;
    const useOutsideLayerOverride = state.outsideLayerOverrideEnabled && useGlobal && isOuterFacing && (state.outsideLayerOverrideRgba || 'rgba(255,200,100,0.85)');
    if (useOutsideLayerOverride) {
      const overrideRgba = state.outsideLayerOverrideRgba || 'rgba(255,200,100,0.85)';
      const overrideParsed = parseRgba(overrideRgba);
      const intensity = Math.max(0, fp.normal[0] * lightDir[0] + fp.normal[1] * lightDir[1] + fp.normal[2] * lightDir[2]);
      const bright = ambient + (1 - ambient) * intensity;
      let fill;
      if (lightingNone) {
        fill = toRgbaCss(overrideParsed.r, overrideParsed.g, overrideParsed.b, overrideParsed.a);
      } else if (gradientMode === 'perFaceGradient') {
        const darkR = overrideParsed.r * 0.4, darkG = overrideParsed.g * 0.4, darkB = overrideParsed.b * 0.4;
        const lightR = overrideParsed.r * bright, lightG = overrideParsed.g * bright, lightB = overrideParsed.b * bright;
        fill = { type: 'gradient', x1: (fp.centerX ?? 0) - l2dx, y1: (fp.centerY ?? 0) - l2dy, x2: (fp.centerX ?? 0) + l2dx, y2: (fp.centerY ?? 0) + l2dy, dark: toRgbaCss(darkR, darkG, darkB, overrideParsed.a), light: toRgbaCss(lightR, lightG, lightB, overrideParsed.a) };
      } else {
        const r = overrideParsed.r * bright, g = overrideParsed.g * bright, b = overrideParsed.b * bright;
        fill = toRgbaCss(r, g, b, overrideParsed.a);
      }
      let strokeR = overrideParsed.r, strokeG = overrideParsed.g, strokeB = overrideParsed.b;
      if (!lightingNone && style.faceStrokeWidth > 0) {
        strokeR *= bright;
        strokeG *= bright;
        strokeB *= bright;
      }
      const strokeWidth = style.faceStrokeWidth > 0 ? (style.faceStrokeWidth || 0.02) * scaleAtFace * scaleI : 0;
      /** Occlusion paths: only front-facing opaque faces in front (higher index); never use back-facing paths so outer faces are never punched. */
      const occlusionPaths = [];
      for (let j = i + 1; j < facePathData.length; j++) {
        if (!opacityByIndex[j] || !facePathData[j].front) continue;
        const od = facePathData[j].d;
        if (od != null && String(od).trim()) occlusionPaths.push(od);
      }
      facePaths.push({
        d: fp.d,
        fill,
        stroke: style.faceStrokeWidth > 0 ? toRgbaCss(strokeR, strokeG, strokeB, overrideParsed.a) : null,
        strokeWidth,
        occlusionPaths: occlusionPaths.length ? occlusionPaths : undefined,
      });
      return;
    }

    const useGradientInner = state.useGradient && useGlobal && isInner && (state.gradientInnerFill != null || state.gradientInnerStroke != null);
    const fillColorForFace = useGradientInner && state.gradientInnerFill ? state.gradientInnerFill : (style.fillColor || DEFAULT_FILL_COLOR);
    const strokeColorForFace = useGradientInner && state.gradientInnerStroke ? state.gradientInnerStroke : (style.faceStrokeColor || DEFAULT_STROKE_COLOR);
    const fillParsed = parseRgba(fillColorForFace);
    const strokeParsed = parseRgba(strokeColorForFace);
    const intensity = Math.max(0, fp.normal[0] * lightDir[0] + fp.normal[1] * lightDir[1] + fp.normal[2] * lightDir[2]);
    const bright = ambient + (1 - ambient) * intensity;
    const vibrancy = (state.innerFaceVibrancy ?? 0) * 0.45;
    const satFactor = (isInner && useGlobal && vibrancy > 0) ? (1 + vibrancy) : 1;

    let fill;
    if (lightingNone) {
      fill = toRgbaCss(fillParsed.r, fillParsed.g, fillParsed.b, fillParsed.a);
    } else if (gradientMode === 'perFaceGradient') {
      let darkR = fillParsed.r * 0.4, darkG = fillParsed.g * 0.4, darkB = fillParsed.b * 0.4;
      let lightR = fillParsed.r * bright, lightG = fillParsed.g * bright, lightB = fillParsed.b * bright;
      if (isInner) {
        const darkBst = applySaturation(darkR, darkG, darkB, satFactor);
        const lightBst = applySaturation(lightR, lightG, lightB, satFactor);
        darkR = darkBst.r; darkG = darkBst.g; darkB = darkBst.b;
        lightR = lightBst.r; lightG = lightBst.g; lightB = lightBst.b;
      }
      fill = { type: 'gradient', x1: (fp.centerX ?? 0) - l2dx, y1: (fp.centerY ?? 0) - l2dy, x2: (fp.centerX ?? 0) + l2dx, y2: (fp.centerY ?? 0) + l2dy, dark: toRgbaCss(darkR, darkG, darkB, fillParsed.a), light: toRgbaCss(lightR, lightG, lightB, fillParsed.a) };
    } else {
      let r = fillParsed.r * bright, g = fillParsed.g * bright, b = fillParsed.b * bright;
      if (isInner) {
        const boosted = applySaturation(r, g, b, satFactor);
        r = boosted.r; g = boosted.g; b = boosted.b;
      }
      fill = toRgbaCss(r, g, b, fillParsed.a);
    }
    let strokeR = strokeParsed.r, strokeG = strokeParsed.g, strokeB = strokeParsed.b;
    if (!lightingNone && style.faceStrokeWidth > 0 && isInner && satFactor > 1) {
      const strokeBst = applySaturation(strokeR, strokeG, strokeB, satFactor);
      strokeR = strokeBst.r; strokeG = strokeBst.g; strokeB = strokeBst.b;
    }
    const strokeWidth = style.faceStrokeWidth > 0 ? (style.faceStrokeWidth || 0.02) * scaleAtFace * scaleI : 0;
    facePaths.push({
      d: fp.d,
      fill,
      stroke: style.faceStrokeWidth > 0 ? toRgbaCss(strokeR, strokeG, strokeB, strokeParsed.a) : null,
      strokeWidth,
    });
  });

  let silhouettePaths = [];
  list.forEach(({ id, solid }, solidIndex) => {
    const preset = (state.solidOrientations && state.solidOrientations[id]) || state.rotationPreset || 'isometric';
    const pos = positions[solidIndex] || [0, 0, 0];
    const scaleI = scales[solidIndex] ?? 1;
    const localVerts = applyRotationToVertices(solid.vertices, preset, id, orientationDelta);
    const worldVerts = localVerts.map(([x, y, z]) => [pos[0] + scaleI * x, pos[1] + scaleI * y, pos[2] + scaleI * z]);
    const verts = applyEulerToVertices(worldVerts, modelRotX, modelRotY, 0);
    const edgeList = solid.edges;
    const adj = solid.faceAdjacency;
    const normals = solid.faces.map((face) => faceNormal(verts, face));
    const silEdges = [];
    for (let e = 0; e < edgeList.length; e++) {
      const [i, j] = edgeList[e];
      const [f0, f1] = adj[e] || [];
      if (f0 == null || f1 == null) continue;
      const v0 = isFrontFacing(normals[f0], viewDir);
      const v1 = isFrontFacing(normals[f1], viewDir);
      if (v0 !== v1) {
        const p0 = project(verts[i], camPos, camTarget, zoom, viewportScale);
        const p1 = project(verts[j], camPos, camTarget, zoom, viewportScale);
        silEdges.push({ p0: [p0[0], p0[1]], p1: [p1[0], p1[1]] });
      }
    }
    const used = new Set();
    while (silEdges.some((_, idx) => !used.has(idx))) {
      const startIdx = silEdges.findIndex((_, i) => !used.has(i));
      if (startIdx < 0) break;
      const loop = [];
      let current = silEdges[startIdx];
      let currentIdx = startIdx;
      let at = current.p1;
      loop.push(current.p0, current.p1);
      used.add(currentIdx);
      for (;;) {
        const nextIdx = silEdges.findIndex((e, i) => {
          if (used.has(i)) return false;
          return Math.hypot(e.p0[0] - at[0], e.p0[1] - at[1]) < 1e-4 || Math.hypot(e.p1[0] - at[0], e.p1[1] - at[1]) < 1e-4;
        });
        if (nextIdx < 0) break;
        const next = silEdges[nextIdx];
        const d0 = Math.hypot(next.p0[0] - at[0], next.p0[1] - at[1]);
        at = d0 < 1e-4 ? next.p1 : next.p0;
        loop.push(at);
        used.add(nextIdx);
        currentIdx = nextIdx;
        current = next;
      }
      const simplified = simplifySilhouetteLoop(loop);
      if (simplified.length >= 3) {
        const area = Math.abs(polygonAreaSigned(simplified));
        const perim = simplified.reduce((s, p, i) => {
          const next = simplified[(i + 1) % simplified.length];
          return s + Math.hypot(next[0] - p[0], next[1] - p[1]);
        }, 0);
        if (perim > 1e-10 && area > 1e-8 * perim * perim) silhouettePaths.push(simplified);
      }
    }
  });

  const cx = (w - 2 * pad) / 2 + pad;
  const cy = (h - 2 * pad) / 2 + pad;

  const result = {
    width: w,
    height: h,
    cx,
    cy,
    viewportScale,
    zoom,
    facePaths,
    silhouettePaths,
    background: (state.exportBackground && String(state.exportBackground).trim().toLowerCase() !== 'transparent') ? normalizeToRgba(state.exportBackground) : null,
  };
  flattenedViewCache = { fingerprint, viewportKey, result };
  return result;
}

export function exportSVG(state) {
  const flat = getFlattenedView(state);
  const { width: w, height: h, cx, cy, facePaths, silhouettePaths, background } = flat;
  const viewportScale = flat.viewportScale;
  const zoom = flat.zoom;
  const pad = (state.exportPadding ?? 40);

  const defs = [];
  const faceElements = [];
  facePaths.forEach((fp, idx) => {
    let fillAttr = typeof fp.fill === 'string' ? fp.fill : fp.fill.light;
    if (typeof fp.fill === 'object' && fp.fill.type === 'gradient') {
      const id = `grad-${idx}`;
      defs.push(`<linearGradient id="${id}" x1="${fmt(fp.fill.x1)}" y1="${fmt(fp.fill.y1)}" x2="${fmt(fp.fill.x2)}" y2="${fmt(fp.fill.y2)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${fp.fill.dark}"/><stop offset="1" stop-color="${fp.fill.light}"/></linearGradient>`);
      fillAttr = `url(#${id})`;
    }
    const stroke = fp.strokeWidth > 0 ? `stroke="${fp.stroke}" stroke-width="${fmt(fp.strokeWidth)}"` : '';
    let maskAttr = '';
    if (fp.occlusionPaths && fp.occlusionPaths.length > 0) {
      const maskId = `inner-mask-${idx}`;
      const maskPaths = fp.occlusionPaths.map((od) => `<path d="${od}" fill="black"/>`).join('');
      const r = Math.max(w, h) * 2;
      defs.push(`<mask id="${maskId}" maskContentUnits="userSpaceOnUse"><rect x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" fill="white"/>${maskPaths}</mask>`);
      maskAttr = ` mask="url(#${maskId})"`;
    }
    faceElements.push(`<path fill="${fillAttr}" ${stroke} stroke-linejoin="round" d="${fp.d}"${maskAttr}/>`);
  });

  const contentTransform = `translate(${fmt(cx)} ${fmt(cy)}) scale(1 -1)`;
  const facesGroup = `<g id="faces" transform="${contentTransform}">${faceElements.join('')}</g>`;
  const bg = background ? `<rect width="100%" height="100%" fill="${background}"/>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>${defs.join('')}</defs>
  ${bg}
  <g id="content">${facesGroup}</g>
</svg>`;
}
