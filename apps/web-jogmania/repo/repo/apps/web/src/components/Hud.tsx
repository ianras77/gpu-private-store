type HudProps = {
  pace: number;
  streak: number;
  xp: number;
  sessionPoints?: number;
};

export default function Hud({ pace, streak, xp, sessionPoints }: HudProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl bg-black/60 p-3 text-xs uppercase text-white/80">
      <div className="flex items-center gap-2">
        <span className="text-neon-blue">Pace</span>
        <span className="font-pixel text-neon-yellow">{pace.toFixed(1)}x</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-neon-green">Streak</span>
        <span className="font-pixel text-neon-green">{streak}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-neon-pink">Session XP</span>
        <span className="font-pixel text-neon-pink">{xp}</span>
      </div>
      {typeof sessionPoints === "number" ? (
        <div className="flex items-center gap-2">
          <span className="text-neon-yellow">Session Points</span>
          <span className="font-pixel text-neon-yellow">{sessionPoints}</span>
        </div>
      ) : null}
    </div>
  );
}
