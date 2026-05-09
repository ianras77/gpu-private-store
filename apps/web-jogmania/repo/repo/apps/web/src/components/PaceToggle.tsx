type PaceToggleProps = {
  enabled: boolean;
  onToggle: () => void;
};

export default function PaceToggle({ enabled, onToggle }: PaceToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full border px-4 py-2 text-xs uppercase tracking-wide transition ${
        enabled
          ? "border-neon-green text-neon-green shadow-[0_0_14px_rgba(98,255,125,0.7)]"
          : "border-white/20 text-white/60"
      }`}
    >
      Simulate GPS Pace: {enabled ? "ON" : "OFF"}
    </button>
  );
}
