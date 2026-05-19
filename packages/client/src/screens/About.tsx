import { useStore } from '../store/index.js';

export function About() {
  const goTo = useStore(s => s.goTo);
  return (
    <div className="min-h-screen bg-green-900 flex flex-col p-6 text-white gap-6">
      <div className="flex items-center gap-3 mt-2">
        <button className="text-green-300 hover:text-white" onClick={() => goTo('landing')}>← Back</button>
        <h2 className="text-xl font-bold">About</h2>
      </div>

      <section>
        <h3 className="text-amber-400 font-semibold mb-2">Sichuan Mahjong</h3>
        <p className="text-green-200 text-sm leading-relaxed">
          A local-multiplayer implementation of Sichuan Mahjong (Bloody Rules / 血战到底).
          Host on your own machine; friends join over LAN or Tailscale. Code is MIT-licensed.
        </p>
      </section>

      <section>
        <h3 className="text-amber-400 font-semibold mb-2">Tile Graphics</h3>
        <p className="text-green-200 text-sm leading-relaxed mb-2">
          Tile glyphs use Unicode characters (U+1F000–U+1F021). No external SVG assets are
          bundled in this release.
        </p>
        <p className="text-green-200 text-sm leading-relaxed">
          If SVG tile assets are added in a future release, they will be sourced from Wikimedia
          Commons under the{' '}
          <span className="text-amber-300 font-mono text-xs">CC-BY-SA 4.0</span> license. Per-file
          attribution will be listed in{' '}
          <span className="font-mono text-xs text-amber-300">public/tiles/credits.json</span>.
        </p>
      </section>

      <section>
        <h3 className="text-amber-400 font-semibold mb-2">Rules Reference</h3>
        <p className="text-green-200 text-sm leading-relaxed">
          Canonical ruleset: Vitaly Novikov, <em>Sichuan Mahjong? It's that simple!</em>
        </p>
      </section>

      <section>
        <h3 className="text-amber-400 font-semibold mb-2">License</h3>
        <p className="text-green-200 text-sm font-mono">MIT</p>
      </section>
    </div>
  );
}
