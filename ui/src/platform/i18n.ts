// The human's texts in the browser's language. Cats read none of it: the hunt itself draws no text.
import type { Tier } from '../game/prey';

const de = {
  tagline: 'Ein Jagdspiel für Katzen',
  tapToStart: 'Tippen zum Starten',
  sound: (on: boolean) => `Ton: ${on ? 'an' : 'aus'}`,
  length: (min: number) => `Dauer: ${min} Min.`,
  stats: 'Statistik',
  pauseHint: 'Pause: oben links und unten rechts gleichzeitig halten',
  // Apple's own menu wording, so the human finds the entry.
  installHint: 'Vollbild: Teilen → Zum Home-Bildschirm',
  pause: 'Pause',
  resume: 'Weiter',
  quit: 'Beenden',
  done: 'Fertig. Zeit für ein Leckerli.',
  restartHint: 'Halten für eine neue Runde',
  menuHint: 'Einstellungen (halten)',
  totals: (sessions: number, touched: number, longest: string) =>
    `Sessions: ${sessions}   Mit Berührungen: ${touched}   Längste: ${longest}`,
  noTouches: 'Noch keine Berührungen gezählt.',
  shape: 'Form',
  colour: 'Farbe',
  perMin: (rate: string) => `${rate}/Min.`,
  weightedFrom: (n: number) => `Gewichtet wird ab ${n} Sessions mit Berührungen.`,
  weighted: 'Beliebtes kommt häufiger, 30 % bleiben Zufall.',
  back: 'Zurück',
  resetHold: 'Zurücksetzen (halten)',
  names: {
    dot: 'Punkt',
    mouse: 'Maus',
    beetle: 'Käfer',
    cyan: 'Cyan',
    yellow: 'Gelb',
    lime: 'Limette',
    blue: 'Blau',
  },
  tiers: {
    still: 'Stopp',
    creep: 'Schleichen',
    trot: 'Trab',
    sprint: 'Sprint',
    blitz: 'Blitz',
  } as Record<Tier, string>,
  traceLegend: (seed: number, s: number) => `Seed ${seed}, ${s} s   · Stopp  ✕ Abgang  ○ Treffer`,
};

export type Texts = typeof de;

const en: Texts = {
  tagline: 'A hunting game for cats',
  tapToStart: 'Tap to start',
  sound: (on) => `Sound: ${on ? 'on' : 'off'}`,
  length: (min) => `Length: ${min} min`,
  stats: 'Stats',
  pauseHint: 'Pause: hold top left and bottom right at the same time',
  installHint: 'Full screen: Share → Add to Home Screen',
  pause: 'Pause',
  resume: 'Resume',
  quit: 'Quit',
  done: 'Done. Time for a treat.',
  restartHint: 'Hold for a new round',
  menuHint: 'Settings (hold)',
  totals: (sessions, touched, longest) => `Sessions: ${sessions}   With touches: ${touched}   Longest: ${longest}`,
  noTouches: 'No touches counted yet.',
  shape: 'Shape',
  colour: 'Colour',
  perMin: (rate) => `${rate}/min`,
  weightedFrom: (n) => `Weighting starts after ${n} sessions with touches.`,
  weighted: 'Favourites come more often, 30% stay random.',
  back: 'Back',
  resetHold: 'Reset (hold)',
  names: {
    dot: 'Dot',
    mouse: 'Mouse',
    beetle: 'Beetle',
    cyan: 'Cyan',
    yellow: 'Yellow',
    lime: 'Lime',
    blue: 'Blue',
  },
  tiers: { still: 'Still', creep: 'Creep', trot: 'Trot', sprint: 'Sprint', blitz: 'Bolt' },
  traceLegend: (seed, s) => `Seed ${seed}, ${s} s   · still  ✕ exit  ○ hit`,
};

const TEXTS = { de, en } as const;
export type Lang = keyof typeof TEXTS;
const LANGS = Object.keys(TEXTS) as Lang[];

/** The first of the browser's languages we have, by primary subtag (de-CH → de); English for everything else. */
export function pick(langs: readonly string[]): Lang {
  for (const l of langs) {
    const hit = LANGS.find((k) => k === l.toLowerCase().split('-')[0]);
    if (hit) return hit;
  }
  return 'en';
}

let lang: Lang = 'en';

export const setLang = (l: Lang) => void (lang = l);
export const getLang = () => lang;
/** The texts for the current language. */
export const t = () => TEXTS[lang];
