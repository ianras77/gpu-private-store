import NeonButton from './NeonButton';

type InsertCoinProps = {
  started: boolean;
  onStart: () => void;
};

export default function InsertCoin({ started, onStart }: InsertCoinProps) {
  if (started) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
      <div className="space-y-4 text-center">
        <div className="insert-coin animate-pulse font-pixel text-2xl text-neon-yellow">
          INSERT COIN
        </div>
        <NeonButton label="Start Run" onClick={onStart} />
        <div className="font-display text-xs text-white/70">
          Drop in a coin to start a course run and chase points.
        </div>
      </div>
    </div>
  );
}
