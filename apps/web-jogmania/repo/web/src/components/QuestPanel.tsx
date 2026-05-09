import type { Quest } from '@/lib/api';

export default function QuestPanel({
  quest,
  courseName
}: {
  quest?: Quest | null;
  courseName?: string;
}) {
  return (
    <div className="pixel-border rounded-2xl bg-[#0c0c1b]/80 p-4 text-sm">
      <div className="mb-2 font-pixel text-xs text-neon-yellow">
        Course Challenge{courseName ? ` - ${courseName}` : ''}
      </div>
      <div className="text-lg text-white">{quest?.title ?? 'Loading quest...'}</div>
      <div className="mt-2 text-white/70">{quest?.goal ?? 'Syncing course targets.'}</div>
      <div className="mt-3 text-xs text-neon-green">Reward: {quest?.reward ?? '???'}</div>
      <div className="mt-1 text-[10px] text-white/40">Seed: {quest?.seed ?? '--'}</div>
    </div>
  );
}
