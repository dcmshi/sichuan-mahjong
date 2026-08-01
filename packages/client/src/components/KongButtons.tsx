import type { PlayerView } from '@sichuan-mahjong/engine';
import { useSound } from '../hooks/useSound.js';
import { useT } from '../i18n/useT.js';
import { sendAction } from '../ws/client.js';

/** On-turn kong declarations (concealed / promoted / postponed). */
export function KongButtons({ view, seat }: { view: PlayerView; seat: number }) {
  const kongActions = view.yourLegalActions.filter(a => a.t === 'declareKongOnTurn');
  const play = useSound();
  const t = useT();
  if (kongActions.length === 0) return null;
  return (
    <div className="flex gap-2">
      {kongActions.map((a, i) => {
        if (a.t !== 'declareKongOnTurn') return null;
        // a.tile is a Tile ({suit, rank}) already — not a TileId. (The old
        // `tileTypeOf(a.tile as TileId)` produced undefined and crashed the app
        // whenever a kong was offered.)
        const { suit, rank } = a.tile;
        return (
          <button
            type="button"
            key={i}
            className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 rounded-lg text-sm font-bold text-white"
            onClick={() => {
              play('kong');
              sendAction({ t: 'action', action: a });
            }}
          >
            {t('play.kong', {
              label: `${suit[0]?.toUpperCase()}${rank}`,
              subtype: t(`kong.${a.subtype}`),
            })}
          </button>
        );
      })}
    </div>
  );
}
