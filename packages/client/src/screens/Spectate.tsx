import type { SpectatorView } from '@sichuan-mahjong/engine';
import { motion } from 'framer-motion';
import { MeldDisplay } from '../components/MeldDisplay.js';
import { Tile, TileBack } from '../components/Tile.js';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';

function SeatRow({ view, seat }: { view: SpectatorView; seat: number }) {
  const t = useT();
  const p = view.players[seat]!;
  const isTurn = view.turn === seat;
  const isDealer = view.dealer === seat;
  const lastFromHere = view.lastDiscard?.from === seat ? view.lastDiscard.tile : null;

  return (
    <div
      className={[
        'rounded-xl p-2 flex flex-col gap-1',
        isTurn ? 'bg-amber-500/15 ring-1 ring-amber-400/50' : 'bg-black/15',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-green-300 w-10">{t(`wind.${seat}`)}</span>
        <span
          className={[
            'text-xs font-semibold px-2 py-0.5 rounded-full',
            isTurn ? 'bg-amber-400 text-black' : 'bg-black/25 text-green-200',
          ].join(' ')}
        >
          {p.name}
        </span>
        {isDealer && (
          <span className="text-[10px] bg-red-700 text-white px-1.5 py-0.5 rounded">庄</span>
        )}
        {p.status === 'hu' && (
          <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded">
            {t('end.hu')} 🏆
          </span>
        )}
        <span
          className={`ml-auto text-sm font-bold ${p.scoreDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}
        >
          {p.scoreDelta > 0 ? '+' : ''}
          {p.scoreDelta}
        </span>
      </div>

      <div className="flex gap-0.5 flex-wrap items-end">
        {Array.from({ length: p.handCount }, (_, i) => (
          <TileBack key={i} size="sm" />
        ))}
        {p.melds.map((m, i) => (
          <MeldDisplay key={`m${i}`} meld={m} />
        ))}
      </div>

      {p.discards.length > 0 && (
        <div className="flex flex-wrap gap-0.5 discard-tray">
          {p.discards.map(id => (
            <Tile key={id} id={id} size="sm" lastDiscard={id === lastFromHere} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Spectate() {
  const t = useT();
  const view = useStore(s => s.spectatorView);
  const code = useStore(s => s.code);
  const resetSession = useStore(s => s.resetSession);

  if (!view) {
    return (
      <div className="min-h-screen board-felt flex items-center justify-center text-white">
        <p className="animate-pulse">{t('spec.connectingGame')}</p>
      </div>
    );
  }

  const turnName = view.players[view.turn]?.name ?? '—';

  return (
    <div className="min-h-screen board-felt flex flex-col text-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/30 text-xs">
        <span>{t('play.wall', { n: view.wallRemaining })}</span>
        <span className="text-amber-300 font-semibold">
          {view.phase === 'roundEnd'
            ? t('spec.roundOver')
            : t('play.othersTurn', { name: turnName })}
        </span>
        <button
          type="button"
          className="text-white/60 hover:text-white"
          onClick={() => resetSession()}
        >
          {t('nav.leave')}
        </button>
      </div>

      <div className="px-2 py-1 text-center text-[10px] text-green-300 uppercase tracking-wide">
        👀 {t('spec.spectating', { code })}
      </div>

      {view.lastDiscard && (
        <div className="flex flex-col items-center gap-1 py-2">
          <span className="text-[10px] text-green-300">{t('play.lastDiscard')}</span>
          <motion.div
            key={view.lastDiscard.tile}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <Tile id={view.lastDiscard.tile} lastDiscard size="md" />
          </motion.div>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-2 px-2 pb-3">
        {[0, 1, 2, 3].map(seat => (
          <SeatRow key={seat} view={view} seat={seat} />
        ))}
      </div>
    </div>
  );
}
