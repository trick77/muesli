// The README's images: not a test. Needs a running preview and ffmpeg on the PATH:
//   node e2e/shots.ts <baseURL> <outDir> [seed]
// Writes <outDir>/hunt.gif (the liveliest seconds of ?demo, a pretend cat playing) and <outDir>/trace.png (?trace).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices, webkit } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = process.argv[3] ?? 'test-results/shots';
const seed = Number(process.argv[4] ?? 7);

/** Recorded small on purpose: the prey keeps its minimum size, so it fills more of a small screen. */
const W = 560;
const H = 392;
const GIF_W = 480;
/** Seconds recorded, and the stretch of them kept. */
const RECORD = 45;
const KEEP = 8;

interface Hook {
  top: { session?: { prey: { pos: { x: number; y: number }; visible: boolean; state: string }; hits: number } };
}

const run = async () => {
  const dir = mkdtempSync(join(tmpdir(), 'muesli-shots-'));
  try {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: W, height: H },
      recordVideo: { dir, size: { width: W, height: H } },
    });
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(`${base}/?demo&seed=${seed}`);
    // Sample the prey ten times a second: where it is, whether it is out in the open.
    const samples: { t: number; x: number; y: number; open: boolean; hits: number }[] = [];
    while (Date.now() - t0 < RECORD * 1000) {
      const s = await page.evaluate(() => {
        const s = (window as unknown as { __app: Hook }).__app.top.session;
        if (!s) return null;
        const p = s.prey;
        return {
          x: p.pos.x,
          y: p.pos.y,
          open: p.visible && ['creep', 'freeze', 'bolt', 'edge', 'caught', 'lure'].includes(p.state),
          hits: s.hits,
        };
      });
      if (s) samples.push({ t: (Date.now() - t0) / 1000, ...s });
      await page.waitForTimeout(100);
    }
    const video = await page.video()!.path();
    await ctx.close();
    await browser.close();

    // The liveliest window: distance run in the open, plus a bonus per hit.
    let best = 1;
    let bestScore = -1;
    for (let a = 0; a < samples.length; a++) {
      const from = samples[a];
      if (from.t < 1 || from.t + KEEP > RECORD - 1) continue;
      let score = 0;
      let i = a + 1;
      for (; i < samples.length && samples[i].t < from.t + KEEP; i++) {
        const p = samples[i - 1];
        const q = samples[i];
        if (p.open && q.open) score += Math.hypot(q.x - p.x, q.y - p.y);
        else score -= 15; // empty screen stretches cost
      }
      score += 150 * (samples[i - 1].hits - from.hits);
      if (score > bestScore) {
        bestScore = score;
        best = from.t;
      }
    }
    // A palette of the few colours on screen keeps the GIF small and the edges hard.
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      best.toFixed(2),
      '-t',
      String(KEEP),
      '-i',
      video,
      '-vf',
      `fps=20,scale=${GIF_W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=24:stats_mode=diff[p];[b][p]paletteuse=dither=none`,
      '-loop',
      '0',
      `${out}/hunt.gif`,
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const wk = await webkit.launch();
  const page = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await page.goto(`${base}/?trace&seed=7`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/trace.png` });
  await wk.close();
};

void run();
