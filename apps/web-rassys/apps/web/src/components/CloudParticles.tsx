"use client";

import { useEffect, useRef } from "react";

const palette = ["255, 79, 216", "66, 245, 255", "255, 230, 109"];
const PARTICLE_COUNT = 56;
const PIXEL_SIZE = 3;
const PIXEL_STEP = 3.35;
const PIXEL_OFFSET = 25.125;
const VISITORS = [
  ["unicorn", [
    "000000002000000", "000000012000000", "000000111000000", "000001111100000",
    "000011110110000", "000111111111000", "001111111111100", "011111311111110",
    "001111111111000", "000111111110000", "000011111100000", "000010011000000",
    "000010011000000", "000110011000000", "000110011000000"
  ]],
  ["whaleshark", [
    "000000001000000", "000000011100000", "000000111110000", "000001111111000",
    "000011111111100", "000111111111110", "001111111111111", "011111311111111",
    "111111111111110", "011111111111100", "001111111111000", "000111111110000",
    "000011111100000", "000001111000000", "000000110000000"
  ]],
  ["flower", [
    "000000011100000", "000001112110000", "000011111111000", "000111111111100",
    "001111131111110", "011111111111111", "001111111111100", "000011111110000",
    "000001112100000", "000001111100000", "000001111100000", "000011111110000",
    "000111001110000", "000110000110000", "000100000010000"
  ]],
  ["trout", [
    "000000010000000", "000000111000000", "000001111100000", "000011111110000",
    "000111111111000", "001111131111110", "011111111111111", "111111111111110",
    "011111211111100", "001111111111000", "000111111110000", "000011101100000",
    "000001111000000", "000000110000000", "000000010000000"
  ]],
  ["jellyfish", [
    "000001111100000", "000011111110000", "000111111111000", "001111311111100",
    "011111111111110", "001111111111100", "000111111111000", "000011111110000",
    "000001111100000", "000001111100000", "000101110100000", "001001110010000",
    "000001110000000", "000101110100000", "001001110010000"
  ]]
] as const;

const visitorInk: Record<string, { body: string; glow: string; highlight: string; label: string }> = {
  unicorn: { body: "255,230,109", glow: "255,79,216", highlight: "255,255,255", label: "UNICORN" },
  whaleshark: { body: "66,245,255", glow: "104,128,255", highlight: "220,255,255", label: "WHALESHARK" },
  flower: { body: "255,79,216", glow: "255,230,109", highlight: "255,190,245", label: "NIGHT FLOWER" },
  trout: { body: "255,145,76", glow: "66,245,255", highlight: "255,230,109", label: "TROUT" },
  jellyfish: { body: "190,120,255", glow: "66,245,255", highlight: "255,210,255", label: "JELLYFISH" }
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
    let visitor: { name: string; pattern: readonly string[]; x: number; y: number; born: number; phase: number; direction: number; trail: Array<{ x: number; y: number; phase: number }> } | null = null;
    let nextVisitor = performance.now() + 1800;
    let animationFrame = 0;
    let previousFrame = performance.now();
    let lastVisitorIndex = -1;

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
          let choiceIndex = Math.floor(Math.random() * VISITORS.length);
          if (VISITORS.length > 1 && choiceIndex === lastVisitorIndex) {
            choiceIndex = (choiceIndex + 1) % VISITORS.length;
          }
          lastVisitorIndex = choiceIndex;
          const choice = VISITORS[choiceIndex];
          visitor = { name: choice[0], pattern: choice[1], x: Math.random() * Math.max(60, width - 110), y: height + 36, born: now, phase: Math.random() * Math.PI * 2, direction: Math.random() > 0.5 ? 1 : -1, trail: [] };
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
          const visitorPattern = visitor.pattern;
          const ink = visitorInk[visitor.name];
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.shadowColor = `rgba(${ink.glow},0.7)`;
          ctx.shadowBlur = 22;
          visitor.trail.slice(2).forEach((ghost, trailIndex) => {
            ctx.save();
            ctx.translate(ghost.x + PIXEL_OFFSET, ghost.y + PIXEL_OFFSET);
            ctx.rotate(Math.sin(ghost.phase) * 0.06);
            ctx.globalAlpha = fade * Math.max(0.015, 0.1 - trailIndex * 0.009);
            ctx.fillStyle = `rgba(${ink.glow},0.7)`;
            visitorPattern.forEach((row, rowIndex) => [...row].forEach((cell, colIndex) => {
              if (cell !== "0") ctx.fillRect(colIndex * PIXEL_STEP - PIXEL_OFFSET, rowIndex * PIXEL_STEP - PIXEL_OFFSET, PIXEL_SIZE, PIXEL_SIZE);
            }));
            ctx.restore();
          });
          ctx.translate(visitor.x + PIXEL_OFFSET, visitor.y + PIXEL_OFFSET);
          ctx.rotate(Math.sin(visitor.phase) * 0.06);
          ctx.globalAlpha = fade * shimmer;
          // Keep the sprite grid crisp; the second pass supplies the haze.
          ctx.shadowBlur = 3;
          visitorPattern.forEach((row, rowIndex) => [...row].forEach((cell, colIndex) => {
            if (cell !== "0") {
              ctx.fillStyle = cell === "2" ? `rgba(${ink.highlight},0.9)` : cell === "3" ? "rgba(8,0,17,0.95)" : `rgba(${ink.body},0.86)`;
              ctx.fillRect(Math.round(colIndex * PIXEL_STEP - PIXEL_OFFSET), Math.round(rowIndex * PIXEL_STEP - PIXEL_OFFSET), PIXEL_SIZE, PIXEL_SIZE);
            }
          }));
          ctx.shadowBlur = 18;
          ctx.globalAlpha = fade * 0.08;
          visitorPattern.forEach((row, rowIndex) => [...row].forEach((cell, colIndex) => {
            if (cell !== "0") ctx.fillRect(colIndex * PIXEL_STEP - PIXEL_OFFSET, rowIndex * PIXEL_STEP - PIXEL_OFFSET, PIXEL_SIZE, PIXEL_SIZE);
          }));
          ctx.globalCompositeOperation = "source-over";
          ctx.shadowBlur = 0;
          ctx.globalAlpha = fade * 0.72;
          ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.fillStyle = `rgba(${ink.highlight},0.78)`;
          ctx.fillText(ink.label, -PIXEL_OFFSET, -PIXEL_OFFSET - 8);
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
