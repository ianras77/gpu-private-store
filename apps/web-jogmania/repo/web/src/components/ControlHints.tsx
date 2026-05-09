export default function ControlHints() {
  return (
    <div className="rounded-2xl bg-black/40 p-4 text-xs text-white/70">
      <div className="mb-2 font-pixel text-xs text-neon-blue">Controls</div>
      <div className="space-y-1">
        <div>
          <span className="text-white">Up</span> — pace up
        </div>
        <div>
          <span className="text-white">Down</span> — pace down
        </div>
        <div>
          <span className="text-white">Space</span> — jump
        </div>
        <div>
          <span className="text-white">C</span> — cash out and bank points
        </div>
      </div>
    </div>
  );
}
