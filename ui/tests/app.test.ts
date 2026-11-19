import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, STEP, type Screen } from '../src/app';
import { fakeCanvas, stubWindow, type Call } from './stubs';

let frame: FrameRequestCallback | null;
let calls: Call[];
let win: ReturnType<typeof stubWindow>;

beforeEach(() => {
  frame = null;
  calls = [];
  win = stubWindow();
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => ((frame = f), 0));
});
afterEach(() => vi.unstubAllGlobals());

const screen = (over: Partial<Screen> = {}): Screen => ({ name: 'S', update: vi.fn(), draw: vi.fn(), ...over });

function app() {
  const c = fakeCanvas(calls);
  const a = new App(c.el as unknown as HTMLCanvasElement);
  return { a, c };
}

describe('app', () => {
  it('steps in fixed steps and draws the rest of a step as alpha', () => {
    const { a } = app();
    const s = screen();
    a.push(s);
    for (const t of [0, 16.7, 32.6, 50.1, 66.3, 83.4, 99.8, 116.8]) frame!(1000 + t);
    const steps = vi.mocked(s.update).mock.calls;
    for (const [dt] of steps) expect(dt).toBe(STEP);
    expect(steps.length).toBe(Math.floor(0.1168 / STEP));
    expect(a.alpha).toBeCloseTo((0.1168 % STEP) / STEP, 3);
    expect(s.draw).toHaveBeenCalled();
  });

  it('does not step while paused, and clears to black at device scale', () => {
    const { a } = app();
    const s = screen();
    a.push(s);
    a.paused = true;
    frame!(0);
    frame!(100);
    expect(s.update).not.toHaveBeenCalled();
    expect(calls.find((c) => c[0] === 'setTransform')!.slice(1)).toEqual([2, 0, 0, 2, 0, 0]);
    expect(calls.find((c) => c[0] === 'fillRect')!.slice(1)).toEqual([0, 0, 1194, 834]);
  });

  it('sizes the canvas in device pixels and tells the screens', () => {
    const { a, c } = app();
    const s = screen({ resize: vi.fn() });
    a.push(s);
    expect(c.el.width).toBe(2388);
    expect(c.el.style.width).toBe('1194px');
    expect(s.resize).toHaveBeenCalledWith(1194, 834);
    vi.stubGlobal('innerWidth', 600);
    for (const f of win.listeners.resize) f({});
    expect(s.resize).toHaveBeenLastCalledWith(600, 834);
  });

  it('keeps a stack: push, pop, replace, below', () => {
    const { a } = app();
    const s1 = screen({ enter: vi.fn(), leave: vi.fn() });
    const s2 = screen({ enter: vi.fn(), leave: vi.fn() });
    a.push(s1);
    a.push(s2);
    expect(a.top).toBe(s2);
    expect(a.below(s2)).toBe(s1);
    expect(a.below(s1)).toBeUndefined();
    expect(s1.leave).toHaveBeenCalled();
    a.pop();
    expect(a.top).toBe(s1);
    expect(s1.enter).toHaveBeenCalledTimes(2);
    const s3 = screen();
    a.replace(s3);
    expect(a.top).toBe(s3);
  });

  it('hands pointers to the top screen in CSS px with their kind', () => {
    const { a, c } = app();
    const pointer = vi.fn();
    a.push(screen({ pointer }));
    const e = { pointerId: 3, clientX: 10, clientY: 20, pointerType: 'touch', preventDefault: vi.fn() };
    c.on.pointerdown(e);
    c.on.pointermove(e);
    c.on.pointerup(e);
    c.on.pointercancel({ ...e, pointerType: '' });
    expect(pointer).toHaveBeenCalledWith({ type: 'down', id: 3, x: 10, y: 20, kind: 'touch' });
    expect(pointer).toHaveBeenLastCalledWith({ type: 'cancel', id: 3, x: 10, y: 20, kind: 'mouse' });
    expect(c.el.setPointerCapture).toHaveBeenCalledWith(3);
    const t = { preventDefault: vi.fn() };
    c.on.touchstart(t);
    expect(t.preventDefault).toHaveBeenCalled();
  });

  it('takes keys from the browser but leaves shortcuts alone', () => {
    const { a } = app();
    const key = vi.fn();
    a.push(screen({ key }));
    const down = (k: string, mods = {}) => {
      const e = { key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods, preventDefault: vi.fn() };
      for (const f of win.listeners.keydown) f(e);
      return e;
    };
    expect(down('Escape').preventDefault).toHaveBeenCalled();
    // a held key's repeats do not reach the screen (Escape would toggle the pause)
    expect(down('Escape', { repeat: true }).preventDefault).toHaveBeenCalled();
    expect(down('r', { metaKey: true }).preventDefault).not.toHaveBeenCalled();
    expect(down('F5').preventDefault).not.toHaveBeenCalled();
    for (const f of win.listeners.keyup) f({ key: 'Escape' });
    expect(key).toHaveBeenCalledTimes(2);
  });
});
