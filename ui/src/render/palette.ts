// Prey colours: what a dichromat cat sees brightest on black. Never red, orange, pink or purple: to a cat those are
// dark grey.
import type { Color } from '../game/look';

export const PREY_COLOR: Record<Color, string> = {
  cyan: '#00E5FF',
  yellow: '#FFE600',
  lime: '#B6FF00',
  blue: '#3D8BFF',
};

/** Text and controls for the human: dim, so the cat has nothing to chase there. */
export const UI_TEXT = '#8a8f98';
export const UI_DIM = '#3a3e45';
export const UI_BRIGHT = '#d8dce2';
