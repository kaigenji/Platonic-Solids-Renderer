/**
 * UI overlay: collapsible sections (Scene, Style, Lighting, Export), monospaced, minimal.
 */

import { state, setState, getState, copyGlobalToSolidOverrides, allSelectedSolidsUseGlobal, DEFAULT_FILL_COLOR, DEFAULT_STROKE_COLOR } from './state.js';
import { MODEL_ROTATION_PRESETS, MODEL_ROTATION_PRESET_LABELS } from './constants.js';
import { SOLID_IDS, ORIENTATION_PRESETS } from './solidLibrary.js';
import { parseRgba, toRgbaCss, normalizeToRgba, rgbToHex, rgbToHsl, deriveStrokeFromFill } from './colorUtils.js';

/** Round to 2 decimal places for display and state. */
function round2(v) {
  const n = Number(v);
  return Number.isNaN(n) ? n : Math.round(n * 100) / 100;
}

function format2(v) {
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toFixed(2);
}

const ORIENTATION_PRESET_LABELS = {
  isometric: 'Isometric · front-right',
  isometric2: 'Isometric · front-left',
  isometric3: 'Isometric · back-right',
  isometric4: 'Isometric · back-left',
  isometricTop: 'Isometric · from above',
  isometricBottom: 'Isometric · from below',
  front: 'Front',
  top: 'Top',
  hero: 'Hero',
  threeQuarterLeft: '3/4 left',
  threeQuarterRight: '3/4 right',
  threeQuarterLeftHigh: '3/4 left (high)',
  threeQuarterRightHigh: '3/4 right (high)',
  threeQuarterLeftLow: '3/4 left (low)',
  threeQuarterRightLow: '3/4 right (low)',
  linearSword: 'Linear (sword)',
  linearStack: 'Linear (stack)',
  linearRow: 'Linear (row)',
  linearEdge: 'Linear (edge)',
  linearCrown: 'Linear (crown)',
};

let initialCameraState = null;
let onStateChange = () => {};

/** Lighting preset values for randomize (must match LIGHTING_PRESETS inside initUI). */
const LIGHTING_PRESETS_FOR_RANDOM = {
  soft: { lightAzimuth: 0.55, lightElevation: 0.45, ambientIntensity: 0.5, gradientMode: 'averaged' },
  studio: { lightAzimuth: 0.62, lightElevation: 0.35, ambientIntensity: 0.2, gradientMode: 'perFaceGradient' },
  dramatic: { lightAzimuth: 0.25, lightElevation: 0.7, ambientIntensity: 0.1, gradientMode: 'perFaceGradient' },
  rim: { lightAzimuth: 0.85, lightElevation: 0.15, ambientIntensity: 0.35, gradientMode: 'perFaceGradient' },
  flat: { lightAzimuth: 0.5, lightElevation: 0.5, ambientIntensity: 0.85, gradientMode: 'averaged' },
};

/** HSL (h 0–360, s,l 0–1) to r,g,b 0–1 */
function hslToRgb(h, s, l) {
  h = (h % 360 + 360) % 360 / 360;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [r, g, b];
}

/** Random alpha biased to ends: either very transparent (0–0.2) or very opaque (0.8–1), rarely in between. */
function randomAlphaBiasedToEnds() {
  return Math.random() < 0.5 ? Math.random() * 0.2 : 0.8 + Math.random() * 0.2;
}

/** Avoid double-negative: if both alphas are in the transparent range (≤0.25), set one to opaque. Both opaque is allowed. */
function avoidDoubleTransparent(fillAlpha, strokeAlpha) {
  const transparentThreshold = 0.25;
  if (fillAlpha <= transparentThreshold && strokeAlpha <= transparentThreshold) {
    const opaque = 0.8 + Math.random() * 0.2;
    if (Math.random() < 0.5) return { fillAlpha: opaque, strokeAlpha };
    return { fillAlpha, strokeAlpha: opaque };
  }
  return { fillAlpha, strokeAlpha };
}

/** Random saturation biased high (for fill/stroke). Not for background. */
function randomSaturatedS() {
  return 0.6 + Math.random() * 0.4; /* [0.6, 1] */
}

/** Randomize all global non-binary parameters (colors, numbers, enums). Binary states (checkboxes/toggles) are left unchanged. */
function getRandomizedState() {
  const h = Math.floor(Math.random() * 360);
  const s = randomSaturatedS();
  const l = 0.42 + Math.random() * 0.22;
  const { fillAlpha, strokeAlpha } = avoidDoubleTransparent(randomAlphaBiasedToEnds(), randomAlphaBiasedToEnds());
  const [fr, fg, fb] = hslToRgb(h, s, l);
  const fillColor = toRgbaCss(fr, fg, fb, fillAlpha);
  const strokeL = Math.max(0.15, l * 0.52);
  const [sr, sg, sb] = hslToRgb(h, Math.min(1, s * 1.1), strokeL);
  const faceStrokeColor = toRgbaCss(sr, sg, sb, strokeAlpha);

  const lightingKeys = Object.keys(LIGHTING_PRESETS_FOR_RANDOM);
  const lightingPreset = lightingKeys[Math.floor(Math.random() * lightingKeys.length)];
  const lighting = LIGHTING_PRESETS_FOR_RANDOM[lightingPreset];

  const baseStroke = 0.02;
  const strokeVariation = 0.2;
  const faceStrokeWidth = round2(baseStroke * (1 - strokeVariation + Math.random() * 2 * strokeVariation));
  const faceStrokeInset = round2(baseStroke * (1 - strokeVariation + Math.random() * 2 * strokeVariation));
  const cornerRadius = round2(Math.random() * 0.2);

  const orientationKeys = Object.keys(ORIENTATION_PRESETS);
  const rotationPreset = orientationKeys[Math.floor(Math.random() * orientationKeys.length)];

  const vw = typeof window !== 'undefined' ? window.innerWidth : 4000;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 4000;

  return {
    fillColor,
    faceStrokeColor,
    exportBackground: 'rgba(0,0,0,1)',
    lightAzimuth: round2(lighting.lightAzimuth),
    lightElevation: round2(lighting.lightElevation),
    ambientIntensity: round2(lighting.ambientIntensity),
    gradientMode: lighting.gradientMode,
    lightingPreset,
    faceStrokeWidth,
    faceStrokeInset,
    cornerRadius,
    arrangement: Math.random() < 0.5 ? 'line' : 'circle',
    spacing: round2(1 + Math.random() * 5),
    circleRadius: round2(1 + Math.random() * 5),
    perspectiveDistortion: round2(-0.2 + Math.random() * 0.4),
    rotationPreset,
    cameraMode: Math.random() < 0.5 ? 'orthographic' : 'perspective',
    zoom: round2(0.2 + Math.random() * 2.2),
    exportWidth: Math.min(vw, Math.max(100, Math.floor(100 + Math.random() * 39) * 100)),
    exportHeight: Math.min(vh, Math.max(100, Math.floor(100 + Math.random() * 39) * 100)),
    exportPadding: Math.floor(Math.random() * 201),
    exportDimensionsFollowViewport: false,
    useGradient: false,
    gradientFillColors: [],
    gradientStrokeColors: [],
    gradientInnerFill: null,
    gradientInnerStroke: null,
  };
}

