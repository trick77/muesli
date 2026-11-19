// Node has no browser: just enough of canvas, audio, storage and the window for the screens and platform code.
import { vi } from 'vitest';

export type Call = [string, ...unknown[]];

/** A 2D context that records every method call; properties are plain fields. */
export function recCtx(calls: Call[] = []): CanvasRenderingContext2D {
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) =>
      k in t ? t[k] : (...a: unknown[]) => void calls.push([String(k), ...a]),
    set: (t, k, v) => ((t[k] = v), true),
  }) as unknown as CanvasRenderingContext2D;
}

/** Texts drawn with fillText. */
export const texts = (calls: Call[]) => calls.filter((c) => c[0] === 'fillText').map((c) => c[1] as string);

export class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** A Web Audio graph that only records what was made and connected. */
export function fakeAudio() {
  const made: string[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = (kind: string) => {
    made.push(kind);
    const n: Record<string, unknown> = {
      kind,
      gain: param(),
      frequency: param(),
      Q: param(),
      pan: param(),
      threshold: param(),
      ratio: param(),
      type: '',
      buffer: null,
      start: vi.fn(),
      stop: vi.fn(),
    };
    n.connect = (o: unknown) => o;
    return n;
  };
  class Ctx {
    state = 'suspended';
    sampleRate = 48000;
    currentTime = 0;
    destination = node('destination');
    resume = vi.fn(async () => {
      this.state = 'running';
    });
    suspend = vi.fn(async () => {
      this.state = 'suspended';
    });
    createBuffer = (_c: number, len: number) => {
      made.push('buffer');
      const d = new Float32Array(len);
      return { getChannelData: () => d };
    };
    createBufferSource = () => node('source');
    createGain = () => node('gain');
    createOscillator = () => node('osc');
    createBiquadFilter = () => node('filter');
    createStereoPanner = () => node('panner');
    createDynamicsCompressor = () => node('compressor');
  }
  return { Ctx, made };
}

/** Window, document, storage and navigator for screens and platform code. */
export function stubWindow(opts: { w?: number; h?: number; touch?: boolean } = {}) {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const on = (type: string, f: (e: unknown) => void) => (listeners[type] ??= []).push(f);
  const storage = new FakeStorage();
  const audio = fakeAudio();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('innerWidth', opts.w ?? 1194);
  vi.stubGlobal('innerHeight', opts.h ?? 834);
  vi.stubGlobal('addEventListener', on);
  vi.stubGlobal('screen', {});
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse') ? !!opts.touch : false }));
  vi.stubGlobal('getComputedStyle', () => ({ paddingTop: '10px', paddingRight: '0', paddingBottom: '20px', paddingLeft: '0' }));
  vi.stubGlobal('navigator', { maxTouchPoints: opts.touch ? 5 : 0 });
  vi.stubGlobal('window', { devicePixelRatio: 2, AudioContext: audio.Ctx });
  vi.stubGlobal('document', {
    hidden: false,
    visibilityState: 'visible',
    fullscreenElement: null,
    documentElement: {},
    body: { appendChild: vi.fn() },
    addEventListener: on,
    createElement: () => ({ style: {} }),
  });
  return { listeners, storage, audio };
}

/** A canvas good enough for App. */
export function fakeCanvas(calls: Call[] = []) {
  const ctx = recCtx(calls);
  const on: Record<string, (e: unknown) => void> = {};
  return {
    el: {
      width: 0,
      height: 0,
      style: {} as Record<string, string>,
      getContext: () => ctx,
      addEventListener: (t: string, f: (e: unknown) => void) => (on[t] = f),
      setPointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1194, height: 834 }),
    },
    on,
    ctx,
  };
}
