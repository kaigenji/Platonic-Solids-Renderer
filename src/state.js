import { SOLID_IDS } from './solidLibrary.js';
import { deriveStrokeFromFill } from './colorUtils.js';
import { DEFAULT_FILL_COLOR, DEFAULT_STROKE_COLOR } from './constants.js';

export { DEFAULT_FILL_COLOR, DEFAULT_STROKE_COLOR };

/**
 * Single state object for the Platonic Solids SVG Snapshot Engine.
 */

export function createInitialState() {
  return {
    selectedSolidIds: [...SOLID_IDS],
    arrangement: 'line',
    spacing: 2.5,
    circleRadius: 3,
    perspectiveDistortion: 0,
    rotationPreset: 'isometric',
    solidOrientations: {},

    cameraMode: 'orthographic',
    zoom: 1,
    fovScale: 1,
    cameraPosition: [0, 0, 8],
    cameraTarget: [0, 0, 0],
    modelRotationX: 0,
    modelRotationY: 0,
    /** When non-zero, added to every solid's base orientation (preset) so all shapes rotate in place by the same amount. Used when holding Y and dragging. */
    orientationDeltaX: 0,
    orientationDeltaY: 0,
    fitToViewDone: false,

    fillColor: DEFAULT_FILL_COLOR,
    faceStrokeColor: DEFAULT_STROKE_COLOR,
    /** When false, effective stroke is derived from fillColor; when true, use faceStrokeColor. */
    strokeOverridden: false,
    faceStrokeWidth: 0.02,
    faceStrokeInset: 0,
    cornerRadius: 0.05,
    /** When true, fill/stroke are taken from gradient arrays by solid index (stroke inverse of fill); inner faces use gradientInnerFill/Stroke. */
    useGradient: false,
    gradientFillColors: [],
    gradientStrokeColors: [],
    /** Inner (back) face color when useGradient: derived from same base, monochrome. */
    gradientInnerFill: null,
    gradientInnerStroke: null,
    /** 0–1: boost saturation of faces seen from inside the polyhedron (global macro; only applies when solid uses global). */
    innerFaceVibrancy: 0,
    /** When true, outer (visible) faces use outsideLayerOverrideRgba for fill and stroke (global macro). */
    outsideLayerOverrideEnabled: false,
    /** RGBA string for outside layer override; when null and enabled, a default is used in exportLayer. */
    outsideLayerOverrideRgba: null,
    /** When true, solid uses global style/lighting; when false, solidOverrides[solidId] is used. */
    useGlobalForSolid: {},
    solidOverrides: {},

    lightingPreset: 'soft',
    lightAzimuth: 0.55,
    lightElevation: 0.45,
    ambientIntensity: 0.5,
    gradientMode: 'averaged',

    exportWidth: 800,
    exportHeight: 800,
    exportPadding: 40,
    exportBackground: 'rgba(0,0,0,1)',
    exportEachSolidSeparately: false,
    /** When true, exportWidth/exportHeight track viewport on resize; set false when user edits them. */
    exportDimensionsFollowViewport: true,

    /** Per-section lock: when true, that section's controls are disabled. Keys: 'scene'|'style'|'lighting'|'export', or 'orientation-{id}'|'style-{id}'|'lighting-{id}' for per-solid. */
    sectionLocks: {},
  };
}

export let state = createInitialState();

export function setState(updates) {
  Object.assign(state, updates);
  if (updates.selectedSolidIds && Array.isArray(state.selectedSolidIds)) {
    const seen = new Set();
    const deduped = state.selectedSolidIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    state.selectedSolidIds = deduped.length ? deduped : [state.selectedSolidIds[0] || 'tetrahedron'];
  }
}

export function getState() {
  return state;
}

function useGlobalForSolid(st, solidId) {
  const v = st.useGlobalForSolid && st.useGlobalForSolid[solidId];
  return v !== false;
}

/** True when every selected solid uses global style; global macros (gradient, inner face vibrancy) are locked when false. */
export function allSelectedSolidsUseGlobal(st) {
  const ids = st.selectedSolidIds || [];
  return ids.length > 0 && ids.every((id) => useGlobalForSolid(st, id));
}

