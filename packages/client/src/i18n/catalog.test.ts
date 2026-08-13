import { describe, expect, it } from 'vitest';
import { LANGS, type Lang, catalog } from './index.js';

// Guards against silent translation drift: a key present in English but missing
// from another catalog would fall back to English at runtime with no error. (A18)
//
// Driven off LANGS rather than a literal list, so a seventh language is covered
// the moment it is registered — the list was two hard-coded codes, which is the
// shape that lets a new catalog ship half-written. (N23)
describe('i18n catalog completeness', () => {
  const keysOf = (lang: Lang) => new Set(Object.keys(catalog[lang]));
  const en = keysOf('en');

  for (const lang of LANGS.map(l => l.code).filter(c => c !== 'en')) {
    it(`${lang} defines exactly the same keys as English`, () => {
      const other = keysOf(lang);
      const missing = [...en].filter(k => !other.has(k)).sort();
      const extra = [...other].filter(k => !en.has(k)).sort();
      expect(missing, `${lang} is missing keys`).toEqual([]);
      expect(extra, `${lang} has keys English lacks`).toEqual([]);
    });
  }
});

/**
 * The placeholders inside each string, which key parity cannot see. (A74)
 *
 * `translate` does a blind `replaceAll('{k}', v)` over whatever the catalog
 * holds, so the two failure modes are silent in opposite directions:
 *
 *  - a translated string that **drops** a placeholder loses the value entirely.
 *    "Join {code}" becoming "Rejoindre" renders a button that names no room.
 *  - a translated string that **adds or misspells** one renders the braces to
 *    the user, because nothing supplies that name — `{n}` on screen, verbatim.
 *
 * Neither raises anything at runtime and neither changes the key set, so the
 * completeness test above passes through both. English is the reference because
 * it is what the call sites are written against.
 */
describe('i18n placeholder parity', () => {
  const placeholders = (s: string): Set<string> =>
    new Set([...s.matchAll(/\{(\w+)\}/g)].map(m => m[1] as string));

  for (const lang of LANGS.map(l => l.code).filter(c => c !== 'en')) {
    it(`${lang} uses the same placeholders as English in every string`, () => {
      const wrong: string[] = [];
      for (const [key, enText] of Object.entries(catalog.en)) {
        const mine = catalog[lang][key];
        if (mine === undefined) continue; // the completeness test owns that
        const want = placeholders(enText);
        const got = placeholders(mine);
        const dropped = [...want].filter(p => !got.has(p));
        const invented = [...got].filter(p => !want.has(p));
        if (dropped.length > 0) wrong.push(`${key}: drops {${dropped.join('}, {')}}`);
        if (invented.length > 0) wrong.push(`${key}: invents {${invented.join('}, {')}}`);
      }
      expect(wrong, `${lang} placeholder mismatches`).toEqual([]);
    });
  }
});
