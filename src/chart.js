import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';

/**
 * Score-trend chart rendered server-side with @napi-rs/canvas.
 *
 * PeakSense's "live graph" is a per-sample heater-temperature line
 * chart. The public API exposes only per-dab aggregates (no sample
 * stream), so we can't reproduce that exact curve. Instead we draw a
 * trend of the user's recent dab SCORES over time in the live graph's
 * visual language: a single line + area fill over a dark panel, with
 * axis ticks. This is "a graph based on dab data" in the live graph's
 * style.
 */

const W = 720;
const H = 240;
const PAD_L = 46;
const PAD_R = 18;
const PAD_T = 22;
const PAD_B = 34;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

// Match the bot's PeakSense green on a dark panel.
const BG = '#0b1220';
const GRID = '#1e293b';
const AXIS = '#64748b';
const LINE = '#22c55e';
const TITLE = '#e2e8f0';

// Register a font for Linux (node:20-slim ships none). Windows/macOS
// fall back to the system sans-serif.
let FONT_FAMILY = 'sans-serif';
try {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      GlobalFonts.registerFromPath(p, 'DejaVu');
      FONT_FAMILY = 'DejaVu';
      break;
    }
  }
} catch {
  // registration best-effort; text is optional
}

function font(size, bold = false) {
  return `${bold ? 'bold ' : ''}${size}px ${FONT_FAMILY}`;
}

function xPos(ts, xMin, xMax) {
  if (xMax <= xMin) return PAD_L + PLOT_W / 2;
  return PAD_L + ((ts - xMin) / (xMax - xMin)) * PLOT_W;
}
function yPos(score) {
  return PAD_T + (1 - score / 100) * PLOT_H;
}

