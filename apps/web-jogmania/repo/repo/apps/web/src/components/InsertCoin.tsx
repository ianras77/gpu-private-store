import NeonButton from "./NeonButton";

type InsertCoinProps = {
  started: boolean;
  onStart: () => void;
};

export default function InsertCoin({ started, onStart }: InsertCoinProps) {
  if (started) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
      <div className="text-center space-y-4">
        <div className="text-neon-yellow font-pixel text-2xl animate-pulse insert-coin">
          INSERT COIN
        </div>
        <NeonButton label="Start Run" onClick={onStart} />
        <div className="text-xs text-white/70 font-display">
          Drop in a coin to start a course run and chase points.
        </div>
      </div>
    </div>
  );
}
