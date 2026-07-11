import { describe, expect, it } from 'vitest';
import { type Lang, catalog } from './index.js';

// Guards against silent translation drift: a key present in English but missing
// from a Chinese catalog would fall back to English at runtime with no error. (A18)
describe('i18n catalog completeness', () => {
  const keysOf = (lang: Lang) => new Set(Object.keys(catalog[lang]));
  const en = keysOf('en');

  for (const lang of ['zh-Hans', 'zh-Hant'] as const) {
    it(`${lang} defines exactly the same keys as English`, () => {
      const other = keysOf(lang);
      const missing = [...en].filter(k => !other.has(k)).sort();
      const extra = [...other].filter(k => !en.has(k)).sort();
      expect(missing, `${lang} is missing keys`).toEqual([]);
      expect(extra, `${lang} has keys English lacks`).toEqual([]);
    });
  }
});