/**
 * Resolve effective style for a solid: global when useGlobalForSolid[id], else solidOverrides[id] with fallback to global.
 * When useGradient is true (global style), fill/stroke come from gradient arrays by index in selectedSolidIds.
 * When useGradient is false, fill is from picker; stroke is derived from fill unless strokeOverridden.
 */
export function getStyleForSolid(st, solidId) {
  const o = st.solidOverrides && st.solidOverrides[solidId];
  const useGlobal = useGlobalForSolid(st, solidId);
  const ids = st.selectedSolidIds || [];
  const idx = ids.indexOf(solidId);

  if (useGlobal && st.useGradient && st.gradientFillColors && st.gradientStrokeColors) {
    const gradientFill = st.gradientFillColors[idx];
    const gradientStroke = st.gradientStrokeColors[idx];
    return {
      fillColor: gradientFill ?? st.fillColor,
      faceStrokeColor: gradientStroke ?? st.faceStrokeColor,
      faceStrokeWidth: st.faceStrokeWidth,
      faceStrokeInset: st.faceStrokeInset,
      cornerRadius: st.cornerRadius,
    };
  }

  const fillColor = useGlobal ? (st.fillColor || DEFAULT_FILL_COLOR) : (o?.fillColor ?? st.fillColor);
  const effectiveStroke = useGlobal && !st.strokeOverridden
    ? deriveStrokeFromFill(st.fillColor || DEFAULT_FILL_COLOR)
    : (useGlobal ? (st.faceStrokeColor || DEFAULT_STROKE_COLOR) : (o?.faceStrokeColor ?? st.faceStrokeColor));

  if (useGlobal) {
    return {
      fillColor,
      faceStrokeColor: effectiveStroke,
      faceStrokeWidth: st.faceStrokeWidth,
      faceStrokeInset: st.faceStrokeInset,
      cornerRadius: st.cornerRadius,
    };
  }
  return {
    fillColor: o?.fillColor ?? st.fillColor,
    faceStrokeColor: o?.faceStrokeColor ?? st.faceStrokeColor,
    faceStrokeWidth: o?.faceStrokeWidth ?? st.faceStrokeWidth,
    faceStrokeInset: o?.faceStrokeInset ?? st.faceStrokeInset,
    cornerRadius: o?.cornerRadius ?? st.cornerRadius,
  };
}

/**
 * Resolve effective lighting for a solid (for export). Global when useGlobalForSolid[id], else overrides with fallback.
 */
export function getLightingForSolid(st, solidId) {
  const o = st.solidOverrides && st.solidOverrides[solidId];
  const useGlobal = useGlobalForSolid(st, solidId);
  if (useGlobal)
    return {
      lightAzimuth: st.lightAzimuth ?? 0.55,
      lightElevation: st.lightElevation ?? 0.45,
      ambientIntensity: st.ambientIntensity ?? 0.5,
      gradientMode: st.gradientMode ?? 'averaged',
    };
  return {
    lightAzimuth: o?.lightAzimuth ?? st.lightAzimuth ?? 0.55,
    lightElevation: o?.lightElevation ?? st.lightElevation ?? 0.45,
    ambientIntensity: o?.ambientIntensity ?? st.ambientIntensity ?? 0.5,
    gradientMode: o?.gradientMode ?? st.gradientMode ?? 'averaged',
  };
}

/**
 * Copy all global style and lighting into solidOverrides for one solid (when turning off "use global" for that solid).
 */
export function copyGlobalToSolidOverrides(st, solidId) {
  const next = { ...(st.solidOverrides || {}) };
  const effectiveStroke = !st.strokeOverridden ? deriveStrokeFromFill(st.fillColor || DEFAULT_FILL_COLOR) : st.faceStrokeColor;
  next[solidId] = {
    ...(next[solidId] || {}),
    fillColor: st.fillColor,
    faceStrokeColor: effectiveStroke,
    faceStrokeWidth: st.faceStrokeWidth,
    faceStrokeInset: st.faceStrokeInset,
    cornerRadius: st.cornerRadius,
    lightingPreset: st.lightingPreset,
    lightAzimuth: st.lightAzimuth,
    lightElevation: st.lightElevation,
    ambientIntensity: st.ambientIntensity,
    gradientMode: st.gradientMode,
  };
  return next;
}
