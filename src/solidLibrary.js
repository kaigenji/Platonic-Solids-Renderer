/**
 * Model layer: canonical Platonic solids (vertices, faces, edges, face adjacency, presets).
 */

const φ = (1 + Math.sqrt(5)) / 2;

function normalizeToSphere(vertices, targetRadius = 1) {
  const maxNorm = Math.max(
    ...vertices.map(([x, y, z]) => Math.sqrt(x * x + y * y + z * z))
  );
  if (maxNorm === 0) return vertices;
  const s = targetRadius / maxNorm;
  return vertices.map(([x, y, z]) => [x * s, y * s, z * s]);
}

function buildEdgesFromFaces(faces) {
  const edgeSet = new Set();
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      edgeSet.add(JSON.stringify([Math.min(a, b), Math.max(a, b)]));
    }
  }
  return Array.from(edgeSet).map((s) => JSON.parse(s));
}

function buildFaceAdjacency(faces, edges) {
  const edgeToFaces = new Map();
  for (const e of edges) {
    edgeToFaces.set(JSON.stringify(e), []);
  }
  for (let fi = 0; fi < faces.length; fi++) {
    const face = faces[fi];
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = JSON.stringify([Math.min(a, b), Math.max(a, b)]);
      if (edgeToFaces.has(key)) edgeToFaces.get(key).push(fi);
    }
  }
  return edges.map((e) => edgeToFaces.get(JSON.stringify(e)));
}

const isoX = Math.atan(1 / Math.sqrt(2));

/**
 * All orientation angles in radians; preset names and labels use simple English.
 * Sword preset uses per-solid angles (see LINEAR_SWORD_ORIENTATIONS).
 */
const π = Math.PI;
const tiltHeroX = -0.5;
const tiltHeroY = 0.4;
const tilt3Q = -0.45;
const tilt3QHigh = -0.7;
const tilt3QLow = -0.25;
const tiltStack = -0.65;
const tiltRow = -0.6;
const edgeTilt = 0.35;
const crownTilt = 0.2;

/** Per-solid orientations for Linear (sword): radians, XYZ order. Tetra tip inverted along axis, cube flush, octa tip into dodeca, dodeca/icosa faces perpendicular to axis and parallel to each other. */
const LINEAR_SWORD_ORIENTATIONS = {
  tetrahedron: { x: 0, y: Math.atan(1 / Math.sqrt(2)) + π, z: -π / 4 },
  cube: { x: 0, y: 0, z: 0 },
  octahedron: { x: 0, y: 0, z: 0 },
  dodecahedron: { x: 0, y: π / 2, z: 0 },
  icosahedron: { x: 0, y: π / 2, z: 0 },
};

