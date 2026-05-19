import { motion, AnimatePresence } from 'framer-motion';

const SECTIONS = [
  {
    title: 'Overview',
    body: `Sichuan Mahjong (Bloody Rules / 血战到底) is a 4-player tile game played with 108 tiles: 1–9 in three suits (Man 万, Pin 饼, Sou 条). No winds or dragons.

Each round continues until 3 players have won or the wall is exhausted — winning players sit out but the game goes on.`,
  },
  {
    title: 'Setup',
    body: `• Huan San Zhang: each player secretly passes 3 tiles of one suit to the next player.
• Void Declaration (定缺): each player declares one suit to permanently void. You must discard all tiles of that suit.`,
  },
  {
    title: 'Your Turn',
    body: `• Draw a tile from the wall.
• Optionally declare a Kong (4-of-a-kind) to draw a replacement tile.
• Declare Hu if your hand is complete, otherwise discard a tile.

Turn order: counter-clockwise (East → South → West → North).`,
  },
  {
    title: 'Claims',
    body: `When another player discards, you may claim:
• Pung (碰): 3-of-a-kind using the discard.
• Kong (杠): 4-of-a-kind using the discard.
• Hu (胡): complete your winning hand.

Priority: Hu > Kong > Pung. No chow claims in Sichuan.`,
  },
  {
    title: 'Winning Hand',
    body: `A winning hand is either:
• 4 sets (pung/kong/chow) + 1 pair — all in non-voided suits.
• 7 distinct pairs — all in non-voided suits.

Chows (3 consecutive) can only be built in your concealed hand, not claimed off discards.`,
  },
  {
    title: 'Scoring (Fan)',
    body: `Hand value = 2^fan, capped at 2^3 = 8 points.

Notable fans:
• Full Flush (清一色): all one suit — 2 fan
• Seven Pairs (七对): 2 fan
• All Pungs: 1 fan
• Each Kong: 1 fan
• Under the Sea / Win after Kong: 1 fan

Self-draw Hu: each other player pays hand value + 1.
Discard Hu: discarder pays hand value.`,
  },
  {
    title: 'Kongs',
    body: `Concealed Kong: 4-of-a-kind in hand. Each non-Hu player pays 2.
Exposed Kong (off discard): discarder pays 2.
Promoted Kong: add drawn tile to existing pung. Each pays 1.

After any kong, draw a replacement tile from the other end of the wall.`,
  },
  {
    title: 'Furiten',
    body: `If you skip a discard you could have won on, you enter Furiten — you cannot win off discards until your next self-draw. You can still win by self-draw or on a higher-value hand.`,
  },
];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-green-950 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-green-950 flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2 className="text-white font-bold text-lg">How to Play</h2>
            <button className="text-white/60 hover:text-white text-xl px-2" onClick={onClose}>✕</button>
          </div>

          <div className="px-4 py-4 flex flex-col gap-5">
            {SECTIONS.map(s => (
              <div key={s.title}>
                <h3 className="text-amber-400 font-semibold mb-1">{s.title}</h3>
                <p className="text-green-100 text-sm leading-relaxed whitespace-pre-line">{s.body}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