function formatTick(ts, span) {
  const d = new Date(ts);
  const spanDays = span / 86400000;
  if (spanDays >= 2) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Build a PNG score-trend chart from an array of dabs.
 * Returns a Buffer, or null when there is not enough data to plot.
 */
export function buildScoreTrend(dabs) {
  const points = (dabs ?? [])
    .filter((d) => d && Number.isFinite(d.createdAt) && Number.isFinite(d.score))
    .map((d) => ({ ts: Number(d.createdAt), score: Math.max(0, Math.min(100, Number(d.score))) }))
    .sort((a, b) => a.ts - b.ts);
  if (points.length < 2) return null;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Panel background.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Title / caption.
  ctx.fillStyle = TITLE;
  ctx.font = font(14, true);
  ctx.fillText('Score trend', PAD_L, 16);
  ctx.fillStyle = AXIS;
  ctx.font = font(11);
  ctx.fillText(`last ${points.length} public dabs`, PAD_L + 92, 16);

  const xMin = points[0].ts;
  const xMax = points[points.length - 1].ts;
  const span = xMax - xMin || 1;

  // Horizontal gridlines + Y tick labels (0..100).
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = font(11);
  for (const v of [0, 25, 50, 75, 100]) {
    const y = yPos(v);
    ctx.strokeStyle = v === 0 ? AXIS : GRID;
    ctx.lineWidth = v === 0 ? 1.2 : 1;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(W - PAD_R, y);
    ctx.stroke();
    ctx.fillStyle = AXIS;
    ctx.fillText(String(v), PAD_L - 8, y);
  }

  // X tick labels (4 ticks).
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const ts = xMin + (span * i) / ticks;
    const x = xPos(ts, xMin, xMax);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, PAD_T);
    ctx.lineTo(x, PAD_T + PLOT_H);
    ctx.stroke();
    ctx.fillStyle = AXIS;
    ctx.fillText(formatTick(ts, span), x, H - PAD_B + 6);
  }

  // Area fill under the line.
  const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + PLOT_H);
  grad.addColorStop(0, 'rgba(34, 197, 94, 0.35)');
  grad.addColorStop(1, 'rgba(34, 197, 94, 0.02)');
  ctx.beginPath();
  ctx.moveTo(xPos(points[0].ts, xMin, xMax), yPos(points[0].score));
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(xPos(points[i].ts, xMin, xMax), yPos(points[i].score));
  }
  ctx.lineTo(xPos(xMax, xMin, xMax), PAD_T + PLOT_H);
  ctx.lineTo(xPos(xMin, xMin, xMax), PAD_T + PLOT_H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line through every point (straight segments, like the live graph).
  ctx.beginPath();
  ctx.moveTo(xPos(points[0].ts, xMin, xMax), yPos(points[0].score));
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(xPos(points[i].ts, xMin, xMax), yPos(points[i].score));
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Point dots (small, skipped when very dense).
  const r = points.length > 24 ? 1.6 : 2.6;
  ctx.fillStyle = LINE;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(xPos(p.ts, xMin, xMax), yPos(p.score), r, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}


// ---------------------------------------------------------------------------
// Per-dab heater-temperature trace graph.
//
// PeakSense stores the real heater-temp sample stream on each dab
// (migration 006: dabs.trace = JSON array of {ts, tempC}) and exposes
// it on GET /api/dabs/:id as dab.trace. This renders THAT data exactly
// in the live graph's style (line + area, °F axis, time axis, straight
// segments through every sample so a draw dip is drawn at its true
// depth). It never fabricates a curve: if the dab has no trace
// (pre-006 dabs, or the client never sent one) it returns null and the
// caller simply omits the image.

const T_W = 600;
const T_H = 200;
const T_PAD_L = 50;
const T_PAD_R = 16;
const T_PAD_T = 16;
const T_PAD_B = 28;
const T_PLOT_W = T_W - T_PAD_L - T_PAD_R;
const T_PLOT_H = T_H - T_PAD_T - T_PAD_B;

function toF(c) {
  return (c * 9) / 5 + 32;
}

export function buildDabTraceGraph(dab) {
  const trace = dab?.trace;
  if (!Array.isArray(trace) || trace.length < 2) return null;
  const pts = trace
    .filter((p) => p && Number.isFinite(p.ts) && Number.isFinite(p.tempC))
    .map((p) => ({ ts: Number(p.ts), tempF: toF(Number(p.tempC)) }))
    .sort((a, b) => a.ts - b.ts);
  if (pts.length < 2) return null;

  const canvas = createCanvas(T_W, T_H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, T_W, T_H);

  const xMin = pts[0].ts;
  const xMax = pts[pts.length - 1].ts;
  const xSpan = xMax - xMin || 1;
  const temps = pts.map((p) => p.tempF);
  let yMin = Math.min(...temps) - 8;
  let yMax = Math.max(...temps) + 8;
  if (yMax <= yMin) yMax = yMin + 1;

  const xPos = (ts) => T_PAD_L + ((ts - xMin) / xSpan) * T_PLOT_W;
  const yPos = (t) => T_PAD_T + (1 - (t - yMin) / (yMax - yMin)) * T_PLOT_H;

  // Caption.
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = TITLE;
  ctx.font = font(13, true);
  ctx.fillText('Heater temp', T_PAD_L, 2);
  ctx.fillStyle = AXIS;
  ctx.font = font(11);
  const durS = Math.round(xSpan / 1000);
  ctx.fillText(`${pts.length} samples • ${durS}s`, T_PAD_L + 92, 3);

  // Y gridlines + ticks (°F).
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = font(11);
  for (let i = 0; i <= 4; i++) {
    const v = yMin + ((yMax - yMin) * i) / 4;
    const y = yPos(v);
    ctx.strokeStyle = i === 0 ? AXIS : GRID;
    ctx.lineWidth = i === 0 ? 1.2 : 1;
    ctx.beginPath();
    ctx.moveTo(T_PAD_L, y);
    ctx.lineTo(T_W - T_PAD_R, y);
    ctx.stroke();
    ctx.fillStyle = AXIS;
    ctx.fillText(`${Math.round(v)}°F`, T_PAD_L - 6, y);
  }

  // X gridlines + ticks (elapsed seconds).
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i <= 4; i++) {
    const ts = xMin + (xSpan * i) / 4;
    const x = xPos(ts);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, T_PAD_T);
    ctx.lineTo(x, T_PAD_T + T_PLOT_H);
    ctx.stroke();
    ctx.fillStyle = AXIS;
    ctx.fillText(`${Math.round((ts - xMin) / 1000)}s`, x, T_H - T_PAD_B + 4);
  }

  // Area fill under the line.
  const grad = ctx.createLinearGradient(0, T_PAD_T, 0, T_PAD_T + T_PLOT_H);
  grad.addColorStop(0, 'rgba(34, 197, 94, 0.35)');
  grad.addColorStop(1, 'rgba(34, 197, 94, 0.02)');
  ctx.beginPath();
  ctx.moveTo(xPos(pts[0].ts), yPos(pts[0].tempF));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(xPos(pts[i].ts), yPos(pts[i].tempF));
  ctx.lineTo(xPos(xMax), T_PAD_T + T_PLOT_H);
  ctx.lineTo(xPos(xMin), T_PAD_T + T_PLOT_H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Straight-line path through every raw sample (never overshoots).
  ctx.beginPath();
  ctx.moveTo(xPos(pts[0].ts), yPos(pts[0].tempF));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(xPos(pts[i].ts), yPos(pts[i].tempF));
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  return canvas.toBuffer('image/png');
}
