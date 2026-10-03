"use client";

import { useEffect, useState } from "react";

const keyFor = (slug: string, version: number, sectionId: string) =>
  `rassy-learning:v1:${slug}:v${version}:${sectionId}`;

export function LearningProgress({
  slug,
  version,
  sectionId,
}: {
  slug: string;
  version: number;
  sectionId: string;
}) {
  const [complete, setComplete] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    try {
      setComplete(
        window.localStorage.getItem(keyFor(slug, version, sectionId)) ===
          "complete",
      );
    } catch {
      setStorageAvailable(false);
    }
  }, [slug, version, sectionId]);

  const toggle = () => {
    const next = !complete;
    setComplete(next);
    try {
      const key = keyFor(slug, version, sectionId);
      if (next) window.localStorage.setItem(key, "complete");
      else window.localStorage.removeItem(key);
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  };

  return (
    <div className="learning-completion">
      <button type="button" aria-pressed={complete} onClick={toggle}>
        {complete ? "Section complete ✓" : "Mark this section complete"}
      </button>
      <span>
        {storageAvailable
          ? "Progress saved on this device."
          : "Progress is only available for this visit because device storage is blocked."}
      </span>
    </div>
  );
}
