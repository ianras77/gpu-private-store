"use client";

import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";

export type RunEvent = {
  type: string;
  ts_s: number;
  data?: Record<string, unknown>;
};

export type RunSummary = {
  distance_m: number;
  duration_s: number;
  avg_pace_s_per_km: number;
  events: RunEvent[];
};

export type Metrics = {
  pace: number;
  streak: number;
  xp: number;
};

type RunnerGameProps = {
  running: boolean;
  simulatePace: boolean;
  themeKey?: string;
  onMetrics: (metrics: Metrics) => void;
  onGameOver: (summary: RunSummary) => void;
};

const PIXELS_PER_METER = 3.2;

type ThemePalette = {
  farA: string;
  farB: string;
  midA: string;
  midB: string;
  groundA: string;
  groundB: string;
  obstacleA: number;
  obstacleB: number;
  relicA: number;
  relicB: number;
  runner: number;
};

const THEMES: Record<string, ThemePalette> = {
  "neon-canopy": {
    farA: "#07111a",
    farB: "#0b1c2b",
    midA: "#0b2b1a",
    midB: "#134b2e",
    groundA: "#3b1d0f",
    groundB: "#603218",
    obstacleA: 0x552200,
    obstacleB: 0x8a4b2e,
    relicA: 0x44f0ff,
    relicB: 0xffffff,
    runner: 0xffd166
  },
  "temple-steps": {
    farA: "#1b0f0f",
    farB: "#2d1910",
    midA: "#2a1a12",
    midB: "#3b2618",
    groundA: "#4a3a2a",
    groundB: "#6b553f",
    obstacleA: 0x5d3b21,
    obstacleB: 0x8a6240,
    relicA: 0xffd166,
    relicB: 0xfff2b3,
    runner: 0xc7e9ff
  },
  "riverlight-loop": {
    farA: "#051427",
    farB: "#0b2236",
    midA: "#0b2a3a",
    midB: "#123b4f",
    groundA: "#0f3b4a",
    groundB: "#1a5b6d",
    obstacleA: 0x144a5d,
    obstacleB: 0x1e6b7f,
    relicA: 0x62ff7d,
    relicB: 0xcaffee,
    runner: 0xffe066
  }
};

function createPatternTexture(colorA: string, colorB: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return PIXI.Texture.WHITE;
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = colorB;
  for (let i = 0; i < 180; i += 1) {
    const x = Math.floor(Math.random() * 32) * 2;
    const y = Math.floor(Math.random() * 32) * 2;
    ctx.fillRect(x, y, 2, 2);
  }
  return PIXI.Texture.from(canvas, { scaleMode: PIXI.SCALE_MODES.NEAREST });
}