/** Randomize per-solid override (style + lighting only). Used when the solid has "use global" unchecked. */
function getRandomizedSolidOverride() {
  const h = Math.floor(Math.random() * 360);
  const s = randomSaturatedS();
  const l = 0.42 + Math.random() * 0.22;
  const { fillAlpha, strokeAlpha } = avoidDoubleTransparent(randomAlphaBiasedToEnds(), randomAlphaBiasedToEnds());
  const [fr, fg, fb] = hslToRgb(h, s, l);
  const fillColor = toRgbaCss(fr, fg, fb, fillAlpha);
  const strokeL = Math.max(0.15, l * 0.52);
  const [sr, sg, sb] = hslToRgb(h, Math.min(1, s * 1.1), strokeL);
  const faceStrokeColor = toRgbaCss(sr, sg, sb, strokeAlpha);
  const lightingKeys = Object.keys(LIGHTING_PRESETS_FOR_RANDOM);
  const lightingPreset = lightingKeys[Math.floor(Math.random() * lightingKeys.length)];
  const lighting = LIGHTING_PRESETS_FOR_RANDOM[lightingPreset];
  const baseStroke = 0.02;
  const strokeVariation = 0.2;
  const faceStrokeWidth = baseStroke * (1 - strokeVariation + Math.random() * 2 * strokeVariation);
  const faceStrokeInset = baseStroke * (1 - strokeVariation + Math.random() * 2 * strokeVariation);
  const cornerRadius = Math.random() * 0.2;
  return {
    fillColor,
    faceStrokeColor,
    faceStrokeWidth,
    faceStrokeInset,
    cornerRadius,
    lightingPreset,
    lightAzimuth: lighting.lightAzimuth,
    lightElevation: lighting.lightElevation,
    ambientIntensity: lighting.ambientIntensity,
    gradientMode: lighting.gradientMode,
  };
}

