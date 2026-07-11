import type { GameAction, Seat } from '@sichuan-mahjong/engine';
import { useEffect, useState } from 'react';
import { useT } from '../i18n/useT.js';
import { sendAction } from '../ws/client.js';

type Props = {
  seat: Seat;
  legalActions: GameAction[];
  claimDeadline: number;
};

export function ClaimPanel({ seat, legalActions, claimDeadline }: Props) {
  const [pct, setPct] = useState(100);
  const t = useT();

  useEffect(() => {
    const total = claimDeadline - Date.now();
    if (total <= 0) return;

    const id = setInterval(() => {
      const remaining = claimDeadline - Date.now();
      setPct(Math.max(0, (remaining / total) * 100));
      if (remaining <= 0) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [claimDeadline]);

  const canHu = legalActions.some(a => a.t === 'claim' && a.claim.kind === 'hu');
  const canKong = legalActions.some(a => a.t === 'claim' && a.claim.kind === 'kong');
  const canPung = legalActions.some(a => a.t === 'claim' && a.claim.kind === 'pung');
  const canPass = legalActions.some(a => a.t === 'pass');

  function act(action: GameAction) {
    sendAction({ t: 'action', action });
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur text-white p-3 border-t border-gray-700 z-20">
      {/* Countdown bar */}
      <div className="w-full h-1.5 bg-gray-700 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 justify-center">
        {canHu && (
          <button
            type="button"
            className="flex-1 py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-xl font-bold text-lg"
            onClick={() => act({ t: 'claim', seat, claim: { kind: 'hu' } })}
          >
            {t('claim.hu')}
          </button>
        )}
        {canKong && (
          <button
            type="button"
            className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 rounded-xl font-bold text-lg"
            onClick={() => act({ t: 'claim', seat, claim: { kind: 'kong' } })}
          >
            {t('claim.kong')}
          </button>
        )}
        {canPung && (
          <button
            type="button"
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-xl font-bold text-lg"
            onClick={() => act({ t: 'claim', seat, claim: { kind: 'pung' } })}
          >
            {t('claim.pung')}
          </button>
        )}
        {canPass && (
          <button
            type="button"
            className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 active:bg-gray-700 rounded-xl font-bold text-lg"
            onClick={() => act({ t: 'pass', seat })}
          >
            {t('claim.pass')}
          </button>
        )}
      </div>
    </div>
  );
}
