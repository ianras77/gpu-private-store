import clsx from "clsx";

type SpeedGraphProps = {
  speeds: number[];
  className?: string;
};

function downsample(values: number[], target = 60) {
  if (values.length <= target) return values;
  const step = Math.ceil(values.length / target);
  const sampled: number[] = [];
  for (let i = 0; i < values.length; i += step) {
    sampled.push(values[i]);
  }
  return sampled;
}

export function SpeedGraph({ speeds, className }: SpeedGraphProps) {
  if (!speeds.length) {
    return (
      <div className={clsx("h-28 rounded-2xl border border-white/10 bg-jm-surface/60", className)}>
        <div className="h-full w-full flex items-center justify-center text-xs text-jm-muted">
          No speed data yet.
        </div>
      </div>
    );
  }

  const sampled = downsample(speeds);
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min || 1;
  const points = sampled
    .map((value, idx) => {
      const x = (idx / Math.max(1, sampled.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className={clsx("h-28 rounded-2xl border border-white/10 bg-jm-surface/60 p-3", className)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="speedGlow" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#3df5ff" />
            <stop offset="50%" stopColor="#ff3fa5" />
            <stop offset="100%" stopColor="#b6ff3d" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="url(#speedGlow)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      </svg>
    </div>
  );
}
