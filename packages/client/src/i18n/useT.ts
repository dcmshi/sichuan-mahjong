import { useStore } from '../store/index.js';
import { translate } from './index.js';

/** Returns a translate function bound to the current language. */
export function useT() {
  const lang = useStore(s => s.lang);
  return (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
