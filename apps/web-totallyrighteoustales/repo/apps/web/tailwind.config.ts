import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        parchment: "#f4e8d5",
        ink: "#1d1411",
        ember: "#c54c31",
        moss: "#2b594d",
        dusk: "#180f14",
        gold: "#f0b34d",
        blush: "#f3c5a0",
        tide: "#164e5c",
        sky: "#86cfd4",
        mist: "#dde8e1",
        cream: "#fff7ed",
        citrus: "#e98a2d",
        berry: "#9e3340",
        "press-ink": "#15120f",
        "press-paper": "#f8f1df",
        "press-bone": "#efe3c7",
        "press-copper": "#c7472b",
        "press-gold": "#d8a23f",
        "press-green": "#2f7d73",
        "press-blue": "#315f8d",
        "press-plum": "#4a2d55",
      },
      boxShadow: {
        soft: "0 24px 72px rgba(11, 5, 6, 0.24)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.38)",
        marquee: "0 36px 110px rgba(0, 0, 0, 0.32)",
      },
      borderRadius: {
        xl: "1.25rem",
      },
      backgroundImage: {
        glow: "radial-gradient(circle at top, rgba(240,179,77,0.35), transparent 55%)",
        scroll:
          "linear-gradient(140deg, rgba(255,247,237,0.98), rgba(244,232,213,0.92))",
        story:
          "linear-gradient(135deg, rgba(255,220,168,1) 0%, rgba(243,139,92,0.96) 48%, rgba(125,208,203,0.92) 100%)",
        hush: "linear-gradient(145deg, rgba(255,249,242,0.95), rgba(243,229,208,0.88))",
      },
      fontFamily: {
        display: [
          "Fraunces",
          "Bookman Old Style",
          "Iowan Old Style",
          "Baskerville",
          "Georgia",
          "serif",
        ],
        body: ["Inter", "Avenir Next", "Optima", "Trebuchet MS", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "Consolas", "monospace"],
      },
      keyframes: {
        floaty: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
        shimmer: "shimmer 8s ease infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
