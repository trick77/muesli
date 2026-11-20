import './style.css';
import { App } from './app';
import { keepFullscreen } from './platform/device';
import { getLang, pick, setLang } from './platform/i18n';
import { HuntScreen } from './screens/hunt';
import { StartScreen } from './screens/start';
import { TraceScreen } from './screens/trace';

// The browser's language for the human's texts: German or English, English for everything else.
setLang(pick(navigator.languages));
document.documentElement.lang = getLang();
const q = new URLSearchParams(location.search);
const seed = q.has('seed') ? Number(q.get('seed')) >>> 0 : undefined;
const app = new App(document.getElementById('screen') as HTMLCanvasElement);
// ?trace: a whole session's path at a glance. ?demo: a pretend cat plays (screenshots). ?seed=N: a fixed session.
if (q.has('trace')) app.replace(new TraceScreen(app, seed ?? 1, Number(q.get('trace')) || 120));
else if (q.has('demo')) app.replace(new HuntScreen(app, { seed, demo: true }));
else app.replace(new StartScreen(app, { seed }));
// Fullscreen lost on an iPad (a swipe down, a paw): the next touch's release brings it back.
addEventListener('pointerup', (e) => keepFullscreen(e.pointerType), { passive: true });
// Hook for the end-to-end tests.
(window as unknown as { __app: App }).__app = app;
if ('serviceWorker' in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
