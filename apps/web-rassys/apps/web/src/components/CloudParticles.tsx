"use client";

import { useEffect, useRef } from "react";

const palette = ["255, 79, 216", "66, 245, 255", "255, 230, 109"];
const PARTICLE_COUNT = 56;
const VISITORS = [
  ["unicorn", [
    "0000000200000", "0000001200000", "0000011100000", "0000111110000",
    "0001111011000", "0011111111100", "0111111111110", "0011121111000",
    "0001111110000", "0000111100000", "0000100100000", "0000100100000", "0001100110000"
  ]],
  ["whaleshark", [
    "0000000100000", "0000001110000", "0000011111000", "0000111111100",
    "0001111111110", "0011113111111", "0111111111110", "1111111111110",
    "0111111111100", "0011111111000", "0001111110000", "0000111100000", "0000011000000"
  ]],
  ["flower", [
    "0000011100000", "0000111210000", "0001111111000", "0011113111100",
    "0111111111110", "0011111111100", "0000111110000", "0000011200000",
    "0000011100000", "0000011100000", "0000111100000", "0001100110000", "0001000010000"
  ]],
  ["trout", [
    "0000001000000", "0000011100000", "0000111110000", "0001111111000",
    "0011111311110", "0111111111111", "1111111111110", "0111121111100",
    "0011111111000", "0001111110000", "0000110100000", "0000011100000", "0000001000000"
  ]]
] as const;

const visitorInk: Record<string, { body: string; glow: string; highlight: string }> = {
  unicorn: { body: "255,230,109", glow: "255,79,216", highlight: "255,255,255" },
  whaleshark: { body: "66,245,255", glow: "104,128,255", highlight: "220,255,255" },
  flower: { body: "255,79,216", glow: "255,230,109", highlight: "255,190,245" },
  trout: { body: "255,145,76", glow: "66,245,255", highlight: "255,230,109" }
};

const createParticles = (count: number, width: number, height: number) =>
  Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.22,
    vy: (Math.random() - 0.5) * 0.22,
    size: 0.8 + Math.random() * 1.8,
    alpha: 0.16 + Math.random() * 0.32,
    color: palette[Math.floor(Math.random() * palette.length)]
  }));

export function CloudParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    let particles = createParticles(PARTICLE_COUNT, width, height);
    let visitor: { pattern: readonly string[]; x: number; y: number; born: number; phase: number; direction: number; trail: Array<{ x: number; y: number; phase: number }> } | null = null;
    let nextVisitor = performance.now() + 1800;
    let animationFrame = 0;
    let previousFrame = performance.now();

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      particles = createParticles(PARTICLE_COUNT, width, height);
    };

    const tick = (now: number) => {
      // Normalize movement to elapsed time so 60Hz, 120Hz, throttled tabs, and
      // Firefox power-saving all produce the same gentle float.
      const frameScale = Math.min(2.5, Math.max(0.25, (now - previousFrame) / 16.67));
      previousFrame = now;
      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createRadialGradient(
        width * 0.5,
        height * 0.2,
        10,
        width * 0.5,
        height * 0.2,
        width * 0.85
      );
      gradient.addColorStop(0, "rgba(255,79,216,0.12)");
      gradient.addColorStop(0.5, "rgba(66,245,255,0.09)");
      gradient.addColorStop(1, "rgba(8,0,17,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Reduced-motion mode still gets the artwork; it only receives a calmer
      // drift so the ambient station never feels empty in Firefox.
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      {
        if (!visitor && now > nextVisitor) {
          const choice = VISITORS[Math.floor(Math.random() * VISITORS.length)];
          visitor = { pattern: choice[1], x: Math.random() * Math.max(40, width - 90), y: height + 30, born: now, phase: Math.random() * Math.PI * 2, direction: Math.random() > 0.5 ? 1 : -1, trail: [] };
          // Keep the ambient layer continuously inhabited: the next visitor is
          // ready before the current one can leave even on a short viewport.
          nextVisitor = now + 3500;
        }
        if (visitor) {
          visitor.y -= (reducedMotion ? 0.12 : 0.28) * frameScale;
          visitor.phase += (reducedMotion ? 0.002 : 0.006) * frameScale;
          visitor.x += (visitor.direction * (reducedMotion ? 0.02 : 0.04) + Math.sin(visitor.phase) * (reducedMotion ? 0.04 : 0.11)) * frameScale;
          visitor.trail.unshift({ x: visitor.x, y: visitor.y, phase: visitor.phase });
          visitor.trail = visitor.trail.slice(0, reducedMotion ? 5 : 10);
          const age = now - visitor.born;
          const fade = Math.min(1, age / 1400, Math.max(0, (height - visitor.y) / 90));
          const shimmer = 0.82 + Math.sin(visitor.phase * 2.5) * 0.18;
          const ink = visitorInk[visitor.pattern === VISITORS[0][1] ? "unicorn" : visitor.pattern === VISITORS[1][1] ? "whaleshark" : visitor.pattern === VISITORS[2][1] ? "flower" : "trout"];
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.shadowColor = `rgba(${ink.glow},0.7)`;
          ctx.shadowBlur = 22;
          visitor.trail.slice(2).forEach((ghost, trailIndex) => {
            ctx.save();
            ctx.translate(ghost.x + 32.5, ghost.y + 32.5);
            ctx.rotate(Math.sin(ghost.phase) * 0.06);
            ctx.globalAlpha = fade * Math.max(0.015, 0.1 - trailIndex * 0.009);
            ctx.fillStyle = `rgba(${ink.glow},0.7)`;
            visitor.pattern.forEach((row, rowIndex) => [...row].forEach((cell, colIndex) => {
              if (cell !== "0") ctx.fillRect(colIndex * 5 - 27.5, rowIndex * 5 - 32.5, 4, 4);
            }));
            ctx.restore();
          });
          ctx.translate(visitor.x + 32.5, visitor.y + 32.5);
          ctx.rotate(Math.sin(visitor.phase) * 0.06);
          ctx.globalAlpha = fade * shimmer;
          ctx.shadowBlur = 16;
          visitor.pattern.forEach((row, rowIndex) => [...row].forEach((cell, colIndex) => {
            if (cell !== "0") {
              ctx.fillStyle = cell === "2" ? `rgba(${ink.highlight},0.9)` : cell === "3" ? "rgba(8,0,17,0.95)" : `rgba(${ink.body},0.86)`;
              ctx.fillRect(colIndex * 5 - 27.5, rowIndex * 5 - 32.5, 4, 4);
            }
          }));
          ctx.shadowBlur = 28;
          ctx.globalAlpha = fade * 0.12;
          visitor.pattern.forEach((row, rowIndex) => [...row].forEach((cell, colIndex) => {
            if (cell !== "0") ctx.fillRect(colIndex * 5 - 27.5, rowIndex * 5 - 32.5, 4, 4);
          }));
          ctx.restore();
          if (visitor.y < -50) visitor = null;
        }
      }

      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
