import { afterEach, describe, expect, it } from 'vitest';
import { getLang, pick, setLang, t } from '../../src/platform/i18n';

afterEach(() => setLang('en'));

describe('i18n', () => {
  it('takes the first browser language it has, by primary subtag', () => {
    expect(pick(['de-CH', 'en-US'])).toBe('de');
    expect(pick(['DE'])).toBe('de');
    expect(pick(['en-GB', 'de'])).toBe('en');
    // a Swiss French browser that also lists German gets German, not the fallback
    expect(pick(['fr-CH', 'fr', 'de-CH'])).toBe('de');
  });

  it('falls back to English', () => {
    expect(pick(['fr-FR', 'it'])).toBe('en');
    expect(pick([])).toBe('en');
    expect(pick(['constructor', 'toString'])).toBe('en');
  });

  it('switches the texts', () => {
    expect(getLang()).toBe('en');
    expect(t().sound(false)).toBe('Sound: off');
    setLang('de');
    expect(getLang()).toBe('de');
    expect(t().sound(false)).toBe('Ton: aus');
    expect(t().length(5)).toBe('Dauer: 5 Min.');
  });
});
