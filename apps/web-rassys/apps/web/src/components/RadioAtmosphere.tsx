"use client";

import { usePersistentRadioPlayer } from "./PersistentRadioPlayerProvider";

export function RadioAtmosphere() {
  const { playing, buffering, displayNow } = usePersistentRadioPlayer();
  const state = buffering ? "buffering" : playing ? "on-air" : "quiet";
  const key = displayNow?.id ?? displayNow?.title ?? "empty-air";

  return (
    <div className={`radio-atmosphere radio-atmosphere-${state}`} data-track-key={key} aria-hidden="true">
      <div className="radio-atmosphere-orbit" />
      <div className="radio-atmosphere-sheen" />
    </div>
  );
}
