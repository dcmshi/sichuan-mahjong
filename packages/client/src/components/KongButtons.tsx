import type { PlayerView } from '@sichuan-mahjong/engine';
import { useSound } from '../hooks/useSound.js';
import { useT } from '../i18n/useT.js';
import { kongOffers } from '../kongOffers.js';
import { sendAction } from '../ws/client.js';
import { Tile, tileLabel } from './Tile.js';

/**
 * On-turn kong declarations. Each carries the tile it consumes, drawn and named,
 * and one line saying what will happen — the three subtypes differ in what
 * leaves, what arrives, and what they pay, and they used to draw one purple
 * button reading `Kong M3 (promoted)`. Same shape as the first-discard flip block
 * below it in `OwnZone`: a tile, and a sentence about that tile. (N28)
 */
export function KongButtons({ view }: { view: PlayerView }) {
  const offers = kongOffers(view);
  const play = useSound();
  const t = useT();
  if (offers.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {offers.map(o => (
        <button
          type="button"
          key={`${o.type}-${o.action.subtype}`}
          className="w-full flex items-center gap-2 px-2 py-1.5 bg-purple-700 hover:bg-purple-600 rounded-xl text-left text-white"
          onClick={() => {
            play('kong');
            sendAction({ t: 'action', action: o.action });
          }}
        >
          <Tile id={o.tileId} size="sm" interactive={false} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold">
              {t('play.kong', {
                subtype: t(`kong.${o.action.subtype}`),
                label: tileLabel(o.tileId, t),
              })}
            </span>
            <span className="block text-[11px] font-normal opacity-80 leading-snug">
              {t(o.hintKey)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
