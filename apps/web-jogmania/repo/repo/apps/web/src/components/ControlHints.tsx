export default function ControlHints() {
  return (
    <div className="rounded-2xl bg-black/40 p-4 text-xs text-white/70">
      <div className="font-pixel text-neon-blue text-xs mb-2">Controls</div>
      <div className="space-y-1">
        <div><span className="text-white">Up</span> — pace up</div>
        <div><span className="text-white">Down</span> — pace down</div>
        <div><span className="text-white">Space</span> — jump</div>
        <div><span className="text-white">C</span> — cash out and bank points</div>
      </div>
    </div>
  );
}