export function initUI(container, options = {}) {
  const sceneApi = options.sceneApi || {};
  const exportSvg = options.exportSvg || (() => '');
  initialCameraState = options.initialCameraState ?? sceneApi.getCameraState?.() ?? null;
  onStateChange = options.onStateChange || (() => {});

  let resetCameraFn = () => {};
  const panel = document.createElement('div');
  panel.className = 'ui-panel';
  panel.innerHTML = `
    <div class="ui-header">Platonic SVG</div>
    <div class="ui-sections"></div>
  `;

  const sectionsEl = panel.querySelector('.ui-sections');
  const root = panel;

  /** Apply locked state to a section's content: disable/enable all form controls and toggle .ui-section-locked. */
  function applySectionLock(sectionId) {
    const content = document.getElementById('section-' + sectionId);
    if (!content) return;
    const locked = getState().sectionLocks && getState().sectionLocks[sectionId] === true;
    content.classList.toggle('ui-section-locked', locked);
    content.querySelectorAll('input, select, button:not(.ui-section-lock)').forEach((el) => {
      el.disabled = locked;
    });
    const lockBtn = content.closest('.ui-section')?.querySelector('.ui-section-lock');
    if (lockBtn) {
      lockBtn.setAttribute('aria-label', locked ? 'Unlock section' : 'Lock section');
      lockBtn.setAttribute('title', locked ? 'Unlock section' : 'Lock section');
      lockBtn.textContent = locked ? '\u{1F512}' : '\u{1F513}'; /* 🔒 : 🔓 */
    }
  }

  /** Append a collapsible section to parentEl. contentFn(contentDiv) fills the section body. */
  function addSection(parentEl, title, id, contentFn) {
    const section = document.createElement('div');
    section.className = 'ui-section';
    section.innerHTML = `
      <div class="ui-section-header">
        <button type="button" class="ui-section-toggle open" data-section="${id}" aria-expanded="true"><span class="ui-section-caret"></span>${title}</button>
        <button type="button" class="ui-section-lock" aria-label="Lock section" title="Lock section" data-section="${id}">\u{1F513}</button>
      </div>
      <div class="ui-section-content open" id="section-${id}"></div>
    `;
    const content = section.querySelector('.ui-section-content');
    const toggle = section.querySelector('.ui-section-toggle');
    const lockBtn = section.querySelector('.ui-section-lock');
    parentEl.appendChild(section);
    contentFn(content);
    toggle.addEventListener('click', () => {
      const open = content.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open);
    });
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const st = getState();
      const next = { ...(st.sectionLocks || {}) };
      next[id] = !next[id];
      setState({ sectionLocks: next });
      applySectionLock(id);
    });
    applySectionLock(id);
  }

  function bindNumber(rootEl, inputId, key, min, max, step, scale = 1) {
    const el = rootEl.querySelector('#' + CSS.escape(inputId));
    if (!el) return;
    el.min = min;
    el.max = max;
    el.step = step ?? (max - min) / 100;
    el.value = state[key] != null ? round2(state[key] * scale) : el.value;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (!Number.isNaN(v)) setState({ [key]: round2(v / scale) });
      onStateChange();
    });
  }

  function bindNumberOverride(rootEl, inputId, solidId, key, min, max, step, scale = 1) {
    const el = rootEl.querySelector('#' + CSS.escape(inputId));
    if (!el) return;
    el.min = min;
    el.max = max;
    el.step = step ?? (max - min) / 100;
    const getV = () => (getState().solidOverrides && getState().solidOverrides[solidId] && getState().solidOverrides[solidId][key] != null) ? getState().solidOverrides[solidId][key] : getState()[key];
    el.value = getV() != null ? round2(getV() * scale) : el.value;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (!Number.isNaN(v)) setOverrideValue(solidId, key, round2(v / scale));
      onStateChange();
    });
  }

  function bindCheckbox(rootEl, inputId, key) {
    const el = rootEl.querySelector('#' + CSS.escape(inputId));
    if (!el) return;
    el.checked = !!state[key];
    el.addEventListener('change', () => {
      setState({ [key]: el.checked });
      onStateChange();
    });
  }

  /**
   * Color picker component: swatch + popover (native color, RGBA text, alpha).
   * Separation of concerns: owns its DOM via refs; getValue/setValue are the only binding to state.
   * Exposes refresh on the wrap so external code can sync display from current getValue().
   * @param {HTMLElement} container - where to append the picker
   * @param {string} baseId - unique id for this picker (used only for swatch id so syncRgbaPicker can find it)
   * @param {() => string} getValue - read current value (e.g. from state)
   * @param {(v: string) => void} setValue - write value (e.g. setState)
   * @param {() => void} onChange - called after setValue (e.g. onStateChange)
   * @param {string} defaultValue - fallback when getValue is empty
   */
  function createRgbaSwatchPicker(container, baseId, getValue, setValue, onChange, defaultValue = DEFAULT_FILL_COLOR) {
    const wrap = document.createElement('div');
    wrap.className = 'ui-color-swatch-wrap';
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'ui-color-swatch';
    swatch.id = baseId + '-swatch';
    swatch.setAttribute('aria-label', 'Pick color');
    const popover = document.createElement('div');
    popover.className = 'ui-color-popover';
    popover.innerHTML =
      '<label class="ui-label">Color</label><input type="color" class="ui-color-native" id="' + baseId + '-hex" />' +
      '<label class="ui-label">RGBA</label><input type="text" class="ui-color-rgba" id="' + baseId + '-rgba" placeholder="rgba(r,g,b,a)" />' +
      '<label class="ui-label">Alpha</label><input type="range" class="ui-color-alpha" id="' + baseId + '-alpha" min="0" max="1" step="0.01" /><span class="ui-color-alphaVal" id="' + baseId + '-alphaVal"></span>';
    wrap.appendChild(swatch);
    wrap.appendChild(popover);
    container.appendChild(wrap);

    const hexIn = popover.querySelector('.ui-color-native');
    const rgbaIn = popover.querySelector('.ui-color-rgba');
    const alphaIn = popover.querySelector('.ui-color-alpha');
    const alphaValEl = popover.querySelector('.ui-color-alphaVal');

    /** Update picker DOM from a value. If optionalValue is provided, use it; otherwise use getValue() or defaultValue. Single code path for both internal sync and syncRgbaPicker. */
    function refresh(optionalValue) {
      const v = (optionalValue != null && String(optionalValue).trim() !== '') ? optionalValue : getValue();
      const raw = (v && String(v).trim()) ? v : defaultValue;
      const p = parseRgba(typeof raw === 'string' ? raw : defaultValue);
      const css = toRgbaCss(p.r, p.g, p.b, p.a);
      swatch.style.backgroundColor = css;
      if (hexIn) hexIn.value = rgbToHex(p.r, p.g, p.b);
      if (rgbaIn) rgbaIn.value = css;
      if (alphaIn) alphaIn.value = String(p.a);
      if (alphaValEl) alphaValEl.textContent = p.a.toFixed(2);
    }

    function apply(r, g, b, a) {
      const aNum = a != null ? a : (parseFloat(alphaIn?.value) || 1);
      setValue(toRgbaCss(r, g, b, aNum));
      refresh();
      if (onChange) onChange();
    }

    function close() {
      if (!popover.classList.contains('open')) return;
      popover.classList.remove('open');
      wrap.appendChild(popover);
    }

    function positionPopoverInViewport(anchorRect, el, gap = 6) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pw = el.offsetWidth;
      const ph = el.offsetHeight;
      let left = anchorRect.left;
      let top = anchorRect.bottom + gap;
      if (top + ph > vh - 8) top = Math.max(8, anchorRect.top - ph - gap);
      if (top < 8) top = 8;
      if (left + pw > vw - 8) left = vw - pw - 8;
      if (left < 8) left = 8;
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    }

    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = popover.classList.contains('open');
      close();
      if (!wasOpen) {
        document.body.appendChild(popover);
        popover.classList.add('open');
        refresh();
        const r = swatch.getBoundingClientRect();
        positionPopoverInViewport(r, popover, 6);
      }
    });

    if (hexIn) {
      const onHexChange = () => {
        const hex = hexIn.value;
        if (!hex || hex.length < 7) return;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        apply(r, g, b, null);
      };
      hexIn.addEventListener('input', onHexChange);
      hexIn.addEventListener('change', onHexChange);
    }
    if (rgbaIn) {
      rgbaIn.addEventListener('input', () => {
        const p = parseRgba(rgbaIn.value);
        apply(p.r, p.g, p.b, p.a);
      });
      rgbaIn.addEventListener('change', () => {
        const p = parseRgba(rgbaIn.value);
        apply(p.r, p.g, p.b, p.a);
      });
    }
    if (alphaIn) {
      alphaIn.addEventListener('input', () => {
        const p = parseRgba(getValue() || defaultValue);
        apply(p.r, p.g, p.b, parseFloat(alphaIn.value));
      });
    }

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target) && !popover.contains(e.target)) close();
    });

    wrap._colorPickerRefresh = refresh;
    refresh();
  }

  /** Sync a color picker's UI to a value (e.g. after randomize). Delegates to the picker's refresh so one code path updates picker DOM. */
  function syncRgbaPicker(container, baseId, value, defaultValue = DEFAULT_FILL_COLOR) {
    const wrap = document.getElementById(baseId + '-swatch')?.closest('.ui-color-swatch-wrap');
    if (wrap && typeof wrap._colorPickerRefresh === 'function') wrap._colorPickerRefresh(value != null && String(value).trim() !== '' ? value : undefined);
  }

  /** Sync all per-solid color pickers so swatches reflect solidOverrides (e.g. after randomize or when unchecking "use global"). */
  function syncAllPerSolidPickers() {
    const st = getState();
    const ids = st.selectedSolidIds || [];
    for (const id of ids) {
      if (st.useGlobalForSolid && st.useGlobalForSolid[id] === false) {
        const fillVal = normalizeToRgba(getOverrideValue(id, 'fillColor'));
        const strokeVal = normalizeToRgba(getOverrideValue(id, 'faceStrokeColor'));
        syncRgbaPicker(root, 'ps-' + id + '-fillColor', fillVal, DEFAULT_FILL_COLOR);
        syncRgbaPicker(root, 'ps-' + id + '-faceStrokeColor', strokeVal, DEFAULT_STROKE_COLOR);
      }
    }
  }

  function bindSelect(rootEl, inputId, key) {
    const el = rootEl.querySelector('#' + CSS.escape(inputId));
    if (!el) return;
    el.value = state[key];
    el.addEventListener('change', () => {
      setState({ [key]: el.value });
      onStateChange();
    });
  }

  function getOverrideValue(id, key) {
    const st = getState();
    return (st.solidOverrides && st.solidOverrides[id] && st.solidOverrides[id][key] != null)
      ? st.solidOverrides[id][key] : st[key];
  }

  function setOverrideValue(id, key, value) {
    const st = getState();
    const next = { ...(st.solidOverrides || {}) };
    next[id] = { ...(next[id] || {}), [key]: value };
    setState({ solidOverrides: next });
  }

  function bindSelectOverride(rootEl, inputId, solidId, key) {
    const el = rootEl.querySelector('#' + CSS.escape(inputId));
    if (!el) return;
    el.value = getOverrideValue(solidId, key);
    el.addEventListener('change', () => {
      setOverrideValue(solidId, key, el.value);
      onStateChange();
    });
  }

  const presetOpts = Object.keys(ORIENTATION_PRESETS)
    .map((key) => `<option value="${key}">${ORIENTATION_PRESET_LABELS[key] || key}</option>`)
    .join('');

  addSection(sectionsEl, 'Scene', 'scene', (content) => {
    content.innerHTML = `
      <label class="ui-label">Solids</label>
      <div class="ui-solid-list" id="solid-list"></div>
      <label class="ui-label">Arrangement</label>
      <select id="arrangement"><option value="line">Line</option><option value="circle">Circle</option></select>
      <label class="ui-label">Spacing</label>
      <input type="range" id="spacing" min="1" max="6" step="0.1" />
      <span id="spacing-val">2.5</span>
      <label class="ui-label">Circle radius</label>
      <input type="range" id="circleRadius" min="1" max="6" step="0.1" />
      <span id="circleRadius-val">3</span>
      <label class="ui-label">Perspective distortion</label>
      <input type="range" id="perspectiveDistortion" min="-1" max="1" step="0.01" />
      <span id="perspectiveDistortion-val">0</span>
      <label class="ui-label">Default orientation</label>
      <select id="rotationPreset">${presetOpts}</select>
      <label class="ui-label">Model rotation (RX/RY)</label>
      <select id="modelRotationPreset">
        <option value="">Custom</option>
        ${Object.keys(MODEL_ROTATION_PRESETS).map((key) => `<option value="${key}">${MODEL_ROTATION_PRESET_LABELS[key] || key}</option>`).join('')}
      </select>
      <label class="ui-label">Projection</label>
      <select id="cameraMode">
        <option value="orthographic">Orthographic</option>
        <option value="perspective">Perspective</option>
      </select>
      <label class="ui-label">Zoom (scroll)</label>
      <div class="ui-field-row">
        <input type="range" id="zoom" min="0.2" max="4" step="0.05" />
      </div>
      <div class="ui-zoom-val-row">
        <span id="zoom-val">1</span>
      </div>
      <div class="ui-actions-row">
        <button type="button" id="fitToView">Fit to view</button>
        <button type="button" id="resetCamera">Reset camera</button>
      </div>
    `;
    const listEl = content.querySelector('#solid-list');
    SOLID_IDS.forEach((id) => {
      const row = document.createElement('div');
      row.className = 'ui-solid-row';
      const useGlobal = (getState().useGlobalForSolid && getState().useGlobalForSolid[id] !== false);
      const name = id.charAt(0).toUpperCase() + id.slice(1);
      row.innerHTML = `
        <span class="ui-solid-name">${name}</span>
        <label class="ui-check ui-check-inline" title="Render in scene"><input type="checkbox" data-solid-render="${id}" /> R</label>
        <label class="ui-check ui-check-inline" title="Use global settings"><input type="checkbox" data-solid-global="${id}" /> G</label>
      `;
      const renderCb = row.querySelector('input[data-solid-render]');
      const globalCb = row.querySelector('input[data-solid-global]');
      renderCb.checked = state.selectedSolidIds.includes(id);
      globalCb.checked = useGlobal;
      renderCb.addEventListener('change', () => {
        const ids = state.selectedSolidIds.slice();
        if (renderCb.checked) {
          if (!ids.includes(id)) ids.push(id);
        } else {
          const idx = ids.indexOf(id);
          if (idx !== -1) ids.splice(idx, 1);
        }
        if (ids.length === 0) ids.push(id);
        setState({ selectedSolidIds: ids });
        onStateChange();
      });
      globalCb.addEventListener('change', () => {
        const st = getState();
        const nextUseGlobal = !!globalCb.checked;
        const next = { ...(st.useGlobalForSolid || {}) };
        next[id] = nextUseGlobal;
        if (!nextUseGlobal) {
          setState({ useGlobalForSolid: next, solidOverrides: copyGlobalToSolidOverrides(st, id) });
        } else {
          setState({ useGlobalForSolid: next });
        }
        refreshPerSolidPanels();
        syncAllPerSolidPickers();
        onStateChange();
      });
      listEl.appendChild(row);
    });
    bindSelect(root, 'arrangement', 'arrangement');
    const spacingInput = content.querySelector('#spacing');
    spacingInput.value = format2(state.spacing);
    spacingInput.addEventListener('input', () => {
      const v = round2(parseFloat(spacingInput.value));
      setState({ spacing: v });
      content.querySelector('#spacing-val').textContent = format2(v);
      onStateChange();
    });
    content.querySelector('#spacing-val').textContent = format2(state.spacing);
    const circleInput = content.querySelector('#circleRadius');
    circleInput.value = format2(state.circleRadius);
    circleInput.addEventListener('input', () => {
      const v = round2(parseFloat(circleInput.value));
      setState({ circleRadius: v });
      content.querySelector('#circleRadius-val').textContent = format2(v);
      onStateChange();
    });
    content.querySelector('#circleRadius-val').textContent = format2(state.circleRadius);
    const perspectiveInput = content.querySelector('#perspectiveDistortion');
    perspectiveInput.value = format2(state.perspectiveDistortion ?? 0);
    perspectiveInput.addEventListener('input', () => {
      const v = round2(parseFloat(perspectiveInput.value));
      setState({ perspectiveDistortion: v });
      content.querySelector('#perspectiveDistortion-val').textContent = format2(v);
      onStateChange();
    });
    content.querySelector('#perspectiveDistortion-val').textContent = format2(state.perspectiveDistortion ?? 0);
    bindSelect(root, 'rotationPreset', 'rotationPreset');
    const modelRotPresetEl = content.querySelector('#modelRotationPreset');
    if (modelRotPresetEl) {
      const syncModelRotationPresetSelect = () => {
        const rx = getState().modelRotationX ?? 0;
        const ry = getState().modelRotationY ?? 0;
        const tol = 1e-4;
        const key = Object.keys(MODEL_ROTATION_PRESETS).find(
          (k) => Math.abs(MODEL_ROTATION_PRESETS[k].rx - rx) < tol && Math.abs(MODEL_ROTATION_PRESETS[k].ry - ry) < tol
        );
        modelRotPresetEl.value = key || '';
      };
      modelRotPresetEl.addEventListener('change', () => {
        const key = modelRotPresetEl.value;
        if (key && MODEL_ROTATION_PRESETS[key]) {
          const { rx, ry } = MODEL_ROTATION_PRESETS[key];
          setState({ modelRotationX: rx, modelRotationY: ry });
          onStateChange();
        }
      });
      syncModelRotationPresetSelect();
    }
    bindSelect(root, 'cameraMode', 'cameraMode');
    const zoomInput = content.querySelector('#zoom');
    zoomInput.value = format2(state.zoom);
    zoomInput.addEventListener('input', () => {
      const v = round2(parseFloat(zoomInput.value));
      setState({ zoom: v });
      const cam = sceneApi.getCamera?.();
      if (cam && cam.isOrthographicCamera) {
        cam.zoom = v;
        cam.updateProjectionMatrix();
      }
      content.querySelector('#zoom-val').textContent = format2(v);
      onStateChange();
    });
    content.querySelector('#zoom-val').textContent = format2(state.zoom);
    content.querySelector('#fitToView').addEventListener('click', () => {
      sceneApi.fitToView?.(state);
      const z = round2(state.zoom);
      zoomInput.value = format2(z);
      content.querySelector('#zoom-val').textContent = format2(z);
      onStateChange();
    });
    const doResetCamera = () => {
      if (initialCameraState) sceneApi.applyCameraState?.(state, initialCameraState);
      const z = round2(state.zoom);
      zoomInput.value = format2(z);
      content.querySelector('#zoom-val').textContent = format2(z);
      sceneApi.resize?.(state);
      sceneApi.setCameraMode?.(state.cameraMode === 'perspective', state);
      onStateChange();
    };
    resetCameraFn = doResetCamera;
    content.querySelector('#resetCamera').addEventListener('click', doResetCamera);
  });

  function applyRandomizeToUI(r) {
    setState(r);
    syncRgbaPicker(root, 'fillColor', r.fillColor, DEFAULT_FILL_COLOR);
    syncRgbaPicker(root, 'faceStrokeColor', r.faceStrokeColor, DEFAULT_STROKE_COLOR);
    const exportBg = r.exportBackground && String(r.exportBackground).toLowerCase() !== 'transparent' ? r.exportBackground : 'rgba(0,0,0,0)';
    syncRgbaPicker(root, 'exportBackground', exportBg, 'rgba(0,0,0,0)');
    const n = (id, v) => {
      const el = root.querySelector(id);
      if (!el) return;
      if (typeof v !== 'number') el.value = v;
      else el.value = (v === Math.floor(v)) ? String(v) : format2(v);
    };
    n('#faceStrokeWidth', r.faceStrokeWidth);
    n('#faceStrokeInset', r.faceStrokeInset);
    n('#cornerRadius', r.cornerRadius);
    n('#lightAzimuth', r.lightAzimuth);
    n('#lightElevation', r.lightElevation);
    n('#ambientIntensity', r.ambientIntensity);
    n('#gradientMode', r.gradientMode);
    const outsideOverrideCbSync = root.querySelector('#outsideLayerOverrideEnabled');
    if (outsideOverrideCbSync) {
      outsideOverrideCbSync.checked = !!r.outsideLayerOverrideEnabled;
      const outsideSwatchSync = root.querySelector('.ui-outside-layer-override-swatch');
      if (outsideSwatchSync) outsideSwatchSync.style.display = r.outsideLayerOverrideEnabled ? '' : 'none';
    }
    n('#arrangement', r.arrangement);
    n('#spacing', r.spacing);
    n('#circleRadius', r.circleRadius);
    n('#perspectiveDistortion', r.perspectiveDistortion);
    n('#rotationPreset', r.rotationPreset);
    const modelRotPresetEl = root.querySelector('#modelRotationPreset');
    if (modelRotPresetEl) {
      const rx = r.modelRotationX ?? 0, ry = r.modelRotationY ?? 0;
      const tol = 1e-4;
      const key = Object.keys(MODEL_ROTATION_PRESETS).find(
        (k) => Math.abs(MODEL_ROTATION_PRESETS[k].rx - rx) < tol && Math.abs(MODEL_ROTATION_PRESETS[k].ry - ry) < tol
      );
      modelRotPresetEl.value = key || '';
    }
    n('#cameraMode', r.cameraMode);
    n('#zoom', r.zoom);
    n('#lightingPreset', r.lightingPreset);
    n('#exportWidth', r.exportWidth);
    n('#exportHeight', r.exportHeight);
    n('#exportPadding', r.exportPadding);
    const spacingVal = root.querySelector('#spacing-val');
    if (spacingVal) spacingVal.textContent = format2(r.spacing);
    const circleRadiusVal = root.querySelector('#circleRadius-val');
    if (circleRadiusVal) circleRadiusVal.textContent = format2(r.circleRadius);
    const perspectiveDistortionVal = root.querySelector('#perspectiveDistortion-val');
    if (perspectiveDistortionVal) perspectiveDistortionVal.textContent = format2(r.perspectiveDistortion);
    const zoomVal = root.querySelector('#zoom-val');
    if (zoomVal) zoomVal.textContent = format2(r.zoom);
    sceneApi.setCameraMode?.(r.cameraMode === 'perspective', getState());
    syncAllPerSolidPickers();
    onStateChange();
  }

  const LIGHTING_PRESETS = {
    none: { gradientMode: 'none' },
    soft: { lightAzimuth: 0.55, lightElevation: 0.45, ambientIntensity: 0.5, gradientMode: 'averaged' },
    studio: { lightAzimuth: 0.62, lightElevation: 0.35, ambientIntensity: 0.2, gradientMode: 'perFaceGradient' },
    dramatic: { lightAzimuth: 0.25, lightElevation: 0.7, ambientIntensity: 0.1, gradientMode: 'perFaceGradient' },
    rim: { lightAzimuth: 0.85, lightElevation: 0.15, ambientIntensity: 0.35, gradientMode: 'perFaceGradient' },
    flat: { lightAzimuth: 0.5, lightElevation: 0.5, ambientIntensity: 0.85, gradientMode: 'averaged' },
  };

  /**
   * Apply monochromatic gradient (global style): black ↔ saturated (derived color).
   * Fill anchors from black to the saturation of the fill color (vivid, not muddy).
   * Stroke is the inverse: when fill goes black→saturated, stroke goes saturated→black.
   * Inverse button (Full → Dark) flips direction: fill goes saturated→black, stroke goes black→saturated.
   */
  function applyGradientMacro(inverse) {
    const st = getState();
    const ids = st.selectedSolidIds && st.selectedSolidIds.length ? st.selectedSolidIds.slice() : [];
    if (ids.length === 0) return;

    const fillRgb = parseRgba(st.fillColor || DEFAULT_FILL_COLOR);
    const strokeColorForMacro = st.strokeOverridden ? (st.faceStrokeColor || DEFAULT_STROKE_COLOR) : deriveStrokeFromFill(st.fillColor || DEFAULT_FILL_COLOR);
    const strokeRgb = parseRgba(strokeColorForMacro);
    const fillHsl = rgbToHsl(fillRgb.r, fillRgb.g, fillRgb.b);
    const strokeHsl = rgbToHsl(strokeRgb.r, strokeRgb.g, strokeRgb.b);

    // Black anchor (same hue, no saturation, zero lightness)
    const blackFill = { h: fillHsl.h, s: 0, l: 0 };
    const blackStroke = { h: strokeHsl.h, s: 0, l: 0 };
    // Saturated anchor: keep hue and saturation of derived color, fixed lightness so it's vivid (not muddy)
    const satLightness = 0.5;
    const fullFill = { h: fillHsl.h, s: fillHsl.s, l: satLightness };
    const fullStroke = { h: strokeHsl.h, s: strokeHsl.s, l: satLightness };

    const n = ids.length;
    const numSteps = Math.max(1, n - 1);
    const fillSteps = [];
    const strokeSteps = [];

    for (let i = 0; i < n; i++) {
      let t = numSteps > 0 ? i / numSteps : 1;
      if (inverse) t = 1 - t;
      const tStroke = 1 - t; // stroke is inverse of fill
      const sF = blackFill.s + t * (fullFill.s - blackFill.s);
      const lF = blackFill.l + t * (fullFill.l - blackFill.l);
      const sS = blackStroke.s + tStroke * (fullStroke.s - blackStroke.s);
      const lS = blackStroke.l + tStroke * (fullStroke.l - blackStroke.l);
      const [rF, gF, bF] = hslToRgb(fillHsl.h, sF, lF);
      const [rS, gS, bS] = hslToRgb(strokeHsl.h, sS, lS);
      fillSteps.push(toRgbaCss(rF, gF, bF, fillRgb.a));
      strokeSteps.push(toRgbaCss(rS, gS, bS, strokeRgb.a));
    }
    const gradientInnerFill = inverse ? fillSteps[n - 1] : fillSteps[0];
    const gradientInnerStroke = inverse ? strokeSteps[n - 1] : strokeSteps[0];

    setState({
      useGradient: true,
      gradientFillColors: fillSteps,
      gradientStrokeColors: strokeSteps,
      gradientInnerFill,
      gradientInnerStroke,
    });
    onStateChange();
  }

  /** Reusable Style section: same markup and bindings; context = { rootEl, global: true } or { rootEl, solidId } */
  function buildStyleSectionContent(content, context) {
    const prefix = context.global ? '' : 'ps-' + context.solidId + '-';
    content.innerHTML = `
      <div class="ui-style-colors">
        <div class="ui-style-color-field"><label class="ui-label">Fill</label><div class="ui-color-picker-slot" data-color-key="fillColor" data-prefix="${prefix}"></div></div>
        <div class="ui-style-color-field"><label class="ui-label">Stroke</label><div class="ui-color-picker-slot" data-color-key="faceStrokeColor" data-prefix="${prefix}"></div></div>
      </div>
      <label class="ui-label">Stroke width</label>
      <input type="range" id="${prefix}faceStrokeWidth" min="0" max="0.1" step="0.005" />
      <label class="ui-label">Stroke inset (clip)</label>
      <input type="range" id="${prefix}faceStrokeInset" min="0" max="0.6" step="0.01" />
      <label class="ui-label">Corner radius</label>
      <input type="range" id="${prefix}cornerRadius" min="0" max="0.3" step="0.01" />
    `;
    if (context.global) {
      const fillSlot = content.querySelector('.ui-color-picker-slot[data-color-key="fillColor"]');
      const strokeSlot = content.querySelector('.ui-color-picker-slot[data-color-key="faceStrokeColor"]');
      const clearGradient = {
        useGradient: false,
        gradientFillColors: [],
        gradientStrokeColors: [],
        gradientInnerFill: null,
        gradientInnerStroke: null,
      };
      if (fillSlot) createRgbaSwatchPicker(fillSlot, 'fillColor', () => getState().fillColor || DEFAULT_FILL_COLOR, (v) => setState({ fillColor: v, ...clearGradient }), onStateChange, DEFAULT_FILL_COLOR);
      if (strokeSlot) {
        createRgbaSwatchPicker(strokeSlot, 'faceStrokeColor', () => {
          const st = getState();
          return st.strokeOverridden ? (st.faceStrokeColor || DEFAULT_STROKE_COLOR) : deriveStrokeFromFill(st.fillColor || DEFAULT_FILL_COLOR);
        }, (v) => {
          setState({ faceStrokeColor: v, strokeOverridden: true, ...clearGradient });
        }, onStateChange, DEFAULT_STROKE_COLOR);
      }
      bindNumber(context.rootEl, prefix + 'faceStrokeWidth', 'faceStrokeWidth', 0, 0.1, 0.005);
      bindNumber(context.rootEl, prefix + 'faceStrokeInset', 'faceStrokeInset', 0, 0.6, 0.01);
      bindNumber(context.rootEl, prefix + 'cornerRadius', 'cornerRadius', 0, 0.3, 0.01);
      const gradientRow = document.createElement('div');
      gradientRow.className = 'ui-gradient-macro';
      gradientRow.innerHTML = `
        <label class="ui-label">Monochromatic gradient</label>
        <div class="ui-gradient-buttons">
          <button type="button" id="gradientDarkToFull" title="Apply gradient: dark → full (first solid dark, last full)">Dark → Full</button>
          <button type="button" id="gradientFullToDark" title="Apply gradient: full → dark (first solid full, last dark)">Full → Dark</button>
          <button type="button" id="gradientReset" title="Clear gradient and use single fill/stroke">Reset</button>
        </div>
        <div class="ui-outside-layer-override-row">
          <div class="ui-outside-layer-override-label-row">
            <input type="checkbox" id="outsideLayerOverrideEnabled" title="Use override color for inner (back) faces" />
            <label class="ui-label-inline" for="outsideLayerOverrideEnabled">Inner layer override</label>
          </div>
          <div class="ui-outside-layer-override-controls">
            <div class="ui-color-picker-slot ui-outside-layer-override-swatch" data-color-key="outsideLayerOverrideRgba" data-prefix="" style="display:none"></div>
          </div>
        </div>
      `;
      content.appendChild(gradientRow);
      content.querySelector('#gradientDarkToFull').addEventListener('click', () => applyGradientMacro(false));
      content.querySelector('#gradientFullToDark').addEventListener('click', () => applyGradientMacro(true));
      content.querySelector('#gradientReset').addEventListener('click', () => {
        setState(clearGradient);
        onStateChange();
      });
      const outsideOverrideCb = content.querySelector('#outsideLayerOverrideEnabled');
      const outsideOverrideSwatchWrap = content.querySelector('.ui-outside-layer-override-swatch');
      const defaultOutsideOverrideRgba = 'rgba(255,200,100,0.85)';
      outsideOverrideCb.addEventListener('change', () => {
        const enabled = outsideOverrideCb.checked;
        setState({
          outsideLayerOverrideEnabled: enabled,
          outsideLayerOverrideRgba: enabled && !state.outsideLayerOverrideRgba ? defaultOutsideOverrideRgba : state.outsideLayerOverrideRgba,
        });
        outsideOverrideSwatchWrap.style.display = enabled ? '' : 'none';
        onStateChange();
      });
      createRgbaSwatchPicker(outsideOverrideSwatchWrap, 'outsideLayerOverrideRgba', () => (getState().outsideLayerOverrideRgba || defaultOutsideOverrideRgba), (v) => setState({ outsideLayerOverrideRgba: v }), onStateChange, defaultOutsideOverrideRgba);
      outsideOverrideCb.checked = !!state.outsideLayerOverrideEnabled;
      outsideOverrideSwatchWrap.style.display = state.outsideLayerOverrideEnabled ? '' : 'none';
    } else {
      const sid = context.solidId;
      const fillSlot = content.querySelector('.ui-color-picker-slot[data-color-key="fillColor"]');
      const strokeSlot = content.querySelector('.ui-color-picker-slot[data-color-key="faceStrokeColor"]');
      if (fillSlot) createRgbaSwatchPicker(fillSlot, prefix + 'fillColor', () => normalizeToRgba(getOverrideValue(sid, 'fillColor')), (v) => setOverrideValue(sid, 'fillColor', v), onStateChange, DEFAULT_FILL_COLOR);
      if (strokeSlot) createRgbaSwatchPicker(strokeSlot, prefix + 'faceStrokeColor', () => normalizeToRgba(getOverrideValue(sid, 'faceStrokeColor')), (v) => setOverrideValue(sid, 'faceStrokeColor', v), onStateChange, DEFAULT_STROKE_COLOR);
      bindNumberOverride(context.rootEl, prefix + 'faceStrokeWidth', sid, 'faceStrokeWidth', 0, 0.1, 0.005);
      bindNumberOverride(context.rootEl, prefix + 'faceStrokeInset', sid, 'faceStrokeInset', 0, 0.6, 0.01);
      bindNumberOverride(context.rootEl, prefix + 'cornerRadius', sid, 'cornerRadius', 0, 0.3, 0.01);
    }
  }

  /** Reusable Lighting section */
  function buildLightingSectionContent(content, context) {
    const prefix = context.global ? '' : 'ps-' + context.solidId + '-';
    content.innerHTML = `
      <label class="ui-label">Preset</label>
      <select id="${prefix}lightingPreset">
        <option value="none">None</option><option value="soft">Soft</option><option value="studio">Studio</option><option value="dramatic">Dramatic</option>
        <option value="rim">Rim</option><option value="flat">Flat</option>
      </select>
      <label class="ui-label">Azimuth</label>
      <input type="range" id="${prefix}lightAzimuth" min="0" max="1" step="0.01" />
      <label class="ui-label">Elevation</label>
      <input type="range" id="${prefix}lightElevation" min="0" max="1" step="0.01" />
      <label class="ui-label">Ambient</label>
      <input type="range" id="${prefix}ambientIntensity" min="0" max="1" step="0.05" />
      <label class="ui-label">Gradient mode</label>
      <select id="${prefix}gradientMode">
        <option value="averaged">Averaged</option><option value="perFaceGradient">Per-face gradient</option>
      </select>
    `;
    if (context.global) {
      const presetSel = content.querySelector('#' + CSS.escape(prefix + 'lightingPreset'));
      presetSel.value = (state.lightingPreset && LIGHTING_PRESETS[state.lightingPreset]) ? state.lightingPreset : 'soft';
      presetSel.addEventListener('change', () => {
        const key = presetSel.value;
        setState({ lightingPreset: key });
        const preset = LIGHTING_PRESETS[key];
        if (preset) {
          setState(preset);
          context.rootEl.querySelector('#' + CSS.escape(prefix + 'lightAzimuth')).value = state.lightAzimuth;
          context.rootEl.querySelector('#' + CSS.escape(prefix + 'lightElevation')).value = state.lightElevation;
          context.rootEl.querySelector('#' + CSS.escape(prefix + 'ambientIntensity')).value = state.ambientIntensity;
          context.rootEl.querySelector('#' + CSS.escape(prefix + 'gradientMode')).value = state.gradientMode;
        }
        onStateChange();
      });
      bindNumber(context.rootEl, prefix + 'lightAzimuth', 'lightAzimuth', 0, 1, 0.01);
      bindNumber(context.rootEl, prefix + 'lightElevation', 'lightElevation', 0, 1, 0.01);
      bindNumber(context.rootEl, prefix + 'ambientIntensity', 'ambientIntensity', 0, 1, 0.05);
      bindSelect(context.rootEl, prefix + 'gradientMode', 'gradientMode');
    } else {
      const sid = context.solidId;
      const presetSel = content.querySelector('#' + CSS.escape(prefix + 'lightingPreset'));
      const overridePreset = getOverrideValue(sid, 'lightingPreset') || state.lightingPreset;
      presetSel.value = (overridePreset && LIGHTING_PRESETS[overridePreset]) ? overridePreset : 'soft';
      presetSel.addEventListener('change', () => {
        const key = presetSel.value;
        const preset = LIGHTING_PRESETS[key];
        if (preset) {
          Object.keys(preset).forEach((k) => setOverrideValue(sid, k, preset[k]));
          context.rootEl.querySelector('#' + CSS.escape(prefix + 'lightAzimuth')).value = getOverrideValue(sid, 'lightAzimuth');
          context.rootEl.querySelector('#' + CSS.escape(prefix + 'lightElevation')).value = getOverrideValue(sid, 'lightElevation');
          context.rootEl.querySelector('#' + CSS.escape(prefix + 'ambientIntensity')).value = getOverrideValue(sid, 'ambientIntensity');
          context.rootEl.querySelector('#' + CSS.escape(prefix + 'gradientMode')).value = getOverrideValue(sid, 'gradientMode');
        }
        setOverrideValue(sid, 'lightingPreset', key);
        onStateChange();
      });
      bindNumberOverride(context.rootEl, prefix + 'lightAzimuth', sid, 'lightAzimuth', 0, 1, 0.01);
      bindNumberOverride(context.rootEl, prefix + 'lightElevation', sid, 'lightElevation', 0, 1, 0.01);
      bindNumberOverride(context.rootEl, prefix + 'ambientIntensity', sid, 'ambientIntensity', 0, 1, 0.05);
      bindSelectOverride(context.rootEl, prefix + 'gradientMode', sid, 'gradientMode');
    }
  }

  addSection(sectionsEl, 'Style', 'style', (content) => buildStyleSectionContent(content, { rootEl: root, global: true }));

  if (options.canvasOverlayContainer) {
    const bottomBar = document.createElement('div');
    bottomBar.className = 'canvas-bottom-bar';

    const randomizeBtn = document.createElement('button');
    randomizeBtn.type = 'button';
    randomizeBtn.className = 'canvas-bottom-btn';
    randomizeBtn.textContent = 'Randomize';
    /** State keys per global section; locked sections are excluded from randomize. */
    const GLOBAL_SECTION_KEYS = {
      scene: ['arrangement', 'spacing', 'circleRadius', 'perspectiveDistortion', 'rotationPreset', 'cameraMode', 'zoom'],
      style: ['fillColor', 'faceStrokeColor', 'faceStrokeWidth', 'faceStrokeInset', 'cornerRadius', 'outsideLayerOverrideEnabled', 'outsideLayerOverrideRgba', 'useGradient', 'gradientFillColors', 'gradientStrokeColors', 'gradientInnerFill', 'gradientInnerStroke'],
      lighting: ['lightAzimuth', 'lightElevation', 'ambientIntensity', 'gradientMode', 'lightingPreset'],
      export: ['exportWidth', 'exportHeight', 'exportPadding', 'exportBackground', 'exportDimensionsFollowViewport'],
    };
    const PER_SOLID_STYLE_KEYS = ['fillColor', 'faceStrokeColor', 'faceStrokeWidth', 'faceStrokeInset', 'cornerRadius'];
    const PER_SOLID_LIGHTING_KEYS = ['lightingPreset', 'lightAzimuth', 'lightElevation', 'ambientIntensity', 'gradientMode'];

    randomizeBtn.addEventListener('click', () => {
      const st = getState();
      const r = getRandomizedState();
      r.arrangement = st.arrangement; /* preserve circular vs linear */
      for (const sectionId of ['scene', 'style', 'lighting', 'export']) {
        if (st.sectionLocks && st.sectionLocks[sectionId] === true) {
          for (const k of GLOBAL_SECTION_KEYS[sectionId]) delete r[k];
        }
      }
      setState(r);
      const ids = st.selectedSolidIds || [];
      const nextOverrides = { ...(st.solidOverrides || {}) };
      for (const id of ids) {
        if (st.useGlobalForSolid && st.useGlobalForSolid[id] === false) {
          const override = getRandomizedSolidOverride();
          if (st.sectionLocks && st.sectionLocks['style-' + id] === true) {
            for (const k of PER_SOLID_STYLE_KEYS) delete override[k];
          }
          if (st.sectionLocks && st.sectionLocks['lighting-' + id] === true) {
            for (const k of PER_SOLID_LIGHTING_KEYS) delete override[k];
          }
          nextOverrides[id] = { ...(nextOverrides[id] || {}), ...override };
        }
      }
      setState({ solidOverrides: nextOverrides });
      refreshPerSolidPanels();
      applyRandomizeToUI(r);
      onStateChange();
      sceneApi.fitToView?.(getState());
    });
    const divider = document.createElement('div');
    divider.className = 'canvas-bottom-divider';
    const exportSvgBtn = document.createElement('button');
    exportSvgBtn.type = 'button';
    exportSvgBtn.className = 'canvas-bottom-btn';
    exportSvgBtn.textContent = 'Export SVG';
    const copySvgBtn = document.createElement('button');
    copySvgBtn.type = 'button';
    copySvgBtn.className = 'canvas-bottom-btn';
    copySvgBtn.textContent = 'Copy SVG';
    exportSvgBtn.addEventListener('click', () => {
      const s = getState();
      if (s.exportEachSolidSeparately && s.selectedSolidIds && s.selectedSolidIds.length > 0) {
        s.selectedSolidIds.forEach((id) => {
          const one = { ...s, selectedSolidIds: [id] };
          const svg = exportSvg(one);
          const blob = new Blob([svg], { type: 'image/svg+xml' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `platonic-${id}.svg`;
          a.click();
          URL.revokeObjectURL(a.href);
        });
      } else {
        const svg = exportSvg(s);
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'platonic-solids.svg';
        a.click();
        URL.revokeObjectURL(a.href);
      }
    });
    copySvgBtn.addEventListener('click', async () => {
      const svg = exportSvg(getState());
      await navigator.clipboard.writeText(svg);
      const t = copySvgBtn.textContent;
      copySvgBtn.textContent = 'Copied!';
      setTimeout(() => { copySvgBtn.textContent = t; }, 1200);
    });
    const buttonRow = document.createElement('div');
    buttonRow.className = 'canvas-bottom-button-row';
    buttonRow.appendChild(randomizeBtn);
    buttonRow.appendChild(divider);
    buttonRow.appendChild(exportSvgBtn);
    buttonRow.appendChild(copySvgBtn);
    bottomBar.appendChild(buttonRow);

    const statusRow = document.createElement('div');
    statusRow.className = 'canvas-bottom-status-row';
    const hints = document.createElement('div');
    hints.className = 'ui-hints';
    hints.textContent = 'L: rotate (⇧ axis · Y all) · R: orbit · M/2: pan · scroll: zoom · Space: UI · R: reset';
    statusRow.appendChild(hints);
    bottomBar.appendChild(statusRow);

    options.canvasOverlayContainer.appendChild(bottomBar);
  }

  addSection(sectionsEl, 'Lighting', 'lighting', (content) => buildLightingSectionContent(content, { rootEl: root, global: true }));

  addSection(sectionsEl, 'Export', 'export', (content) => {
    content.innerHTML = `
      <div class="ui-export-size-row">
        <div><label class="ui-label">Width</label><input type="number" id="exportWidth" min="100" max="4000" step="100" /></div>
        <div><label class="ui-label">Height</label><input type="number" id="exportHeight" min="100" max="4000" step="100" /></div>
      </div>
      <label class="ui-label">Padding</label>
      <input type="number" id="exportPadding" min="0" max="200" />
      <label class="ui-label">Background</label>
      <div class="ui-color-picker-slot" data-color-id="exportBackground"></div>
      <div class="ui-export-separately-row">
        <input type="checkbox" id="exportEachSolidSeparately" />
        <label class="ui-label ui-label-inline" for="exportEachSolidSeparately">Export each solid separately</label>
      </div>
    `;
    const maxExportW = () => Math.max(100, typeof window !== 'undefined' ? window.innerWidth : 4000);
    const maxExportH = () => Math.max(100, typeof window !== 'undefined' ? window.innerHeight : 4000);
    const wEl = content.querySelector('#exportWidth');
    wEl.min = 100;
    wEl.max = maxExportW();
    wEl.value = Math.min(state.exportWidth, maxExportW());
    wEl.addEventListener('input', () => {
      const v = Math.min(maxExportW(), Math.max(100, parseInt(wEl.value, 10) || 800));
      setState({ exportWidth: v, exportDimensionsFollowViewport: false });
    });
    const hEl = content.querySelector('#exportHeight');
    hEl.min = 100;
    hEl.max = maxExportH();
    hEl.value = Math.min(state.exportHeight, maxExportH());
    hEl.addEventListener('input', () => {
      const v = Math.min(maxExportH(), Math.max(100, parseInt(hEl.value, 10) || 800));
      setState({ exportHeight: v, exportDimensionsFollowViewport: false });
    });
    const padEl = content.querySelector('#exportPadding');
    padEl.value = state.exportPadding;
    padEl.addEventListener('input', () => setState({ exportPadding: parseInt(padEl.value, 10) || 40 }));
    const exportBgSlot = content.querySelector('.ui-color-picker-slot[data-color-id="exportBackground"]');
    if (exportBgSlot) {
      const exportBgGet = () => {
        const v = getState().exportBackground || 'transparent';
        return (String(v).toLowerCase() === 'transparent') ? 'rgba(0,0,0,0)' : normalizeToRgba(v);
      };
      const exportBgSet = (v) => {
        setState({ exportBackground: (v && parseRgba(v).a === 0) ? 'transparent' : (v || 'transparent') });
      };
      createRgbaSwatchPicker(exportBgSlot, 'exportBackground', exportBgGet, exportBgSet, onStateChange, 'rgba(0,0,0,0)');
    }
    bindCheckbox(root, 'exportEachSolidSeparately', 'exportEachSolidSeparately');
  });

  const perSolidPanelsContainer = document.createElement('div');
  perSolidPanelsContainer.className = 'ui-per-solid-panels';

  function refreshPerSolidPanels() {
    perSolidPanelsContainer.innerHTML = '';
    const st = getState();
    SOLID_IDS.forEach((id) => {
      if (st.useGlobalForSolid && st.useGlobalForSolid[id] === false) {
        const p = document.createElement('div');
        p.className = 'ui-panel per-solid-panel';
        p.dataset.solid = id;
        const name = id.charAt(0).toUpperCase() + id.slice(1);
        p.innerHTML = `<div class="ui-header">${name}</div><div class="ui-sections"></div>`;
        const sections = p.querySelector('.ui-sections');
        addSection(sections, 'Orientation', 'orientation-' + id, (orientContent) => {
          orientContent.innerHTML = `
            <label class="ui-label">Orientation</label>
            <select id="ps-${id}-orientation">${presetOpts}</select>
          `;
          const sel = orientContent.querySelector('#ps-' + id + '-orientation');
          sel.value = (st.solidOrientations && st.solidOrientations[id]) || st.rotationPreset || 'isometric';
          sel.addEventListener('change', () => {
            const next = { ...(getState().solidOrientations || {}), [id]: sel.value };
            setState({ solidOrientations: next });
            onStateChange();
          });
        });
        addSection(sections, 'Style', 'style-' + id, (content) => buildStyleSectionContent(content, { rootEl: p, solidId: id }));
        addSection(sections, 'Lighting', 'lighting-' + id, (content) => buildLightingSectionContent(content, { rootEl: p, solidId: id }));
        perSolidPanelsContainer.appendChild(p);
      }
    });
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'ui-panels-wrapper';
  wrapper.appendChild(perSolidPanelsContainer);
  wrapper.appendChild(panel);
  container.appendChild(wrapper);
  refreshPerSolidPanels();

  const updateGlobalMacrosLock = () => {
    const st = getState();
    const allGlobal = allSelectedSolidsUseGlobal(st);
    const darkToFull = root.querySelector('#gradientDarkToFull');
    const fullToDark = root.querySelector('#gradientFullToDark');
    const gradientReset = root.querySelector('#gradientReset');
    const outsideOverrideCbLock = root.querySelector('#outsideLayerOverrideEnabled');
    const outsideOverrideSwatchLock = root.querySelector('.ui-outside-layer-override-swatch');
    if (darkToFull) darkToFull.disabled = !allGlobal;
    if (fullToDark) fullToDark.disabled = !allGlobal;
    if (gradientReset) gradientReset.disabled = !allGlobal;
    if (outsideOverrideCbLock) outsideOverrideCbLock.disabled = !allGlobal;
    if (outsideOverrideSwatchLock) outsideOverrideSwatchLock.style.pointerEvents = allGlobal ? '' : 'none';
  };
  const prevOnStateChange = onStateChange;
  onStateChange = () => {
    prevOnStateChange();
    updateGlobalMacrosLock();
  };
  updateGlobalMacrosLock();

  window.addEventListener('resize', () => {
    const st = getState();
    if (st.exportDimensionsFollowViewport) {
      const wEl = root.querySelector('#exportWidth');
      const hEl = root.querySelector('#exportHeight');
      if (wEl) wEl.value = st.exportWidth;
      if (hEl) hEl.value = st.exportHeight;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      wrapper.style.display = wrapper.style.display === 'none' ? '' : 'none';
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      resetCameraFn();
    }
  });

  return panel;
}
