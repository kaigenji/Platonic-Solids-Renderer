/**
 * 2D preview: draws the flattened export pipeline to a canvas.
 * Same output as export; used for live preview. Depends only on exportLayer.getFlattenedView.
 */

import { getFlattenedView } from './exportLayer.js';

const DEFAULT_PREVIEW_BACKGROUND = 'rgba(17,17,24,1)';

/**
 * Render the flattened view (face paths) to the canvas 2D context.
 * @param {object} state - App state
 * @param {HTMLCanvasElement} canvas - Canvas to draw into
 */
export function renderPreview(state, canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const pad = state.exportPadding ?? 40;
  const viewport = { width: w, height: h, padding: pad };
  const flat = getFlattenedView(state, viewport);

  ctx.fillStyle = flat.background || DEFAULT_PREVIEW_BACKGROUND;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(flat.cx, flat.cy);
  ctx.scale(1, -1);

  for (const fp of flat.facePaths) {
    ctx.save();
    try {
      const path = new Path2D(fp.d);
      const hasOcclusion = fp.occlusionPaths && fp.occlusionPaths.length > 0;
      if (hasOcclusion) ctx.clip(path);

      if (typeof fp.fill === 'string') {
        ctx.fillStyle = fp.fill;
      } else if (fp.fill && fp.fill.type === 'gradient') {
        const g = ctx.createLinearGradient(fp.fill.x1, fp.fill.y1, fp.fill.x2, fp.fill.y2);
        g.addColorStop(0, fp.fill.dark);
        g.addColorStop(1, fp.fill.light);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = fp.fill && fp.fill.light != null ? fp.fill.light : 'rgba(0,0,0,0.5)';
      }
      ctx.fill(path);

      if (fp.strokeWidth > 0 && fp.stroke) {
        ctx.strokeStyle = fp.stroke;
        ctx.lineWidth = fp.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.stroke(path);
      }

      if (hasOcclusion) {
        try {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = 'rgba(0,0,0,1)';
          for (const od of fp.occlusionPaths) {
            if (od && String(od).trim()) ctx.fill(new Path2D(od));
          }
        } finally {
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    } catch (_) {
      // Path2D or draw fallback
    }
    ctx.restore();
  }

  ctx.restore();
}
