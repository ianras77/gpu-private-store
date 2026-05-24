"use client";

import HeartButton from "./HeartButton";

export default function HeartPanel({
  id,
  initialHearts,
  storytellerName,
  anonymous = false,
}: {
  id: string;
  initialHearts: number;
  storytellerName: string;
  anonymous?: boolean;
}) {
  return (
    <div className="press-hero p-5">
      <div className="space-y-4">
        <div>
          <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-press-paper/52">
            Heart the sheet
          </p>
          <p className="mt-3 text-sm leading-7 text-press-paper/72">
            {anonymous
              ? "Hearts lift the story while the author stays masked."
              : `Hearts lift the story and build cred for ${storytellerName}.`}
          </p>
        </div>
        <HeartButton id={id} initialCount={initialHearts} />
      </div>
    </div>
  );
}
