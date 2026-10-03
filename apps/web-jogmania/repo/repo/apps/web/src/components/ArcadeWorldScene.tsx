import type { ArcadeDecoration } from "@jogmania/api-client";

const LIGHT_POSITIONS: [number, number][] = [
  [505, 78], [540, 78], [575, 78], [610, 78], [645, 78],
  [505, 100], [540, 100], [575, 100], [610, 100], [645, 100],
];

const DECORATION_POSITIONS: Record<ArcadeDecoration["slot"], [number, number]> = {
  "roof-left": [493, 53],
  "roof-center": [560, 53],
  "roof-right": [627, 53],
  "window-left": [482, 132],
  "window-right": [643, 132],
  "garden-left": [442, 180],
  "garden-center": [450, 187],
  "garden-right": [681, 180],
};

type WorldTheme = {
  skyTop: string;
  skyBottom: string;
  far: string;
  middle: string;
  near: string;
  marquee: string;
  accent: string;
  landmark: "arcade" | "wheel" | "pier" | "sunrise" | "clouds" | "candy" | "moon" | "town";
};

const WORLD_THEMES: Array<{ match: string; theme: WorldTheme }> = [
  { match: "moonlight midway", theme: { skyTop: "#20113f", skyBottom: "#432153", far: "#34264e", middle: "#49315c", near: "#67405e", marquee: "MOONLIGHT", accent: "#ff9ed8", landmark: "wheel" } },
  { match: "starry boardwalk", theme: { skyTop: "#091d42", skyBottom: "#07505c", far: "#183b58", middle: "#155661", near: "#167070", marquee: "BOARDWALK", accent: "#6df3ff", landmark: "pier" } },
  { match: "sunrise pier", theme: { skyTop: "#54234c", skyBottom: "#f68a55", far: "#60405c", middle: "#856051", near: "#bf7449", marquee: "SUNRISE", accent: "#ffe26b", landmark: "sunrise" } },
  { match: "cloudtop carnival", theme: { skyTop: "#1f3160", skyBottom: "#678fb8", far: "#566f9a", middle: "#6e91b0", near: "#90aac0", marquee: "CLOUDTOP", accent: "#fff0a8", landmark: "clouds" } },
  { match: "jellybean junction", theme: { skyTop: "#321746", skyBottom: "#634277", far: "#3c4562", middle: "#4a765b", near: "#6e8b55", marquee: "JELLYBEAN", accent: "#ff75c8", landmark: "candy" } },
  { match: "lunar lanes", theme: { skyTop: "#090e2b", skyBottom: "#263e68", far: "#1b2b52", middle: "#34486a", near: "#4e6170", marquee: "LUNAR LANES", accent: "#71e8ff", landmark: "moon" } },
  { match: "twinkle town", theme: { skyTop: "#181535", skyBottom: "#31536d", far: "#2c3d58", middle: "#465367", near: "#58645e", marquee: "TWINKLE TOWN", accent: "#ffe26b", landmark: "town" } },
];

const DEFAULT_THEME: WorldTheme = {
  skyTop: "#151135", skyBottom: "#07383c", far: "#18384b", middle: "#145646", near: "#17633e",
  marquee: "LOST ARCADE", accent: "#f35fb7", landmark: "arcade",
};

function worldTheme(chapter: string): WorldTheme {
  const normalized = chapter.toLowerCase();
  return WORLD_THEMES.find(({ match }) => normalized.startsWith(match))?.theme ?? DEFAULT_THEME;
}

