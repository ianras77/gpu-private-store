"use client";

import { useEffect, useRef } from "react";

const palette = ["255, 79, 216", "66, 245, 255", "255, 230, 109"];
const PARTICLE_COUNT = 56;
const VISITORS = [
  ["unicorn", ["00100", "01110", "10101", "01110", "00100"]],
  ["whaleshark", ["00100", "01110", "11111", "01110", "00100"]],
  ["flower", ["00100", "10101", "01110", "10101", "00100"]],
  ["trout", ["01000", "11110", "01111", "11110", "01000"]]
] as const;

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
    let visitor: { pattern: readonly string[]; x: number; y: number; born: number } | null = null;
    let nextVisitor = performance.now() + 9000;

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      particles = createParticles(PARTICLE_COUNT, width, height);
    };

    const tick = () => {
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

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches === false) {
        if (!visitor && performance.now() > nextVisitor) {
          const choice = VISITORS[Math.floor(Math.random() * VISITORS.length)];
          visitor = { pattern: choice[1], x: Math.random() * Math.max(40, width - 90), y: height + 20, born: performance.now() };
          nextVisitor = performance.now() + 22000;
        }
        if (visitor) {
          visitor.y -= 0.16;
          const age = performance.now() - visitor.born;
          const fade = Math.min(1, age / 1400, Math.max(0, (height - visitor.y) / 90));
          ctx.fillStyle = `rgba(255,230,109,${0.16 * fade})`;
          visitor.pattern.forEach((row, rowIndex) => [...row].forEach((cell, colIndex) => {
            if (cell === "1") ctx.fillRect(visitor!.x + colIndex * 6, visitor!.y + rowIndex * 6, 3, 3);
          }));
          if (visitor.y < -50) visitor = null;
        }
      }

      requestAnimationFrame(tick);
    };

    const handle = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(handle);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
