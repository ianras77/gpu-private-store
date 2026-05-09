"use client";

import { useEffect, useMemo, useState } from "react";
import {
  usePersistentRadioPlayer,
  type RadioVisualizerFrame,
} from "./PersistentRadioPlayerProvider";

const EMPTY_FRAME: RadioVisualizerFrame = {
  bars: Array.from({ length: 20 }, () => 0.1),
  energy: 0,
  active: false,
};

const buildPath = (
  bars: number[],
  options: {
    amplitude: number;
    baseline: number;
    drift: number;
    phase: number;
  },
) => {
  const points = bars.map((value, index) => {
    const x = (index / Math.max(1, bars.length - 1)) * 100;
    const wave =
      Math.sin(index * 0.8 + options.drift + options.phase) * 1.25;
    const y =
      options.baseline - value * options.amplitude * 8 + wave * (0.6 + value);
    return { x, y };
  });

  if (!points.length) return "";

  let path = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const midX = ((previous.x + current.x) / 2).toFixed(2);
    const midY = ((previous.y + current.y) / 2).toFixed(2);
    path += ` Q ${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${midX} ${midY}`;
  }
  const last = points[points.length - 1]!;
  path += ` T ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return path;
};

export function HeaderSignalVisualizer() {
  const { subscribeVisualizer } = usePersistentRadioPlayer();
  const [frame, setFrame] = useState<RadioVisualizerFrame>(EMPTY_FRAME);
  const [phase, setPhase] = useState(0);

  useEffect(() => subscribeVisualizer(setFrame), [subscribeVisualizer]);

  useEffect(() => {
    let animationFrame = 0;
    let lastTick = 0;

    const tick = (timestamp: number) => {
      animationFrame = window.requestAnimationFrame(tick);
      if (timestamp - lastTick < 42) return;
      lastTick = timestamp;
      const driftStep = frame.active
        ? 0.12 + frame.energy * 0.22
        : 0.035;
      setPhase((current) => (current + driftStep) % (Math.PI * 2));
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [frame.active, frame.energy]);

  const primaryPath = useMemo(
    () =>
      buildPath(frame.bars, {
        amplitude: 1.05 + frame.energy * 0.9,
        baseline: 12.2,
        drift: 0,
        phase,
      }),
    [frame.bars, frame.energy, phase],
  );
  const secondaryPath = useMemo(
    () =>
      buildPath([...frame.bars].reverse(), {
        amplitude: 0.74 + frame.energy * 0.55,
        baseline: 14.3,
        drift: 1.3,
        phase: phase * 1.18,
      }),
    [frame.bars, frame.energy, phase],
  );
  const haloPath = useMemo(
    () =>
      buildPath(frame.bars, {
        amplitude: 1.4 + frame.energy,
        baseline: 10.4,
        drift: 2.1,
        phase: phase * 0.82,
      }),
    [frame.bars, frame.energy, phase],
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_18%_28%,rgba(255,228,115,0.2),transparent_28%),radial-gradient(circle_at_78%_36%,rgba(66,245,255,0.18),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(255,79,216,0.18),transparent_40%)]" />
      <svg
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="rassy-wave-primary" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,230,109,0.0)" />
            <stop offset="20%" stopColor="rgba(255,230,109,0.5)" />
            <stop offset="55%" stopColor="rgba(255,255,255,0.82)" />
            <stop offset="100%" stopColor="rgba(66,245,255,0.0)" />
          </linearGradient>
          <linearGradient id="rassy-wave-secondary" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,79,216,0.0)" />
            <stop offset="40%" stopColor="rgba(255,79,216,0.4)" />
            <stop offset="100%" stopColor="rgba(66,245,255,0.0)" />
          </linearGradient>
          <filter id="rassy-wave-blur">
            <feGaussianBlur stdDeviation="0.45" />
          </filter>
        </defs>

        <path
          d={haloPath}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="0.65"
          fill="none"
          filter="url(#rassy-wave-blur)"
        />
        <path
          d={secondaryPath}
          stroke="url(#rassy-wave-secondary)"
          strokeWidth="0.5"
          fill="none"
          opacity={frame.active ? 0.82 : 0.34}
        />
        <path
          d={primaryPath}
          stroke="url(#rassy-wave-primary)"
          strokeWidth={frame.active ? 0.8 : 0.56}
          fill="none"
          opacity={frame.active ? 0.96 : 0.44}
          filter="url(#rassy-wave-blur)"
        />
      </svg>
    </div>
  );
}
