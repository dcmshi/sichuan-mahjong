import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store/index.js';

let root: { lang: string };

beforeEach(() => {
  root = { lang: 'en' };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement: root },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document');
  useStore.getState().setLang('en');
});

describe('document language (F19)', () => {
  it('follows the UI language instead of staying pinned to en', () => {
    useStore.getState().setLang('zh-Hans');
    expect(root.lang).toBe('zh-Hans');
    expect(useStore.getState().lang).toBe('zh-Hans');

    useStore.getState().setLang('zh-Hant');
    expect(root.lang).toBe('zh-Hant');
  });
});
