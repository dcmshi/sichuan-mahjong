import { useStore } from '../store/index.js';
import { useT } from '../i18n/useT.js';

const SECTIONS = ['app', 'tiles', 'rules', 'license'] as const;

export function About() {
  const goTo = useStore(s => s.goTo);
  const t = useT();
  return (
    <div className="min-h-screen bg-green-900 flex flex-col p-6 text-white gap-6">
      <div className="flex items-center gap-3 mt-2">
        <button className="text-green-300 hover:text-white" onClick={() => goTo('landing')}>{t('nav.back')}</button>
        <h2 className="text-xl font-bold">{t('about.title')}</h2>
      </div>

      {SECTIONS.map(k => (
        <section key={k}>
          <h3 className="text-amber-400 font-semibold mb-2">{t(`about.${k}.title`)}</h3>
          <p className={`text-green-200 text-sm leading-relaxed ${k === 'license' ? 'font-mono' : ''}`}>
            {t(`about.${k}.body`)}
          </p>
        </section>
      ))}
    </div>
  );
}