export default function ArcadeWorldScene({
  chapter,
  lights,
  decorations = [],
}: {
  chapter: string;
  lights: string[];
  decorations?: ArcadeDecoration[];
}) {
  const litCount = Math.min(LIGHT_POSITIONS.length, lights.length);
  const theme = worldTheme(chapter);

  return (
    <svg
      viewBox="0 0 720 230"
      role="img"
      aria-label={`${chapter} at night. ${litCount} arcade lights are glowing.`}
      className="h-auto w-full rounded-2xl border border-white/10 bg-[#07131f]"
      shapeRendering="crispEdges"
    >
      <defs>
        <linearGradient id="arcade-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={theme.skyTop} />
          <stop offset="1" stopColor={theme.skyBottom} />
        </linearGradient>
        <linearGradient id="arcade-screen" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#21e8c4" />
          <stop offset="1" stopColor="#5c46dc" />
        </linearGradient>
      </defs>

      <rect width="720" height="230" fill="url(#arcade-sky)" />
      <circle cx="94" cy="48" r="23" fill="#ffe8a3" />
      <circle cx="102" cy="40" r="23" fill={theme.skyTop} />
      {[[40, 37], [169, 31], [228, 61], [385, 35], [430, 73], [333, 56]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="4" height="4" fill={i % 2 ? "#70efff" : "#fff2ad"} />
      ))}

      <path d="M0 147 79 91l44 30 79-68 78 76 67-49 85 72v48H0Z" fill={theme.far} />
      <path d="M0 166 88 125l61 35 74-61 84 69 83-46 72 51v35H0Z" fill={theme.middle} />
      <path d="M0 188 85 159l65 23 76-43 89 47 70-36 80 35v45H0Z" fill={theme.near} />

      {theme.landmark === "wheel" ? (
        <g stroke={theme.accent} strokeWidth="3" fill="none"><circle cx="137" cy="128" r="34" /><circle cx="137" cy="128" r="5" fill={theme.accent} />{[0, 60, 120].map((angle) => <path key={angle} d="M137 128v-34" transform={`rotate(${angle} 137 128)`} />)}<path d="M109 165h56M119 162l-6 13m37-13 6 13" /></g>
      ) : null}
      {theme.landmark === "pier" ? (
        <g fill="none" stroke={theme.accent} strokeWidth="4"><path d="M54 151h144M75 151v39m47-39v39m47-39v39M70 138q26-29 52 0t52 0" /><path d="M85 125v-20l18-15 18 15v20m-36-20h36" /></g>
      ) : null}
      {theme.landmark === "sunrise" ? (
        <g><circle cx="145" cy="126" r="27" fill="#ffcc70" /><path d="M108 151q37-13 74 0v9h-74z" fill="#ff925f" /><path d="M87 168h116m-102 0v24m44-24v24m44-24v24" stroke="#ffe6a0" strokeWidth="4" /></g>
      ) : null}
      {theme.landmark === "clouds" ? (
        <g fill="#d5efff"><path d="M64 133a13 13 0 0 1 13-13 18 18 0 0 1 34-3 14 14 0 1 1 4 27H79a14 14 0 0 1-15-11Z" /><path d="M149 157a11 11 0 0 1 11-11 15 15 0 0 1 29-3 12 12 0 1 1 3 23h-30a12 12 0 0 1-13-9Z" /></g>
      ) : null}
      {theme.landmark === "candy" ? (
        <g><path d="M79 164h14v-27h-14zm48 15h16v-35h-16zm45-19h14v-30h-14z" fill="#f58ec4" /><circle cx="86" cy="130" r="12" fill="#ffe26b" /><circle cx="136" cy="137" r="14" fill="#75e7ff" /><circle cx="183" cy="124" r="11" fill="#f58ec4" /></g>
      ) : null}
      {theme.landmark === "moon" ? (
        <g><circle cx="139" cy="131" r="34" fill="#c6d8db" /><circle cx="151" cy="120" r="30" fill={theme.far} /><circle cx="119" cy="142" r="4" fill="#8196a9" /><circle cx="139" cy="153" r="6" fill="#8196a9" /><path d="M97 167h84" stroke={theme.accent} strokeWidth="4" /></g>
      ) : null}
      {theme.landmark === "town" ? (
        <g><path d="M67 163h35v-42l-17-15-18 15zm49 18h42v-58l-21-18-21 18zm56-25h35v-37l-18-15-17 15z" fill="#41345b" stroke={theme.accent} strokeWidth="3" /><path d="M77 132h7v8h-7zm15 0h7v8h-7zm35 5h8v10h-8zm16 0h8v10h-8zm38-12h7v8h-7z" fill="#fff1a2" /></g>
      ) : null}

      <path d="M0 195h720v35H0z" fill="#352c3b" />
      <path d="M0 207h720v7H0z" fill="#66504a" />
      <path d="M0 222h720v8H0z" fill="#201d2b" />
      <path d="M45 195h38v12H45zm132 0h47v12h-47zm286 0h34v12h-34z" fill="#f3b65e" />

      {/* A storybook puddle-pit and stepping stones: scenery, never route advice. */}
      <path d="M249 195h105v20h-105z" fill="#211830" />
      <path d="M262 200h20v5h-20zm42 5h18v5h-18z" fill="#8b4c9e" />
      <rect x="280" y="187" width="25" height="8" fill="#7bdcbd" />
      <rect x="319" y="187" width="21" height="8" fill="#7bdcbd" />

      {/* The lantern mouse peeks out beside the trail. */}
      <rect x="397" y="174" width="24" height="21" fill="#ffe17a" />
      <rect x="392" y="167" width="10" height="11" fill="#ffe17a" />
      <rect x="416" y="167" width="10" height="11" fill="#ffe17a" />
      <rect x="402" y="181" width="4" height="4" fill="#372444" />
      <rect x="414" y="181" width="4" height="4" fill="#372444" />
      <rect x="406" y="190" width="8" height="5" fill="#ef8f86" />
      <rect x="427" y="178" width="7" height="10" fill="#69efff" />

      {/* A chunky cabinet gives each saved run a visible place to leave its mark. */}
      <path d="M474 54h190v141h-190z" fill="#16132d" />
      <path d="M466 62h8v124h-8zm198 0h8v124h-8z" fill={theme.accent} />
      <rect x="486" y="63" width="166" height="47" rx="3" fill="#30204b" stroke="#ffd65e" strokeWidth="4" />
      <text x="569" y="92" fill="#fff2ad" fontFamily="monospace" fontSize={theme.marquee.length > 10 ? "12" : "16"} fontWeight="bold" textAnchor="middle">{theme.marquee}</text>
      {LIGHT_POSITIONS.map(([x, y], index) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="11"
          height="8"
          fill={index < litCount ? (index % 2 ? "#63fff0" : "#ffe26b") : "#51475a"}
        />
      ))}
      <rect x="501" y="125" width="136" height="47" fill="url(#arcade-screen)" />
      <rect x="518" y="146" width="12" height="16" fill="#fff0a8" />
      <rect x="514" y="139" width="8" height="10" fill="#fff0a8" />
      <rect x="528" y="139" width="8" height="10" fill="#fff0a8" />
      <rect x="523" y="151" width="3" height="3" fill="#35234a" />
      <path d="M551 159h15v4h-15zm24-10h15v4h-15zm24 8h15v4h-15z" fill="#fff2ad" />
      <rect x="493" y="178" width="149" height="8" fill="#71617f" />
      {decorations.map((decoration) => {
        const [x, y] = DECORATION_POSITIONS[decoration.slot];
        return (
          <g key={decoration.slot} transform={`translate(${x} ${y})`}>
            <title>{decoration.title}</title>
            {decoration.item_key === "lantern-arch" ? (
              <><rect x="0" y="0" width="22" height="5" fill="#ffe26b" /><rect x="3" y="5" width="4" height="15" fill="#ffb958" /><rect x="15" y="5" width="4" height="15" fill="#ffb958" /><rect x="8" y="7" width="6" height="8" fill="#fff2ad" /><rect x="10" y="15" width="2" height="3" fill="#ffd957" /></>
            ) : null}
            {decoration.item_key === "prize-fox" ? (
              <><rect x="3" y="7" width="16" height="13" fill="#ff9d55" /><rect x="2" y="2" width="6" height="8" fill="#ff9d55" /><rect x="14" y="2" width="6" height="8" fill="#ff9d55" /><rect x="6" y="12" width="3" height="3" fill="#322244" /><rect x="13" y="12" width="3" height="3" fill="#322244" /><rect x="9" y="17" width="5" height="3" fill="#ffe0a0" /></>
            ) : null}
            {decoration.item_key === "star-bunting" ? (
              <><path d="M0 3h23v3H0z" fill="#ff70b9" /><path d="m5 6 4 0-2 6zm7 0h4l-2 6zm7 0h4l-2 6z" fill="#ffe26b" /></>
            ) : null}
            {decoration.item_key === "flower-pot" ? (
              <><rect x="6" y="12" width="14" height="8" fill="#de795d" /><rect x="4" y="10" width="18" height="3" fill="#f3b65e" /><rect x="9" y="5" width="3" height="6" fill="#69c980" /><rect x="14" y="4" width="3" height="7" fill="#69c980" /><rect x="8" y="2" width="5" height="5" fill="#ffe26b" /><rect x="14" y="1" width="5" height="5" fill="#f87fb6" /></>
            ) : null}
            {decoration.item_key === "neon-puddle" ? (
              <><path d="M0 11h22v5H0zm4-5h13v4H4z" fill="#65f1ec" /><rect x="4" y="18" width="5" height="2" fill="#a881ff" /><rect x="16" y="18" width="4" height="2" fill="#a881ff" /></>
            ) : null}
          </g>
        );
      })}
      <text x="570" y="218" fill="#b8dcd5" fontFamily="monospace" fontSize="10" textAnchor="middle">{chapter.toUpperCase()}</text>
    </svg>
  );
}
