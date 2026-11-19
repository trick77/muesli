// The three prey shapes as flat, hard-edged silhouettes: no eyes, no ears, no inner lines (a cat sees coarse shapes
// up close; at GDC 2019 a developer of cat games reported realistic mice failing and simplified shapes working). What
// counts is the moving outline, so tail and legs are thick and move a lot.
import type { Color, Variant } from '../game/look';
import { PREY_COLOR } from './palette';

interface P {
  x: number;
  y: number;
}

/** Everything the drawing needs, interpolated by the screen. */
export interface PreyView {
  x: number;
  y: number;
  heading: number;
  r: number;
  variant: Variant;
  color: Color;
  opacity: number;
  wounds: number;
  /** Standing (freeze, peek hold, dead): the tail and legs twitch instead of walking. */
  still: boolean;
  /** Pinned under a paw: struggles. */
  caught: boolean;
  dead: boolean;
  /** Seconds, for twitches. */
  t: number;
  /** Distance walked, px: leg and tail phase. */
  walked: number;
  /** Recent positions, newest first. */
  trail: readonly P[];
}

export function drawPrey(ctx: CanvasRenderingContext2D, v: PreyView) {
  if (v.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = v.opacity;
  ctx.fillStyle = PREY_COLOR[v.color];
  ctx.strokeStyle = PREY_COLOR[v.color];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let heading = v.heading;
  // A struggle under the paw: it writhes on the spot.
  if (v.caught) heading += Math.sin(v.t * 38) * 0.35;
  if (v.variant === 'mouse') drawTail(ctx, v, heading);
  ctx.translate(v.x, v.y);
  ctx.rotate(heading);
  if (v.dead) ctx.scale(1, 0.8);
  switch (v.variant) {
    case 'dot':
      drawDot(ctx, v);
      break;
    case 'mouse':
      drawMouse(ctx, v.r);
      break;
    case 'beetle':
      drawBeetle(ctx, v);
      break;
  }
  ctx.restore();
}

/** How far the standing dot swells and shrinks, as a share of its radius. */
export const PULSE = 0.2;

/** Each hit leaves it a little smaller. */
export const dotRadius = (r: number, wounds: number) => r * Math.pow(0.88, wounds);

function drawDot(ctx: CanvasRenderingContext2D, v: PreyView) {
  // breathes while it stands still, listening
  // 0.8x to 1.2x: a clear swell, the outline is what the cat sees
  const pulse = v.still && !v.dead ? 1 + PULSE * Math.sin(v.t * 7) : 1;
  ctx.beginPath();
  ctx.arc(0, 0, dotRadius(v.r, v.wounds) * pulse, 0, Math.PI * 2);
  ctx.fill();
}

/** A drop: round back, pointed nose forward (+x). */
function drawMouse(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(1.75 * r, 0);
  ctx.quadraticCurveTo(0.9 * r, -0.95 * r, -0.4 * r, -0.85 * r);
  ctx.quadraticCurveTo(-1.35 * r, -0.7 * r, -1.35 * r, 0);
  ctx.quadraticCurveTo(-1.35 * r, 0.7 * r, -0.4 * r, 0.85 * r);
  ctx.quadraticCurveTo(0.9 * r, 0.95 * r, 1.75 * r, 0);
  ctx.closePath();
  ctx.fill();
}

/** Tail length over r: each hit takes a piece. */
export const tailLength = (wounds: number) => Math.max(0.5, 2.4 - 0.55 * wounds);

/** The tail trails along the path the mouse walked, so it swings out behind every turn. */
function drawTail(ctx: CanvasRenderingContext2D, v: PreyView, heading: number) {
  const r = v.r;
  const root = { x: v.x - Math.cos(heading) * 1.2 * r, y: v.y - Math.sin(heading) * 1.2 * r };
  const pts = tailPoints(root, heading, v.trail, tailLength(v.wounds) * r);
  if (v.still && !v.dead) {
    // the tip flicks while it listens
    const tip = pts[pts.length - 1];
    const prev = pts[pts.length - 2] ?? root;
    const a = Math.atan2(tip.y - prev.y, tip.x - prev.x) + Math.PI / 2;
    const k = Math.sin(v.t * 5) * Math.sin(v.t * 1.3) * 0.5 * r;
    pts[pts.length - 1] = { x: tip.x + Math.cos(a) * k, y: tip.y + Math.sin(a) * k };
  }
  ctx.lineWidth = 0.45 * r;
  ctx.beginPath();
  ctx.moveTo(root.x, root.y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

/** Tail segments, and how far each may bend against the one before (rad). */
export const TAIL_SEGS = 8;
export const TAIL_BEND = 0.35;

/**
 * The tail: `len` px from the root, leaving the body straight backwards and then drawn toward the path the mouse
 * walked, bending at most TAIL_BEND per segment. So it swings out behind a turn but never sticks out of the side.
 */
export function tailPoints(root: P, heading: number, trail: readonly P[], len: number): P[] {
  const seg = len / TAIL_SEGS;
  const hx = Math.cos(heading);
  const hy = Math.sin(heading);
  // the trail's newest points sit under the body: only what lies behind the tail root
  const behind = trail.filter((p) => (p.x - root.x) * hx + (p.y - root.y) * hy < -0.05 * len);
  const out: P[] = [];
  let cur = root;
  let dir = heading + Math.PI;
  let k = 0;
  for (let i = 0; i < TAIL_SEGS; i++) {
    while (k < behind.length && Math.hypot(behind[k].x - cur.x, behind[k].y - cur.y) < seg) k++;
    if (k < behind.length) {
      let want = Math.atan2(behind[k].y - cur.y, behind[k].x - cur.x) - dir;
      want = Math.atan2(Math.sin(want), Math.cos(want));
      dir += Math.max(-TAIL_BEND, Math.min(TAIL_BEND, want));
    }
    cur = { x: cur.x + Math.cos(dir) * seg, y: cur.y + Math.sin(dir) * seg };
    out.push(cur);
  }
  return out;
}

/** Legs that are left after `wounds` hits: one less per hit, at least two. */
export const legCount = (wounds: number) => Math.max(2, 6 - wounds);

function drawBeetle(ctx: CanvasRenderingContext2D, v: PreyView) {
  const r = v.r;
  // tripod gait: legs 0, 3, 4 swing together against 1, 2, 5
  const phase = v.still ? Math.sin(v.t * 9) * Math.sin(v.t * 2.1) * 0.25 : Math.sin(v.walked / (0.55 * r)) * 0.55;
  const legs: [number, number, number][] = [
    [0.55, -1, 0],
    [0.55, 1, 1],
    [0, -1, 1],
    [0, 1, 0],
    [-0.55, -1, 0],
    [-0.55, 1, 1],
  ];
  ctx.lineWidth = 0.38 * r;
  const n = legCount(v.wounds);
  for (let i = 0; i < n; i++) {
    const [lx, side, group] = legs[i];
    const swing = group ? phase : -phase;
    const a = side * (Math.PI / 2) + swing * side;
    const x0 = lx * r;
    const y0 = side * 0.55 * r;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(a) * 0.9 * r, y0 + Math.sin(a) * 0.9 * r);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.15 * r, 0.8 * r, 0, 0, Math.PI * 2);
  ctx.fill();
}
