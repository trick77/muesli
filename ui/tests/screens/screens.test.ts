import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, Ptr, Screen } from '../../src/app';
import { audio, resetAudio } from '../../src/audio/engine';
import { DoneScreen, RESTART_HOLD } from '../../src/screens/done';
import { HuntScreen, PAUSE_HOLD, PAUSE_SPOTS, view } from '../../src/screens/hunt';
import { PauseScreen } from '../../src/screens/pause';
import { StartScreen } from '../../src/screens/start';
import { mmss, StatsScreen } from '../../src/screens/stats';
import { simulate, TraceScreen } from '../../src/screens/trace';
import { Hold, inside, restartIcon, unit } from '../../src/screens/ui';
import { settings } from '../../src/platform/settings';
import { empty, merge } from '../../src/game/learn';
import { recCtx, stubWindow, texts, type Call } from '../stubs';

const W = 1194;
const H = 834;

/** An App stand-in that keeps the stack. */
function fakeApp() {
  const stack: Screen[] = [];
  const app = {
    w: W,
    h: H,
    alpha: 0.5,
    canvas: { style: {} as Record<string, string> },
    get top() {
      return stack[stack.length - 1];
    },
    push: (s: Screen) => {
      stack.push(s);
      s.resize?.(W, H);
      s.enter?.();
    },
    pop: () => {
      stack.pop()?.leave?.();
      stack[stack.length - 1]?.enter?.();
    },
    replace: (s: Screen) => {
      stack.length = 0;
      stack.push(s);
      s.resize?.(W, H);
      s.enter?.();
    },
    below: () => undefined,
  };
  return { app: app as unknown as App, stack };
}

const ptr = (type: Ptr['type'], x: number, y: number, id = 1, kind = 'touch'): Ptr => ({ type, id, x, y, kind });

function draw(s: Screen) {
  const calls: Call[] = [];
  s.draw(recCtx(calls), W, H);
  return calls;
}

beforeEach(() => {
  stubWindow({ touch: true });
  resetAudio();
});
afterEach(() => vi.unstubAllGlobals());

describe('start screen', () => {
  it('shows the controls and toggles sound and length', () => {
    const { app } = fakeApp();
    const s = new StartScreen(app);
    app.replace(s);
    const t = texts(draw(s));
    expect(t).toContain('Müsli');
    expect(t).toContain('Tippen zum Starten');
    expect(t).toContain('Ton: an');
    expect(t).toContain('Vollbild: Teilen → Zum Home-Bildschirm');
    // the buttons sit in a row under the start area
    const y = H * 0.68 + 5;
    // three buttons, each 12 units wide, one unit apart
    s.pointer(ptr('down', W / 2 - 13 * unit(W, H), y));
    expect(settings.muted).toBe(true);
    s.pointer(ptr('down', W / 2, y));
    expect(settings.minutes).toBe(3);
    s.pointer(ptr('down', W / 2, y));
    s.pointer(ptr('down', W / 2, y));
    expect(settings.minutes).toBe(2);
    s.pointer(ptr('up', W / 2, y));
    s.update();
  });

  it('starts a hunt on a tap or a key, opens the stats', () => {
    const { app, stack } = fakeApp();
    const s = new StartScreen(app, { seed: 1 });
    app.replace(s);
    draw(s);
    s.pointer(ptr('down', W / 2 + 13 * unit(W, H), H * 0.68 + 5));
    expect(stack.at(-1)!.name).toBe('stats');
    app.pop();
    s.pointer(ptr('down', W / 2, H / 2 - 50));
    // not on touching down: fullscreen needs the release
    expect(stack.at(-1)!.name).toBe('start');
    // a release elsewhere, or of a tap that began elsewhere, starts nothing
    s.pointer(ptr('up', 5, 5));
    expect(stack.at(-1)!.name).toBe('start');
    s.pointer(ptr('down', 5, 5, 2));
    s.pointer(ptr('up', W / 2, H / 2 - 50, 2));
    expect(stack.at(-1)!.name).toBe('start');
    s.pointer(ptr('down', W / 2, H / 2 - 50, 3));
    s.pointer(ptr('up', W / 2, H / 2 - 40, 3));
    expect(stack.at(-1)!.name).toBe('hunt');
    const s2 = new StartScreen(app);
    app.replace(s2);
    s2.key!({ key: 'Enter' } as KeyboardEvent, true);
    expect(stack.at(-1)!.name).toBe('hunt');
  });
});

