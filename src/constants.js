/**
 * Shared constants for the Platonic Solids SVG Snapshot Engine.
 */

export const DEFAULT_FILL_COLOR = 'rgba(74,144,217,1)';
export const DEFAULT_STROKE_COLOR = 'rgba(42,80,128,1)';

/** Elevation angle for cube body-diagonal (corner-on) view: atan(1/√2). */
const DIAG_ELEV = Math.atan(1 / Math.sqrt(2));
const π = Math.PI;
const π2 = π / 2;
const π4 = π / 4;
const π6 = π / 6;
const π3 = π / 3;
const π8 = π / 8;
const _3π4 = (3 * π) / 4;
const _3π8 = (3 * π) / 8;

/**
 * Model rotation presets (rx, ry) in radians.
 * Labels: simple English with optional radian hint.
 * Covers: axis-aligned views, inverses, body-diagonal (cube corner) views, and key radian steps.
 * Origin = center of cube; diagonals = viewing along (±1,±1,±1) and inverses/reflections.
 */
export const MODEL_ROTATION_PRESETS = {
  // --- Axis-aligned (and inverses) ---
  front: { rx: 0, ry: 0 },
  back: { rx: 0, ry: π },
  top: { rx: -π2, ry: 0 },
  bottom: { rx: π2, ry: 0 },
  right: { rx: 0, ry: π2 },
  left: { rx: 0, ry: -π2 },
  topRight: { rx: -π2, ry: π2 },
  topLeft: { rx: -π2, ry: -π2 },
  bottomRight: { rx: π2, ry: π2 },
  bottomLeft: { rx: π2, ry: -π2 },
  backRight: { rx: 0, ry: _3π4 },
  backLeft: { rx: 0, ry: -_3π4 },

  // --- Body diagonals (cube corner toward camera): (1,1,1), (1,-1,1), etc. ---
  diagonal111: { rx: -DIAG_ELEV, ry: π4 },
  diagonal1_11: { rx: -DIAG_ELEV, ry: -π4 },
  diagonal11_1: { rx: DIAG_ELEV, ry: π4 },
  diagonal1_1_1: { rx: DIAG_ELEV, ry: -π4 },
  diagonal_111: { rx: -DIAG_ELEV, ry: _3π4 },
  diagonal_1_11: { rx: -DIAG_ELEV, ry: -_3π4 },
  diagonal_11_1: { rx: DIAG_ELEV, ry: _3π4 },
  diagonal_1_1_1: { rx: DIAG_ELEV, ry: -_3π4 },

  // --- Radian steps (eighth / quarter turns) ---
  rx_π8_0: { rx: π8, ry: 0 },
  rx_π4_0: { rx: π4, ry: 0 },
  rx_π2_0: { rx: π2, ry: 0 },
  rx_3π8_0: { rx: _3π8, ry: 0 },
  rx_neg_π8_0: { rx: -π8, ry: 0 },
  rx_neg_π4_0: { rx: -π4, ry: 0 },
  rx_neg_π2_0: { rx: -π2, ry: 0 },
  rx_neg_3π8_0: { rx: -_3π8, ry: 0 },
  ry_0_π8: { rx: 0, ry: π8 },
  ry_0_π4: { rx: 0, ry: π4 },
  ry_0_π2: { rx: 0, ry: π2 },
  ry_0_3π8: { rx: 0, ry: _3π8 },
  ry_0_neg_π8: { rx: 0, ry: -π8 },
  ry_0_neg_π4: { rx: 0, ry: -π4 },
  ry_0_neg_π2: { rx: 0, ry: -π2 },
  ry_0_neg_3π8: { rx: 0, ry: -_3π8 },
  // Combined quarter/eighth
  π4_π4: { rx: π4, ry: π4 },
  π4_neg_π4: { rx: π4, ry: -π4 },
  neg_π4_π4: { rx: -π4, ry: π4 },
  neg_π4_neg_π4: { rx: -π4, ry: -π4 },
  π4_π2: { rx: π4, ry: π2 },
  neg_π4_π2: { rx: -π4, ry: π2 },
  π6_π6: { rx: π6, ry: π6 },
  π6_neg_π6: { rx: π6, ry: -π6 },
  π3_π3: { rx: π3, ry: π3 },
  π3_0: { rx: π3, ry: 0 },
  neg_π3_0: { rx: -π3, ry: 0 },
};

/** Human-readable labels for model rotation presets (simple English with optional radian hint). */
export const MODEL_ROTATION_PRESET_LABELS = {
  front: 'Front',
  back: 'Back',
  top: 'Top',
  bottom: 'Bottom',
  right: 'Right',
  left: 'Left',
  topRight: 'Top-right',
  topLeft: 'Top-left',
  bottomRight: 'Bottom-right',
  bottomLeft: 'Bottom-left',
  backRight: 'Back-right (3π/4)',
  backLeft: 'Back-left (-3π/4)',
  diagonal111: 'Diagonal (1,1,1)',
  diagonal1_11: 'Diagonal (1,-1,1)',
  diagonal11_1: 'Diagonal (1,1,-1)',
  diagonal1_1_1: 'Diagonal (1,-1,-1)',
  diagonal_111: 'Diagonal (-1,1,1)',
  diagonal_1_11: 'Diagonal (-1,-1,1)',
  diagonal_11_1: 'Diagonal (-1,1,-1)',
  diagonal_1_1_1: 'Diagonal (-1,-1,-1)',
  rx_π8_0: 'Eighth turn X (π/8)',
  rx_π4_0: 'Quarter turn X (π/4)',
  rx_π2_0: 'Half turn X (π/2)',
  rx_3π8_0: 'Three-eighth turn X (3π/8)',
  rx_neg_π8_0: 'Eighth turn X (-π/8)',
  rx_neg_π4_0: 'Quarter turn X (-π/4)',
  rx_neg_π2_0: 'Half turn X (-π/2)',
  rx_neg_3π8_0: 'Three-eighth turn X (-3π/8)',
  ry_0_π8: 'Eighth turn Y (π/8)',
  ry_0_π4: 'Quarter turn Y (π/4)',
  ry_0_π2: 'Half turn Y (π/2)',
  ry_0_3π8: 'Three-eighth turn Y (3π/8)',
  ry_0_neg_π8: 'Eighth turn Y (-π/8)',
  ry_0_neg_π4: 'Quarter turn Y (-π/4)',
  ry_0_neg_π2: 'Half turn Y (-π/2)',
  ry_0_neg_3π8: 'Three-eighth turn Y (-3π/8)',
  π4_π4: 'Quarter turn (π/4, π/4)',
  π4_neg_π4: 'Quarter turn (π/4, -π/4)',
  neg_π4_π4: 'Quarter turn (-π/4, π/4)',
  neg_π4_neg_π4: 'Quarter turn (-π/4, -π/4)',
  π4_π2: 'Quarter turn (π/4, π/2)',
  neg_π4_π2: 'Quarter turn (-π/4, π/2)',
  π6_π6: 'Sixth turn (π/6, π/6)',
  π6_neg_π6: 'Sixth turn (π/6, -π/6)',
  π3_π3: 'Third turn (π/3, π/3)',
  π3_0: 'Third turn X (π/3, 0)',
  neg_π3_0: 'Third turn X (-π/3, 0)',
};
