"use client";

import { useEffect, useRef } from "react";

const palette = ["255, 79, 216", "66, 245, 255", "255, 230, 109"];
const PARTICLE_COUNT = 42;
// Keep the visitors physically small, but give each one a much finer internal
// grid so faces, limbs, fins, petals, and little emotional gestures survive.
const PIXEL_SIZE = 0.72;
const PIXEL_STEP = 0.7625;
const PIXEL_OFFSET = 32;
const VISITORS = [
  ["unicorn", [
    "000000000002000000000", "000000000012000000000", "000000000112000000000", "000000001111200000000",
    "000000011111120000000", "000000111111112000000", "000001111111111200000", "000011111111111120000",
    "000111111111111112000", "001111111311111111200", "011111111111111111120", "001111111111111111100",
    "000111111111111111000", "000011111111111110000", "000001111111111100000", "000000111111111000000",
    "000000011110011000000", "000000011110011000000", "000000111110111000000", "000000110000110000000",
    "000000100000010000000"
  ]],
  ["whaleshark", [
    "000000000001000000000", "000000000011100000000", "000000000111110000000", "000000001111111000000",
    "000000011111111100000", "000000111111111110000", "000001111111111111000", "000011111111111111100",
    "000111111111111111110", "001111111111111111111", "011111111311111111111", "111111111111111111110",
    "011111111111111111100", "001111111111111111000", "000111111111111110000", "000011111111111100000",
    "000001111111111000000", "000000111111110000000", "000000011111100000000", "000000001111000000000",
    "000000000110000000000"
  ]],
  ["flower", [
    "000000001111100000000", "000000011111110000000", "000000111121111000000", "000001111111111100000",
    "000011111131111110000", "000111111111111111000", "001111111111111111100", "011111111111111111110",
    "001111111111111111100", "000111111111111111000", "000011111111111110000", "000001111111111100000",
    "000000111111111000000", "000000011111110000000", "000000001111100000000", "000000001111100000000",
    "000000001111100000000", "000000011111110000000", "000000111001110000000", "000000110000110000000",
    "000000100000010000000"
  ]],
  ["trout", [
    "000000000010000000000", "000000000111000000000", "000000001111100000000", "000000011111110000000",
    "000000111111111000000", "000001111111111100000", "000011111111111110000", "000111111111111111000",
    "001111111111111111100", "011111111311111111110", "111111111111111111111", "011111111111111111110",
    "001111111111111111100", "000111111111111111000", "000011111211111110000", "000001111111111100000",
    "000000111111111000000", "000000011111110000000", "000000001111100000000", "000000000111000000000",
    "000000000010000000000"
  ]],
  ["jellyfish", [
    "000000001111100000000", "000000011111110000000", "000000111111111000000", "000001111311111100000",
    "000011111111111110000", "000111111111111111000", "001111111111111111100", "011111111111111111110",
    "001111111111111111100", "000111111111111111000", "000011111111111110000", "000001111111111100000",
    "000001111111111100000", "000001111111111100000", "000001111111111100000", "000101111011110100000",
    "001001110001110010000", "000001110001110000000", "000101100001101000000", "001001000001001000000",
    "000000000000000000000"
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
              if (cell !== "0") ctx.fillRect(colIndex * 4 * PIXEL_STEP - PIXEL_OFFSET, rowIndex * 4 * PIXEL_STEP - PIXEL_OFFSET, PIXEL_SIZE * 4, PIXEL_SIZE * 4);
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
              ctx.fillRect(Math.round(colIndex * 4 * PIXEL_STEP - PIXEL_OFFSET), Math.round(rowIndex * 4 * PIXEL_STEP - PIXEL_OFFSET), PIXEL_SIZE * 4, PIXEL_SIZE * 4);
            }
          }));
          // Fine facial marks sit above the silhouette so the tiny visitors
          // read as characters rather than anonymous blobs.
          ctx.fillStyle = `rgba(${ink.highlight},0.98)`;
          if (visitor.name === "unicorn") {
            ctx.fillRect(-12, -8, 2.2, 2.2); ctx.fillRect(7, -8, 2.2, 2.2);
            ctx.fillStyle = "rgba(8,0,17,0.95)"; ctx.fillRect(-11.2, -7.5, .9, .9); ctx.fillRect(7.8, -7.5, .9, .9);
            ctx.fillRect(-2, 0, 4, 1); ctx.fillRect(-1, 1, 2, 1);
          } else if (visitor.name === "whaleshark") {
            ctx.fillRect(14, -5, 2.5, 2.5); ctx.fillStyle = "rgba(8,0,17,0.95)"; ctx.fillRect(15, -4.5, 1, 1);
            ctx.fillStyle = `rgba(${ink.highlight},0.8)`; ctx.fillRect(4, 3, 1.2, 1.2); ctx.fillRect(7, 4, 1.2, 1.2); ctx.fillRect(10, 3, 1.2, 1.2);
          } else if (visitor.name === "flower") {
            ctx.fillRect(-3, -3, 6, 6); ctx.fillStyle = `rgba(${ink.glow},0.95)`; ctx.fillRect(-1.4, -1.4, 2.8, 2.8);
          } else if (visitor.name === "trout") {
            ctx.fillRect(14, -5, 2.3, 2.3); ctx.fillStyle = "rgba(8,0,17,0.95)"; ctx.fillRect(15, -4.4, 1, 1);
            ctx.fillStyle = `rgba(${ink.highlight},0.9)`; ctx.fillRect(4, 1, 1.3, 1.3); ctx.fillRect(8, 0, 1.3, 1.3);
          } else {
            ctx.fillRect(-9, -5, 2.2, 2.2); ctx.fillRect(7, -5, 2.2, 2.2);
            ctx.fillStyle = "rgba(8,0,17,0.95)"; ctx.fillRect(-8.3, -4.4, 1, 1); ctx.fillRect(7.7, -4.4, 1, 1);
            ctx.fillStyle = `rgba(${ink.glow},0.9)`; ctx.fillRect(-2, 3, 4, 1);
          }
          ctx.shadowBlur = 18;
          ctx.globalAlpha = fade * 0.08;
          visitorPattern.forEach((row, rowIndex) => [...row].forEach((cell, colIndex) => {
            if (cell !== "0") ctx.fillRect(colIndex * 4 * PIXEL_STEP - PIXEL_OFFSET, rowIndex * 4 * PIXEL_STEP - PIXEL_OFFSET, PIXEL_SIZE * 4, PIXEL_SIZE * 4);
          }));
          ctx.globalCompositeOperation = "source-over";
          ctx.shadowBlur = 0;
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
