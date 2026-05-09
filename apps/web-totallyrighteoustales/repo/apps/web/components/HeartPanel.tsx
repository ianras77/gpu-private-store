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
    <div className="ink-panel rounded-[2rem] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-parchment/55">
            Story love
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-parchment/72">
            {anonymous
              ? "Hearts lift the story and still build hidden storyteller cred behind the curtain."
              : `Hearts lift the story and build storyteller cred for ${storytellerName}.`}
          </p>
        </div>
        <HeartButton id={id} initialCount={initialHearts} />
      </div>
    </div>
  );
}
