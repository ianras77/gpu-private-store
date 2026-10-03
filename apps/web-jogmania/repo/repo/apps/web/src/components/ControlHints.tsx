export default function ControlHints() {
  return (
    <div className="rounded-2xl bg-black/40 p-4 text-xs text-white/70">
      <div className="font-pixel text-neon-blue text-xs mb-2">Controls</div>
      <div className="space-y-1">
        <div><span className="text-white">Up / Down</span> — play with the wind</div>
        <div><span className="text-white">Space</span> — jump</div>
        <div><span className="text-white">C</span> — save this little trip</div>
      </div>
    </div>
  );
}