export default function RunnerGame({
  running,
  simulatePace,
  themeKey,
  onMetrics,
  onGameOver
}: RunnerGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(running);
  const simulateRef = useRef(simulatePace);
  const metricsRef = useRef<Metrics>({ pace: 3.5, streak: 0, xp: 0 });
  const eventsRef = useRef<RunEvent[]>([]);
  const elapsedRef = useRef(0);
  const distanceRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    simulateRef.current = simulatePace;
  }, [simulatePace]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new PIXI.Application({
      backgroundAlpha: 0,
      resizeTo: container,
      antialias: false
    });
    container.appendChild(app.view as unknown as Node);

    const theme = THEMES[themeKey ?? "neon-canopy"] ?? THEMES["neon-canopy"];
    const farTexture = createPatternTexture(theme.farA, theme.farB);
    const midTexture = createPatternTexture(theme.midA, theme.midB);
    const groundTexture = createPatternTexture(theme.groundA, theme.groundB);

    const bgFar = new PIXI.TilingSprite(farTexture, app.screen.width, app.screen.height);
    bgFar.tileScale.set(2.5);
    app.stage.addChild(bgFar);

    const bgMid = new PIXI.TilingSprite(midTexture, app.screen.width, app.screen.height);
    bgMid.tileScale.set(3.2);
    bgMid.alpha = 0.8;
    app.stage.addChild(bgMid);

    const groundHeight = 140;
    const ground = new PIXI.TilingSprite(groundTexture, app.screen.width, groundHeight);
    ground.y = app.screen.height - groundHeight;
    ground.tileScale.set(2.8);
    app.stage.addChild(ground);

    const player = new PIXI.Graphics();
    player.beginFill(theme.runner);
    player.drawRect(0, 0, 22, 34);
    player.endFill();
    player.beginFill(0x0b1c2b);
    player.drawRect(4, 6, 6, 6);
    player.endFill();
    player.x = app.screen.width * 0.22;
    player.y = ground.y - 34;
    app.stage.addChild(player);

    const obstacles: { sprite: PIXI.Graphics; width: number; height: number }[] = [];
    const relics: { sprite: PIXI.Graphics; size: number; collected: boolean }[] = [];

    const spawnObstacle = (x: number) => {
      const log = new PIXI.Graphics();
      log.beginFill(theme.obstacleA);
      log.drawRect(0, 0, 32, 20);
      log.endFill();
      log.beginFill(theme.obstacleB);
      log.drawRect(2, 4, 28, 6);
      log.endFill();
      log.x = x;
      log.y = ground.y - 18;
      app.stage.addChild(log);
      obstacles.push({ sprite: log, width: 32, height: 20 });
    };

    const spawnRelic = (x: number) => {
      const relic = new PIXI.Graphics();
      relic.beginFill(theme.relicA);
      relic.drawCircle(0, 0, 8);
      relic.endFill();
      relic.beginFill(theme.relicB);
      relic.drawCircle(-2, -2, 2);
      relic.endFill();
      relic.x = x;
      relic.y = ground.y - 60 - Math.random() * 40;
      app.stage.addChild(relic);
      relics.push({ sprite: relic, size: 16, collected: false });
    };

    for (let i = 0; i < 4; i += 1) {
      spawnObstacle(app.screen.width + i * 240);
      spawnRelic(app.screen.width + i * 260 + 140);
    }

    let velocityY = 0;
    const gravity = 0.75;
    const jumpPower = -12;
    let pace = metricsRef.current.pace;
    let targetPace = pace;

    const keys = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => {
      keys.add(event.code);
      if (event.code === "Space" && runningRef.current) {
        if (player.y >= ground.y - 34) {
          velocityY = jumpPower;
          eventsRef.current.push({ type: "jump", ts_s: Math.floor(elapsedRef.current), data: {} });
        }
      }
      if (event.code === "KeyC" && runningRef.current) {
        finishRun("cashout");
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let lastMetricUpdate = 0;

    const finishRun = (reason: string) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const durationS = Math.max(1, Math.floor(elapsedRef.current));
      const distanceM = Math.max(1, Math.floor(distanceRef.current));
      const avgPace = Math.round(durationS / (distanceM / 1000));
      eventsRef.current.push({ type: reason, ts_s: Math.floor(elapsedRef.current), data: {} });
      onGameOver({
        distance_m: distanceM,
        duration_s: durationS,
        avg_pace_s_per_km: avgPace,
        events: eventsRef.current
      });
    };

    app.ticker.add(() => {
      const deltaMs = app.ticker.deltaMS;
      if (!runningRef.current || finishedRef.current) return;

      if (simulateRef.current) {
        targetPace = 3 + Math.sin(performance.now() / 1200) * 1.5 + Math.random() * 0.3;
      } else {
        if (keys.has("ArrowUp")) targetPace += 0.05;
        if (keys.has("ArrowDown")) targetPace -= 0.05;
      }

      targetPace = Math.min(8, Math.max(1.5, targetPace));
      pace += (targetPace - pace) * 0.08;
      pace = Math.min(8, Math.max(1.5, pace));

      const speed = 120 + pace * 55;
      const delta = deltaMs / 1000;

      elapsedRef.current += delta;
      distanceRef.current += (speed * delta) / PIXELS_PER_METER;

      bgFar.tilePosition.x -= speed * delta * 0.15;
      bgMid.tilePosition.x -= speed * delta * 0.3;
      ground.tilePosition.x -= speed * delta * 0.55;

      velocityY += gravity;
      player.y += velocityY;
      if (player.y >= ground.y - 34) {
        player.y = ground.y - 34;
        velocityY = 0;
      }

      obstacles.forEach((obstacle) => {
        obstacle.sprite.x -= speed * delta;
        if (obstacle.sprite.x < -80) {
          obstacle.sprite.x = app.screen.width + Math.random() * 240 + 200;
        }
        const hitX = obstacle.sprite.x < player.x + 22 && obstacle.sprite.x + obstacle.width > player.x;
        const hitY = obstacle.sprite.y < player.y + 34 && obstacle.sprite.y + obstacle.height > player.y + 8;
        if (hitX && hitY) {
          finishRun("crash");
        }
      });

      relics.forEach((relic) => {
        relic.sprite.x -= speed * delta;
        if (relic.sprite.x < -50) {
          relic.sprite.x = app.screen.width + Math.random() * 300 + 200;
          relic.collected = false;
          relic.sprite.alpha = 1;
          relic.sprite.y = ground.y - 60 - Math.random() * 40;
        }
        const hitX = relic.sprite.x < player.x + 18 && relic.sprite.x > player.x - 6;
        const hitY = relic.sprite.y < player.y + 28 && relic.sprite.y > player.y - 20;
        if (hitX && hitY && !relic.collected) {
          relic.collected = true;
          relic.sprite.alpha = 0.2;
          metricsRef.current.xp += 12;
          metricsRef.current.streak += 1;
          eventsRef.current.push({ type: "relic", ts_s: Math.floor(elapsedRef.current), data: {} });
        }
      });

      if (performance.now() - lastMetricUpdate > 200) {
        lastMetricUpdate = performance.now();
        metricsRef.current.pace = pace;
        onMetrics({ ...metricsRef.current });
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      bgFar.width = app.screen.width;
      bgFar.height = app.screen.height;
      bgMid.width = app.screen.width;
      bgMid.height = app.screen.height;
      ground.width = app.screen.width;
      ground.y = app.screen.height - groundHeight;
      player.x = app.screen.width * 0.22;
      player.y = ground.y - 34;
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      app.destroy(true);
      container.innerHTML = "";
    };
  }, [onGameOver, onMetrics, themeKey]);

  return <div ref={containerRef} className="game-canvas w-full h-full" />;
}
