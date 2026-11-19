import { expect, test, type Page } from '@playwright/test';

interface Hook {
  top: {
    name: string;
    session?: {
      hits: number;
      prey: { pos: { x: number; y: number }; catchable: boolean; state: string; sub: string; r: number };
    };
  };
}

const top = (page: Page) => page.evaluate(() => (window as unknown as { __app: Hook }).__app.top.name);

/** Pointer events straight on the canvas: several fingers at once, which Playwright's touchscreen cannot hold. */
async function pointer(page: Page, type: string, id: number, x: number, y: number) {
  await page.evaluate(
    ([type, id, x, y]) => {
      const c = document.getElementById('screen')!;
      c.dispatchEvent(
        new PointerEvent(`pointer${type}`, { pointerId: id as number, clientX: x as number, clientY: y as number, pointerType: 'touch', bubbles: true }),
      );
    },
    [type, id, x, y] as const,
  );
}

async function start(page: Page) {
  await page.goto('/?seed=5');
  await expect.poll(() => top(page)).toBe('start');
  const box = page.viewportSize()!;
  await pointer(page, 'down', 1, box.width / 2, box.height * 0.45);
  await pointer(page, 'up', 1, box.width / 2, box.height * 0.45);
  await expect.poll(() => top(page)).toBe('hunt');
}

test('a paw on the prey counts as a hit', async ({ page }) => {
  await start(page);
  // wait for the prey out on the screen, then strike where it is
  await page.waitForFunction(
    () => {
      const p = (window as unknown as { __app: Hook }).__app.top.session?.prey;
      return !!p && p.catchable && ['creep', 'freeze', 'edge'].includes(p.state);
    },
    null,
    { timeout: 45_000 },
  );
  const p = await page.evaluate(() => (window as unknown as { __app: Hook }).__app.top.session!.prey.pos);
  await pointer(page, 'down', 2, p.x, p.y);
  await pointer(page, 'up', 2, p.x, p.y);
  const hits = await page.evaluate(() => (window as unknown as { __app: Hook }).__app.top.session!.hits);
  expect(hits).toBe(1);
});

test('two opposite spots held pause the hunt, one spot does not', async ({ page }) => {
  await start(page);
  const { width: w, height: h } = page.viewportSize()!;
  await pointer(page, 'down', 3, 0.12 * w, 0.12 * h);
  await page.waitForTimeout(2000);
  expect(await top(page)).toBe('hunt');
  await pointer(page, 'down', 4, 0.88 * w, 0.88 * h);
  await expect.poll(() => top(page), { timeout: 4000 }).toBe('pause');
});

test('serves the manifest and the service worker relative to the page', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  expect(href).toBe('./manifest.webmanifest');
  const m = await (await request.get('/manifest.webmanifest')).json();
  expect(m.start_url).toBe('./');
  expect(m.display).toBe('fullscreen');
  expect((await request.get('/sw.js')).ok()).toBe(true);
});
