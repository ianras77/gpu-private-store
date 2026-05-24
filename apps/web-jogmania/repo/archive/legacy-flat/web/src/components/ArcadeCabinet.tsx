import type { ReactNode } from 'react';

export default function ArcadeCabinet({ children }: { children: ReactNode }) {
  return (
    <div className="arcade-frame mx-auto w-full max-w-6xl rounded-[28px] p-6 shadow-glow md:p-10">
      <div className="rounded-[22px] border border-white/10 bg-[#0f0018]/80 p-4 md:p-6">
        {children}
      </div>
    </div>
  );
}