/** Icosahedron vertex (φ, 0, 1) normalized; we rotate so this points along (1,1,1) then apply isometric. */
function rotationMatrixAlignVectorToTarget(ax, ay, az, bx, by, bz) {
  const alen = Math.hypot(ax, ay, az) || 1;
  const blen = Math.hypot(bx, by, bz) || 1;
  const [vx, vy, vz] = [ax / alen, ay / alen, az / alen];
  const [ux, uy, uz] = [bx / blen, by / blen, bz / blen];
  const dot = vx * ux + vy * uy + vz * uz;
  const [kx, ky, kz] = [vy * uz - vz * uy, vz * ux - vx * uz, vx * uy - vy * ux];
  const klen = Math.hypot(kx, ky, kz);
  if (klen < 1e-10) {
    if (dot > 0) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const [nx, ny, nz] = Math.abs(vx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const [tx, ty, tz] = [vy * nz - vz * ny, vz * nx - vx * nz, vx * ny - vy * nx];
    const tlen = Math.hypot(tx, ty, tz) || 1;
    return [
      [2 * nx * nx - 1, 2 * nx * ny, 2 * nx * nz],
      [2 * ny * nx, 2 * ny * ny - 1, 2 * ny * nz],
      [2 * nz * nx, 2 * nz * ny, 2 * nz * nz - 1],
    ];
  }
  const [cx, cy, cz] = [kx / klen, ky / klen, kz / klen];
  const s = Math.sin(Math.acos(Math.max(-1, Math.min(1, dot))));
  const c = dot;
  return [
    [cx * cx * (1 - c) + c, cx * cy * (1 - c) - cz * s, cx * cz * (1 - c) + cy * s],
    [cy * cx * (1 - c) + cz * s, cy * cy * (1 - c) + c, cy * cz * (1 - c) - cx * s],
    [cz * cx * (1 - c) - cy * s, cz * cy * (1 - c) + cx * s, cz * cz * (1 - c) + c],
  ];
}

function rotationMatrixToEulerXYZ(M) {
  const sy = M[0][2];
  const cy = Math.sqrt(1 - sy * sy) || 1e-10;
  const ex = Math.atan2(-M[1][2] / cy, M[2][2] / cy);
  const ez = Math.atan2(-M[0][1] / cy, M[0][0] / cy);
  const ey = Math.asin(Math.max(-1, Math.min(1, sy)));
  return { x: ex, y: ey, z: ez };
}

function matrixMultiply(A, B) {
  return [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0] + A[0][2] * B[2][0], A[0][0] * B[0][1] + A[0][1] * B[1][1] + A[0][2] * B[2][1], A[0][0] * B[0][2] + A[0][1] * B[1][2] + A[0][2] * B[2][2]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0] + A[1][2] * B[2][0], A[1][0] * B[0][1] + A[1][1] * B[1][1] + A[1][2] * B[2][1], A[1][0] * B[0][2] + A[1][1] * B[1][2] + A[1][2] * B[2][2]],
    [A[2][0] * B[0][0] + A[2][1] * B[1][0] + A[2][2] * B[2][0], A[2][0] * B[0][1] + A[2][1] * B[1][1] + A[2][2] * B[2][1], A[2][0] * B[0][2] + A[2][1] * B[1][2] + A[2][2] * B[2][2]],
  ];
}

