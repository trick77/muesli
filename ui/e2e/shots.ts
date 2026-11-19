// Screenshots for a human to look at (and the README): not a test. Needs a running preview:
//   node e2e/shots.ts <baseURL> <outDir>
import { devices, webkit, type Page } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = process.argv[3] ?? 'test-results/shots';

interface Hook {
  top: {
    name: string;
    session?: {
      prey: { pos: { x: number; y: number }; r: number; catchable: boolean; state: string; sub: string };
      pointer(t: string, id: number, p: { x: number; y: number }, k: string): void;
    };
  };
}

/** Waits for the prey out in the open, then strikes it: the shot shows the burst. */
async function action(page: Page, file: string) {
  await page.waitForFunction(
    () => {
      const p = (window as unknown as { __app: Hook }).__app.top.session?.prey;
      const m = 70;
      return (
        !!p &&
        p.catchable &&
        ['creep', 'edge', 'freeze', 'bolt'].includes(p.state) &&
        p.pos.x > m &&
        p.pos.y > m &&
        p.pos.x < innerWidth - m &&
        p.pos.y < innerHeight - m
      );
    },
    null,
    { timeout: 60_000, polling: 50 },
  );
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const s = (window as unknown as { __app: Hook }).__app.top.session!;
    const p = s.prey;
    s.pointer('down', 77, { x: p.pos.x + p.r * 0.5, y: p.pos.y }, 'touch');
    s.pointer('up', 77, { x: p.pos.x, y: p.pos.y }, 'touch');
  });
  await page.waitForTimeout(140);
  await page.screenshot({ path: file });
}

const run = async () => {
  const browser = await webkit.launch();
  for (const [dev, tag] of [
    ['iPad Pro 11 landscape', 'ipad'],
    ['iPhone 15', 'iphone'],
  ] as const) {
    const ctx = await browser.newContext({ ...devices[dev] });
    const page = await ctx.newPage();
    await page.goto(base + '/');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${tag}-start.png` });
    for (const seed of [3, 7, 11]) {
      await page.goto(`${base}/?demo&seed=${seed}`);
      await action(page, `${out}/${tag}-hunt-${seed}.png`);
    }
    for (const seed of [3, 7]) {
      await page.goto(`${base}/?trace&seed=${seed}`);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}/${tag}-trace-${seed}.png` });
    }
    await ctx.close();
  }
  await browser.close();
};

void run();