describe('hunt screen, review fixes', () => {
  it('hides the mouse pointer only while the hunt is on top', () => {
    const { app } = fakeApp();
    const h = new HuntScreen(app, { seed: 1 });
    app.replace(h);
    expect(app.canvas.style.cursor).toBe('none');
    h.leave();
    expect(app.canvas.style.cursor).toBe('');
  });

  it('never opens the pause over the end screen', () => {
    const { app, stack } = fakeApp();
    const h = new HuntScreen(app, { seed: 2 });
    app.replace(h);
    const [a, b] = PAUSE_SPOTS.map(([fx, fy]) => [fx * W, fy * H]);
    h.pointer(ptr('down', a[0], a[1], 1));
    h.pointer(ptr('down', b[0], b[1], 2));
    h.pause.progress = 0.999;
    h.session.events.push({ kind: 'end' });
    h.update(1 / 60);
    expect(stack.map((s) => s.name)).toEqual(['done']);
  });

  it('counts a session without any touch, and a desktop one, but learns nothing from it', () => {
    stubWindow({ touch: false });
    settings.minutes = 2;
    const { app, stack } = fakeApp();
    const h = new HuntScreen(app, { seed: 3 });
    app.replace(h);
    for (let i = 0; i < 60 * 160 && stack.at(-1) === h; i++) h.update(1 / 60);
    expect(stack.at(-1)!.name).toBe('done');
    expect(settings.learn.sessions).toBe(1);
    expect(settings.learn.longest).toBeGreaterThan(119);
    expect(settings.learn.feats).toEqual({});
  });

  it('drops the late rustle of a prey that left once the hunt is paused', () => {
    vi.useFakeTimers();
    try {
      const { app } = fakeApp();
      const h = new HuntScreen(app, { seed: 4 });
      app.replace(h);
      const play = vi.spyOn(audio, 'play');
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      h.session.events.push({ kind: 'away', x: 0, y: 0, side: 'left', prey: h.session.prey });
      h.update(1 / 60);
      app.push(new PauseScreen(app, h));
      vi.advanceTimersByTime(3000);
      expect(play.mock.calls.filter((c) => c[0] === 'rustle' && c[1] === -1)).toHaveLength(0);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});

describe('hunt screen', () => {
  it('runs the session, draws the prey and sounds its events', () => {
    const { app } = fakeApp();
    const h = new HuntScreen(app, { seed: 4, demo: true });
    app.replace(h);
    let drawn = false;
    for (let i = 0; i < 60 * 20; i++) {
      h.update(1 / 60);
      if (draw(h).some((c) => c[0] === 'fill')) drawn = true;
    }
    expect(drawn).toBe(true);
    expect(h.session.t).toBeGreaterThan(19);
  });

  it('pauses on a two-spot hold or Escape, never on one spot', () => {
    const { app, stack } = fakeApp();
    const h = new HuntScreen(app, { seed: 2 });
    app.replace(h);
    const [a, b] = PAUSE_SPOTS.map(([fx, fy]) => [fx * W, fy * H]);
    h.pointer(ptr('down', a[0], a[1], 1));
    for (let i = 0; i < 60 * (PAUSE_HOLD + 0.5); i++) h.update(1 / 60);
    expect(stack.at(-1)!.name).toBe('hunt');
    h.pointer(ptr('down', b[0], b[1], 2));
    expect(draw(h).some((c) => c[0] === 'arc')).toBe(true); // the rings show while held
    for (let i = 0; i < 60 * (PAUSE_HOLD + 0.1); i++) h.update(1 / 60);
    expect(stack.at(-1)!.name).toBe('pause');
    app.pop();
    h.key({ key: 'Escape' } as KeyboardEvent, true);
    expect(stack.at(-1)!.name).toBe('pause');
  });

  it('ends on its own, learns from the paws and shows the end screen', () => {
    settings.minutes = 2;
    const { app, stack } = fakeApp();
    const h = new HuntScreen(app, { seed: 5, demo: true });
    app.replace(h);
    for (let i = 0; i < 60 * 160 && stack.at(-1) === h; i++) {
      h.update(1 / 60);
      const p = h.session.prey;
      if (i % 90 === 0 && p.catchable) h.pointer(ptr('down', p.pos.x, p.pos.y, i));
    }
    expect(stack.at(-1)!.name).toBe('done');
    expect(settings.learn.sessions).toBe(1);
    expect(settings.lastLook).not.toBeNull();
    h.end(); // twice is harmless
  });

  it('follows a rotation', () => {
    const { app } = fakeApp();
    const h = new HuntScreen(app, { seed: 6 });
    app.replace(h);
    h.resize(400, 800);
    expect(h.session.field.w).toBe(400);
    expect(h.pause.spots[1].y).toBeCloseTo(0.88 * 800);
  });

  it('draws the prey between the last two steps', () => {
    const { app } = fakeApp();
    const h = new HuntScreen(app, { seed: 7 });
    const p = h.session.prey;
    p.prev = { x: 0, y: 0 };
    p.pos = { x: 10, y: 20 };
    p.prevHeading = 3;
    p.heading = -3;
    const v = view(p, 0.5, 1);
    expect(v.x).toBe(5);
    expect(v.y).toBe(10);
    // the short way round, through pi
    expect(Math.abs(v.heading)).toBeGreaterThan(3);
    expect(app).toBeTruthy();
  });
});

describe('pause screen', () => {
  it('resumes, toggles sound, opens stats, quits', () => {
    const { app, stack } = fakeApp();
    const h = new HuntScreen(app, { seed: 8 });
    app.replace(h);
    const p = new PauseScreen(app, h);
    app.push(p);
    const t = texts(draw(p));
    expect(t).toEqual(expect.arrayContaining(['Pause', 'Weiter', 'Beenden']));
    const u = unit(W, H);
    const row = (i: number) => H * 0.32 + i * (2.8 * u + u) + u;
    p.pointer(ptr('down', W / 2, row(1)));
    expect(settings.muted).toBe(true);
    p.pointer(ptr('down', W / 2, row(2)));
    expect(stack.at(-1)!.name).toBe('stats');
    app.pop();
    p.update();
    p.pointer(ptr('down', W / 2, row(0)));
    expect(stack.at(-1)!.name).toBe('hunt');
    app.push(p);
    p.key({ key: 'Escape' } as KeyboardEvent, true);
    expect(stack.at(-1)!.name).toBe('hunt');
    app.push(p);
    draw(p);
    p.pointer(ptr('down', W / 2, row(3)));
    expect(stack.at(-1)!.name).toBe('start');
  });
});

describe('stats screen', () => {
  it('shows what was learned and resets on a hold', () => {
    settings.learn = merge(empty(), { 'variant:mouse': { t: 6, s: 60 }, 'color:lime': { t: 6, s: 60 } }, 95);
    const { app, stack } = fakeApp();
    app.push(new StartScreen(app));
    const s = new StatsScreen(app);
    app.push(s);
    const t = texts(draw(s));
    expect(t).toEqual(expect.arrayContaining(['Maus', 'Limette', '6.0/Min.']));
    expect(t.some((x) => x.includes('Längste: 1:35'))).toBe(true);
    const u = unit(W, H);
    const bw = Math.min(W * 0.3, 11 * u);
    s.pointer(ptr('down', W / 2 + u / 2 + bw / 2, H * 0.87 + u));
    for (let i = 0; i < 70; i++) s.update(1 / 60);
    expect(settings.learn).toEqual(empty());
    expect(texts(draw(s))).toContain('Noch keine Berührungen gezählt.');
    s.pointer(ptr('down', W / 2 - u, H * 0.87 + u));
    expect(stack.at(-1)!.name).toBe('start');
    app.push(s);
    s.key({ key: 'Escape' } as KeyboardEvent, true);
    expect(stack.at(-1)!.name).toBe('start');
    expect(mmss(61)).toBe('1:01');
  });
});

describe('done screen', () => {
  it('a tap starts nothing, a 1 s hold starts a new hunt', () => {
    const { app, stack } = fakeApp();
    const d = new DoneScreen(app);
    app.replace(d);
    expect(texts(draw(d))).toContain('Fertig. Zeit für ein Leckerli.');
    d.pointer(ptr('down', W / 2, H / 2));
    d.pointer(ptr('up', W / 2, H / 2));
    for (let i = 0; i < 120; i++) d.update(1 / 60);
    expect(stack.at(-1)).toBe(d);
    d.pointer(ptr('down', W / 2, H / 2));
    for (let i = 0; i < 60 * (RESTART_HOLD + 0.1); i++) d.update(1 / 60);
    expect(stack.at(-1)!.name).toBe('hunt');
  });

  it('a click on a desktop restarts at once; holding below goes to the settings', () => {
    const { app, stack } = fakeApp();
    const d = new DoneScreen(app);
    app.replace(d);
    d.pointer(ptr('down', W / 2, H / 2, 1, 'mouse'));
    expect(stack.at(-1)!.name).toBe('hunt');
    const d2 = new DoneScreen(app);
    app.replace(d2);
    d2.pointer(ptr('down', W / 2, H * 0.88));
    d2.draw(recCtx(), W, H);
    for (let i = 0; i < 70; i++) d2.update(1 / 60);
    expect(stack.at(-1)!.name).toBe('start');
    const d3 = new DoneScreen(app);
    app.replace(d3);
    d3.pointer(ptr('down', W / 2, H * 0.88, 1, 'mouse'));
    expect(stack.at(-1)!.name).toBe('start');
    const d4 = new DoneScreen(app);
    app.replace(d4);
    d4.key({ key: ' ' } as KeyboardEvent, true);
    expect(stack.at(-1)!.name).toBe('hunt');
    const d5 = new DoneScreen(app);
    app.replace(d5);
    d5.key({ key: 'Escape' } as KeyboardEvent, true);
    expect(stack.at(-1)!.name).toBe('start');
  });
});

describe('trace view', () => {
  it('simulates a whole session and draws its path with a legend', () => {
    const d = simulate(3, W, H, 30);
    expect(d.segs.length).toBeGreaterThan(100);
    expect(d.stops.length).toBeGreaterThan(0);
    const { app } = fakeApp();
    const t = new TraceScreen(app, 3, 30);
    expect(draw(t)).toEqual([]);
    t.resize(W, H);
    t.update();
    const calls = draw(t);
    expect(texts(calls)).toEqual(expect.arrayContaining(['Stopp', 'Sprint', 'Blitz']));
    expect(calls.filter((c) => c[0] === 'lineTo').length).toBeGreaterThan(100);
  });
});

describe('ui helpers', () => {
  it('needs every spot held at once', () => {
    const h = new Hold(
      [
        { x: 0, y: 0, r: 10 },
        { x: 100, y: 0, r: 10 },
      ],
      1,
    );
    h.pointer('down', 1, 0, 0);
    expect(h.update(2)).toBe(false);
    expect(h.active).toBe(false);
    h.pointer('down', 2, 100, 0);
    expect(h.active).toBe(true);
    expect(h.update(0.5)).toBe(false);
    h.pointer('move', 2, 300, 0); // slid off
    expect(h.update(0.5)).toBe(false);
    expect(h.progress).toBe(0);
    h.pointer('move', 2, 100, 0);
    expect(h.update(1)).toBe(true);
    h.pointer('up', 1, 0, 0);
    h.clear();
    expect(inside({ x: 0, y: 0, w: 10, h: 10 }, 5, 5)).toBe(true);
    const calls: Call[] = [];
    restartIcon(recCtx(calls), 0, 0, 10);
    expect(calls.some((c) => c[0] === 'arc')).toBe(true);
  });
});