/** Outward face normal from vertices and face indices; center assumed at origin. */
function faceNormalOutward(vertices, face) {
  const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
  const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
  const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
  let nx = vy * wz - vz * wy, ny = vz * wx - vx * wz, nz = vx * wy - vy * wx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const cx = face.reduce((s, i) => s + vertices[i][0], 0) / face.length;
  const cy = face.reduce((s, i) => s + vertices[i][1], 0) / face.length;
  const cz = face.reduce((s, i) => s + vertices[i][2], 0) / face.length;
  if (nx * cx + ny * cy + nz * cz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  return [nx, ny, nz];
}

const R_iso = (() => {
  const M = eulerToRotationMatrix(-isoX, π / 4, 0);
  return M;
})();

/** Tetrahedron: flat on XY (apex (1,1,1) → (0,0,1)), then isometric view; ez so base edge is horizontal and projection symmetric. */
const isoTetraFlat = (() => {
  const R_flat = rotationMatrixAlignVectorToTarget(1, 1, 1, 0, 0, 1);
  const R_full = matrixMultiply(R_iso, R_flat);
  const R_z = eulerToRotationMatrix(0, 0, π / 4);
  const R_final = matrixMultiply(R_full, R_z);
  return rotationMatrixToEulerXYZ(R_final);
})();

const isoIcosaVertex = (() => {
  const R1 = rotationMatrixAlignVectorToTarget(φ, 0, 1, 1, 1, 1);
  const R_full = matrixMultiply(R_iso, R1);
  const R_base = rotationMatrixToEulerXYZ(R_full);
  const R_z = eulerToRotationMatrix(0, 0, π / 5);
  const R_final = matrixMultiply(eulerToRotationMatrix(R_base.x, R_base.y, R_base.z), R_z);
  return rotationMatrixToEulerXYZ(R_final);
})();

/** Per-solid isometric: flat on XY for tetra/cube/dodeca; same 45°+35.264° view; symmetric projection (ez tuned). Octa/icosa: ez for symmetric silhouette. */
const ISOMETRIC_ORIENTATIONS = {
  tetrahedron: { x: isoTetraFlat.x, y: isoTetraFlat.y, z: isoTetraFlat.z },
  cube: { x: -isoX, y: π / 4, z: 0 },
  octahedron: { x: -isoX, y: π / 4, z: π / 4 },
  dodecahedron: { x: -isoX, y: π / 4, z: 0 },
  icosahedron: { x: isoIcosaVertex.x, y: isoIcosaVertex.y, z: isoIcosaVertex.z },
};

export const ORIENTATION_PRESETS = {
  isometric: { x: -isoX, y: π / 4, z: 0 },
  isometric2: { x: -isoX, y: -π / 4, z: 0 },
  isometric3: { x: -isoX, y: (3 * π) / 4, z: 0 },
  isometric4: { x: -isoX, y: (-3 * π) / 4, z: 0 },
  isometricTop: { x: isoX, y: π / 4, z: 0 },
  isometricBottom: { x: isoX, y: -π / 4, z: 0 },
  front: { x: 0, y: 0, z: 0 },
  top: { x: -π / 2, y: 0, z: 0 },
  hero: { x: tiltHeroX, y: tiltHeroY, z: 0 },
  threeQuarterLeft: { x: tilt3Q, y: -π / 4, z: 0 },
  threeQuarterRight: { x: tilt3Q, y: π / 4, z: 0 },
  threeQuarterLeftHigh: { x: tilt3QHigh, y: -π / 4, z: 0 },
  threeQuarterRightHigh: { x: tilt3QHigh, y: π / 4, z: 0 },
  threeQuarterLeftLow: { x: tilt3QLow, y: -π / 4, z: 0 },
  threeQuarterRightLow: { x: tilt3QLow, y: π / 4, z: 0 },
  // Linear / stacked: symmetric orientations that look good in a row or column
  /** Sword: tetra tip along axis, cube flush, octa tip into dodeca, dodeca/icosa parallel faces. Uses per-solid angles. */
  linearSword: LINEAR_SWORD_ORIENTATIONS.tetrahedron,
  /** Uniform tilt so all solids share the same “spine” when stacked. */
  linearStack: { x: tiltStack, y: 0, z: 0 },
  /** Slightly rotated stack for a gentle row. */
  linearRow: { x: tiltRow, y: π / 6, z: 0 },
  /** Edge-on alignment for a flat, symmetric line. */
  linearEdge: { x: -π / 2 + edgeTilt, y: 0, z: 0 },
  /** Top-down with small tilt so shapes don’t flatten. */
  linearCrown: { x: -π / 2 + crownTilt, y: π / 4, z: 0 },
};

export function eulerToRotationMatrix(ex, ey, ez) {
  const cx = Math.cos(ex), sx = Math.sin(ex);
  const cy = Math.cos(ey), sy = Math.sin(ey);
  const cz = Math.cos(ez), sz = Math.sin(ez);
  return [
    [cy * cz, -cy * sz, sy],
    [sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy],
    [-cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy],
  ];
}

/**
 * Resolve orientation angles for a solid. Uses per-solid angles for 'linearSword' and 'isometric'.
 */
export function getOrientationAngles(presetName, solidId) {
  if (presetName === 'linearSword' && solidId && LINEAR_SWORD_ORIENTATIONS[solidId]) {
    return LINEAR_SWORD_ORIENTATIONS[solidId];
  }
  if (presetName === 'isometric' && solidId) {
    if (solidId === 'dodecahedron') return getIsoDodecaOrientation();
    if (ISOMETRIC_ORIENTATIONS[solidId]) return ISOMETRIC_ORIENTATIONS[solidId];
  }
  return ORIENTATION_PRESETS[presetName] || ORIENTATION_PRESETS.isometric;
}

/**
 * Apply preset orientation + optional delta (radians) to vertices.
 * When orientationDelta is provided, it is added to the preset angles so all shapes can be rotated in place by the same amount.
 */
export function applyRotationToVertices(vertices, presetName, solidId = null, orientationDelta = null) {
  const preset = getOrientationAngles(presetName, solidId);
  const dx = orientationDelta?.x ?? 0;
  const dy = orientationDelta?.y ?? 0;
  const dz = orientationDelta?.z ?? 0;
  const ex = preset.x + dx;
  const ey = preset.y + dy;
  const ez = preset.z + dz;
  const M = eulerToRotationMatrix(ex, ey, ez);
  return vertices.map(([x, y, z]) => [
    M[0][0] * x + M[0][1] * y + M[0][2] * z,
    M[1][0] * x + M[1][1] * y + M[1][2] * z,
    M[2][0] * x + M[2][1] * y + M[2][2] * z,
  ]);
}

/** Apply euler angles (radians, XYZ order) to vertices. */
export function applyEulerToVertices(vertices, ex, ey, ez) {
  const M = eulerToRotationMatrix(ex, ey, ez);
  return vertices.map(([x, y, z]) => [
    M[0][0] * x + M[0][1] * y + M[0][2] * z,
    M[1][0] * x + M[1][1] * y + M[1][2] * z,
    M[2][0] * x + M[2][1] * y + M[2][2] * z,
  ]);
}

function makeSolid(vertices, faces) {
  const V = normalizeToSphere(vertices);
  const edges = buildEdgesFromFaces(faces);
  const faceAdjacency = buildFaceAdjacency(faces, edges);
  return { vertices: V, faces, edges, faceAdjacency };
}

const tetraVertices = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
const tetraFaces = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]];

