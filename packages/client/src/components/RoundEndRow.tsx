import type { RoundResult, Seat } from '@sichuan-mahjong/engine';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useT } from '../i18n/useT.js';
import { formatFan, ledgerLines } from '../roundEnd.js';
import { MeldDisplay } from './MeldDisplay.js';
import { Tile } from './Tile.js';

type Player = RoundResult['players'][number];

/**
 * One seat's round-end line, expandable to its revealed hand and the payments
 * that produced its score. Winners open by default — that is the row people
 * actually want to read.
 */
export function RoundEndRow({
  player,
  rank,
  youSeat,
  defaultOpen,
}: { player: Player; rank: number; youSeat: Seat | null; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const t = useT();
  const lines = ledgerLines(player.ledger, player.seat);

  return (
    <motion.div
      initial={{ x: -20 }}
      animate={{ x: 0 }}
      transition={{ delay: rank * 0.1 }}
      className={[
        'rounded-xl',
        rank === 0 ? 'bg-amber-600/60 border border-amber-400' : 'bg-black/20',
      ].join(' ')}
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 min-h-11 text-left"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-white/40 text-sm w-6">#{rank + 1}</span>
        <span className="text-xs text-green-300 w-12">{t(`wind.${player.seat}`)}</span>
        <span className="font-semibold flex-1 min-w-0 truncate">
          {player.name}
          {player.seat === youSeat && player.name !== t('landing.practiceName') && (
            <span className="ml-1 text-xs text-amber-400">{t('common.you')}</span>
          )}
        </span>
        {player.hu && (
          <span className="text-xs bg-red-700 px-1.5 py-0.5 rounded">{t('end.hu')}</span>
        )}
        <span
          className={`font-bold text-lg ${player.scoreDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}
        >
          {player.scoreDelta > 0 ? '+' : ''}
          {player.scoreDelta}
        </span>
        <span className="text-white/40 text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          {/* Flat and flush, like the melds beside them: this is a hand laid out
              on the table at the end of a round, and 3D tiles next to a flush
              meld read as two different kinds of object in one hand. Concealed
              tiles and declared melds are separate groups, which is what keeps
              the two readable as different things now that nothing has a gap. */}
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex flex-wrap">
              {player.hand.map(id => (
                <Tile key={id} id={id} size="sm" flat />
              ))}
            </div>
            {player.melds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {player.melds.map((m, i) => (
                  <MeldDisplay key={`m${i}`} meld={m} />
                ))}
              </div>
            )}
          </div>

          {player.hu ? (
            <p className="text-xs text-amber-300">
              {player.hu.fans.map(f => formatFan(f, t)).join(' · ')}
              {player.hu.fans.length > 0 ? ' · ' : ''}
              {t('end.handValue', { n: player.hu.handValue })}
            </p>
          ) : (
            <p className="text-xs text-white/50">
              {player.isReady ? t('end.ready') : t('end.notReady')}
            </p>
          )}

          {lines.length > 0 && (
            <div className="flex flex-col gap-0.5 text-xs">
              {lines.map((l, i) => (
                <div key={i} className="flex items-baseline gap-2">
                  <span className="text-white/60 flex-1 min-w-0 truncate">
                    {t(l.key)}
                    {l.detail ? ` (${t(l.detail)})` : ''}
                    {l.other !== null ? ` · ${t(`wind.${l.other}`)}` : ''}
                  </span>
                  <span className={l.amount >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {l.amount > 0 ? '+' : ''}
                    {l.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
