import { useStore } from '../store/index.js';
import { sendAction } from '../ws/client.js';

const SEAT_WINDS = ['East', 'South', 'West', 'North'];

export function RoundEnd() {
  const store = useStore();
  const result = store.roundResult;

  if (!result) return null;

  const sorted = [...result.players].sort((a, b) => b.scoreDelta - a.scoreDelta);

  return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center p-6 text-white gap-6">
      <div className="text-4xl mt-4">🏆</div>
      <h2 className="text-2xl font-bold">Round End</h2>

      <div className="w-full max-w-sm flex flex-col gap-2">
        {sorted.map((p, rank) => (
          <div
            key={p.seat}
            className={[
              'flex items-center gap-3 rounded-xl px-4 py-3',
              rank === 0 ? 'bg-amber-600/60 border border-amber-400' : 'bg-black/20',
            ].join(' ')}
          >
            <span className="text-white/40 text-sm w-6">#{rank + 1}</span>
            <span className="text-xs text-green-300 w-12">{SEAT_WINDS[p.seat]}</span>
            <span className="font-semibold flex-1">
              {p.name}
              {p.seat === store.seat && <span className="ml-1 text-xs text-amber-400">(you)</span>}
            </span>
            {p.hu && (
              <span className="text-xs bg-red-700 px-1.5 py-0.5 rounded">Hu!</span>
            )}
            <span className={`font-bold text-lg ${p.scoreDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {p.scoreDelta > 0 ? '+' : ''}{p.scoreDelta}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm mt-auto">
        <button
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg"
          onClick={() => store.resetSession()}
        >
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
