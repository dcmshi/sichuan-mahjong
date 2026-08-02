import { LANGS } from '../i18n/index.js';
import { useStore } from '../store/index.js';

/** Compact EN / 简 / 繁 language toggle. */
export function LangSwitch({ className = '' }: { className?: string }) {
  const lang = useStore(s => s.lang);
  const setLang = useStore(s => s.setLang);
  return (
    <div className={`inline-flex rounded-lg overflow-hidden border border-white/20 ${className}`}>
      {LANGS.map(({ code, label }) => (
        <button
          type="button"
          key={code}
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={[
            // 40px minimum: px-2 py-0.5 gave a ~24px-tall tap target. (F15)
            'px-2 min-h-10 min-w-10 flex items-center justify-center text-xs font-semibold transition-colors',
            lang === code
              ? 'bg-amber-400 text-black'
              : 'bg-black/20 text-white/70 hover:text-white',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
