import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';

const SECTIONS = ['app', 'tiles', 'rules', 'license'] as const;

/**
 * The one dedicated page among the menu's overlays. It is a page because it
 * carries the attribution the tiles' CC-BY-SA licence asks for — worth a URL,
 * not a sheet — but it dresses like the How to Play overlay it sits beside on
 * the landing screen: same header (display title left, close right), same
 * lacquer panels, same brass section headings.
 */
export function About() {
  const goTo = useStore(s => s.goTo);
  const t = useT();
  return (
    <div className="min-h-dvh bg-green-900 flex flex-col p-6 text-white">
      <div className="w-full max-w-lg mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between mt-2">
          <h2 className="heading-display text-2xl">{t('about.title')}</h2>
          <button
            type="button"
            className="text-white/60 hover:text-amber-300 text-xl px-2 min-h-10"
            onClick={() => goTo('landing')}
            aria-label={t('nav.back')}
          >
            ✕
          </button>
        </div>

        {SECTIONS.map(k => (
          <section key={k} className="panel-lacquer p-4">
            <h3 className="font-display text-amber-300 text-lg mb-2">{t(`about.${k}.title`)}</h3>
            <p
              className={`text-green-100 text-sm leading-relaxed ${k === 'license' ? 'font-mono' : ''}`}
            >
              {t(`about.${k}.body`)}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
