import type { ReactNode } from "react";

export default function ArcadeCabinet({ children }: { children: ReactNode }) {
  return (
    <div className="arcade-frame w-full max-w-6xl mx-auto rounded-[28px] p-6 md:p-10 shadow-glow">
      <div className="rounded-[22px] border border-white/10 bg-[#0f0018]/80 p-4 md:p-6">
        {children}
      </div>
    </div>
  );
}