const cubeVertices = [
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
];
const cubeFaces = [
  [0, 2, 3, 1], [0, 4, 6, 2], [0, 1, 5, 4],
  [7, 6, 4, 5], [7, 3, 2, 6], [7, 5, 1, 3],
];

const octaVertices = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const octaFaces = [
  [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
  [1, 4, 2], [1, 2, 5], [1, 5, 3], [1, 3, 4],
];

const dodecaR = 1 / φ;
const dodecaVertices = [
  [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
  [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
  [0, -dodecaR, -φ], [0, -dodecaR, φ], [0, dodecaR, -φ], [0, dodecaR, φ],
  [-dodecaR, -φ, 0], [-dodecaR, φ, 0], [dodecaR, -φ, 0], [dodecaR, φ, 0],
  [-φ, 0, -dodecaR], [φ, 0, -dodecaR], [-φ, 0, dodecaR], [φ, 0, dodecaR],
];
const dodecaTriangles = [
  3, 11, 7, 3, 7, 15, 3, 15, 13,
  7, 19, 17, 7, 17, 6, 7, 6, 15,
  17, 4, 8, 17, 8, 10, 17, 10, 6,
  8, 0, 16, 8, 16, 2, 8, 2, 10,
  0, 12, 1, 0, 1, 18, 0, 18, 16,
  6, 10, 2, 6, 2, 13, 6, 13, 15,
  2, 16, 18, 2, 18, 3, 2, 3, 13,
  18, 1, 9, 18, 9, 11, 18, 11, 3,
  4, 14, 12, 4, 12, 0, 4, 0, 8,
  11, 9, 5, 11, 5, 19, 11, 19, 7,
  19, 5, 14, 19, 14, 4, 19, 4, 17,
  1, 12, 14, 1, 14, 5, 1, 5, 9,
];
const dodecaFaces = [];
for (let i = 0; i < 12; i++) {
  const a = dodecaTriangles[i * 9], b = dodecaTriangles[i * 9 + 1], c = dodecaTriangles[i * 9 + 2];
  const d = dodecaTriangles[i * 9 + 5], e = dodecaTriangles[i * 9 + 8];
  dodecaFaces.push([a, b, c, d, e]);
}

const icosaVertices = [
  [-1, φ, 0], [1, φ, 0], [-1, -φ, 0], [1, -φ, 0],
  [0, -1, φ], [0, 1, φ], [0, -1, -φ], [0, 1, -φ],
  [φ, 0, -1], [φ, 0, 1], [-φ, 0, -1], [-φ, 0, 1],
];
const icosaIndices = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
  1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
  3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
  4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
];
const icosaFaces = [];
for (let i = 0; i < 20; i++) {
  icosaFaces.push([icosaIndices[i * 3], icosaIndices[i * 3 + 1], icosaIndices[i * 3 + 2]]);
}

export const SOLID_IDS = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron'];

const rawSolids = {
  tetrahedron: makeSolid(tetraVertices, tetraFaces),
  cube: makeSolid(cubeVertices, cubeFaces),
  octahedron: makeSolid(octaVertices, octaFaces),
  dodecahedron: makeSolid(dodecaVertices, dodecaFaces),
  icosahedron: makeSolid(icosaVertices, icosaFaces),
};

export function getSolid(id) {
  return rawSolids[id] || null;
}

let _isoDodecaCache = null;
function getIsoDodecaOrientation() {
  if (_isoDodecaCache) return _isoDodecaCache;
  const solid = getSolid('dodecahedron');
  if (!solid || !solid.faces.length) {
    _isoDodecaCache = { x: -isoX, y: π / 4, z: 0 };
    return _isoDodecaCache;
  }
  const normal = faceNormalOutward(solid.vertices, solid.faces[0]);
  const R_flat = rotationMatrixAlignVectorToTarget(normal[0], normal[1], normal[2], 0, 0, -1);
  const R_full = matrixMultiply(R_iso, R_flat);
  const R_z = eulerToRotationMatrix(0, 0, π / 5);
  const R_final = matrixMultiply(R_full, R_z);
  _isoDodecaCache = rotationMatrixToEulerXYZ(R_final);
  return _isoDodecaCache;
}

export function getSolidsForIds(ids) {
  const seen = new Set();
  const list = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const solid = getSolid(id);
    if (solid) list.push({ id, solid });
  }
  return list;
}

export function getArrangementPositions(ids, arrangement, spacing, circleRadius, scales = null) {
  const n = ids.length;
  if (n === 0) return [];
  if (arrangement === 'line') {
    if (scales && scales.length === n) {
      let x = 0;
      const positions = [];
      for (let i = 0; i < n; i++) {
        positions.push([x, 0, 0]);
        x += spacing * (scales[i] ?? 1);
      }
      const mid = (positions[0][0] + positions[n - 1][0]) / 2;
      positions.forEach((p) => { p[0] -= mid; });
      return positions;
    }
    return ids.map((_, i) => [(i - (n - 1) / 2) * spacing, 0, 0]);
  }
  const positions = [];
  for (let i = 0; i < n; i++) {
    const θ = (i / n) * 2 * Math.PI;
    positions.push([circleRadius * Math.cos(θ), circleRadius * Math.sin(θ), 0]);
  }
  return positions;
}

/** Per-solid scale for perspective distortion: scale_i = e^(i * k). distortion 0 = all 1; positive = first small, last large; negative = first large, last small. */
export function getPerspectiveScales(n, perspectiveDistortion) {
  if (n === 0) return [];
  if (Math.abs(perspectiveDistortion ?? 0) < 1e-10) return new Array(n).fill(1);
  const baseRate = Math.log(100) / Math.max(1, n - 1);
  const k = perspectiveDistortion * baseRate;
  return Array.from({ length: n }, (_, i) => Math.exp(i * k));
}

/** Canonical arrangement for current state: ids, per-solid scales, and positions. Single source of truth for scene and export. */
export function getArrangement(state) {
  const ids = state.selectedSolidIds || [];
  const scales = getPerspectiveScales(ids.length, state.perspectiveDistortion ?? 0);
  const positions = getArrangementPositions(
    ids,
    state.arrangement,
    state.spacing,
    state.circleRadius,
    scales
  );
  return { ids, scales, positions };
}
