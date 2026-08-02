import type { SpectatorView } from '@sichuan-mahjong/engine';
import { motion } from 'framer-motion';
import { LangSwitch } from '../components/LangSwitch.js';
import { MeldDisplay } from '../components/MeldDisplay.js';
import { ReconnectingBanner } from '../components/ReconnectingBanner.js';
import { RoundEndRow } from '../components/RoundEndRow.js';
import { Tile, TileBack } from '../components/Tile.js';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';

function SeatRow({ view, seat }: { view: SpectatorView; seat: number }) {
  const t = useT();
  const p = view.players[seat]!;
  const isTurn = view.turn === seat;
  const isDealer = view.dealer === seat;
  const lastFromHere = view.lastDiscard?.from === seat ? view.lastDiscard.tile : null;
  // The void declaration is drawn on its own above the pile, so the pile is
  // everything after it.
  const pileDiscards = p.firstDiscardIsVoid ? p.discards.slice(1) : p.discards;
  const voidDiscardTile = p.firstDiscardIsVoid ? (p.discards[0] ?? null) : null;

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
          <span className="text-[10px] bg-red-700 text-white px-1.5 py-0.5 rounded">
            {t('spec.dealer')}
          </span>
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

      {/* Flush, and grouped: a concealed hand is one run and each meld another,
          which is what separates them now that no tile carries its own bevel. */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-wrap tile-lap pl-2">
          {Array.from({ length: p.handCount }, (_, i) => (
            <TileBack key={i} size="sm" />
          ))}
        </div>
        {p.melds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.melds.map((m, i) => (
              <MeldDisplay key={`m${i}`} meld={m} />
            ))}
          </div>
        )}
      </div>

      {/* The void declaration, held out of the pile and set above it: it is the
              one public statement of what this seat declared, and reading it off
              the front of a wrapping pile meant hunting for it. Face down until
              its owner flips it on their first turn (A37). */}
      {(p.pendingFirstDiscard || voidDiscardTile !== null) && (
        <div className="flex">
          {voidDiscardTile === null ? (
            <TileBack size="sm" />
          ) : (
            <Tile
              id={voidDiscardTile}
              size="sm"
              voidDiscard
              lastDiscard={voidDiscardTile === lastFromHere}
            />
          )}
        </div>
      )}
      {pileDiscards.length > 0 && (
        <div className="flex flex-wrap discard-tray tile-lap">
          {pileDiscards.map(id => (
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
  const roundResult = useStore(s => s.roundResult);
  const matchScores = useStore(s => s.matchScores);
  const countedRounds = useStore(s => s.countedRounds);
  const resetSession = useStore(s => s.resetSession);

  if (!view) {
    return (
      <div className="min-h-dvh board-felt flex items-center justify-center text-white">
        <p className="animate-pulse">{t('spec.connectingGame')}</p>
      </div>
    );
  }

  const turnName = view.players[view.turn]?.name ?? '—';

  return (
    <div className="min-h-dvh board-felt flex flex-col text-white">
      <ReconnectingBanner />
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/30 text-xs">
        <span>{t('play.wall', { n: view.wallRemaining })}</span>
        <span className="text-amber-300 font-semibold">
          {view.phase === 'roundEnd'
            ? t('spec.roundOver')
            : t('play.othersTurn', { name: turnName })}
        </span>
        <div className="flex items-center gap-2">
          <LangSwitch />
          <button
            type="button"
            className="text-white/60 hover:text-white"
            onClick={() => resetSession()}
          >
            {t('nav.leave')}
          </button>
        </div>
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

      {view.phase === 'roundEnd' && roundResult && (
        <div className="flex flex-col gap-2 px-2 pb-2">
          {[...roundResult.players]
            .sort((a, b) => b.scoreDelta - a.scoreDelta)
            .map((p, rank) => (
              <RoundEndRow
                key={p.seat}
                player={p}
                rank={rank}
                youSeat={null}
                defaultOpen={p.hu !== null}
              />
            ))}
          {/* The store has been accumulating these for spectators all along;
              the screen simply never showed them. */}
          {countedRounds.length > 1 && (
            <div className="flex flex-col gap-1 mt-1">
              <p className="text-green-300 text-[10px] font-semibold uppercase tracking-wide">
                {t('end.matchTotal')}
              </p>
              {[...roundResult.players]
                .sort((a, b) => (matchScores[b.seat] ?? 0) - (matchScores[a.seat] ?? 0))
                .map(p => (
                  <div
                    key={p.seat}
                    className="flex items-center gap-2 bg-black/15 rounded-lg px-3 py-1.5 text-xs"
                  >
                    <span className="text-green-300 w-10">{t(`wind.${p.seat}`)}</span>
                    <span className="flex-1 truncate">{p.name}</span>
                    <span
                      className={[
                        'font-mono font-bold',
                        (matchScores[p.seat] ?? 0) > 0
                          ? 'text-emerald-300'
                          : (matchScores[p.seat] ?? 0) < 0
                            ? 'text-red-300'
                            : 'text-white/60',
                      ].join(' ')}
                    >
                      {(matchScores[p.seat] ?? 0) > 0 ? '+' : ''}
                      {matchScores[p.seat] ?? 0}
                    </span>
                  </div>
                ))}
            </div>
          )}
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
