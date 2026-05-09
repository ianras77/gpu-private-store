import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "jm-bg": "var(--jm-bg)",
        "jm-panel": "var(--jm-panel)",
        "jm-surface": "var(--jm-surface)",
        "jm-text": "var(--jm-text)",
        "jm-muted": "var(--jm-muted)",
        "jm-cyan": "var(--jm-cyan)",
        "jm-magenta": "var(--jm-magenta)",
        "jm-acid": "var(--jm-acid)",
        "jm-amber": "var(--jm-amber)",
        "jm-ink": "var(--jm-ink)",
        neon: {
          pink: "#ff39f8",
          blue: "#33d6ff",
          green: "#62ff7d",
          yellow: "#ffe066"
        }
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        pixel: ["var(--font-pixel)", "monospace"]
      },
      boxShadow: {
        neon: "0 0 20px rgba(61,245,255,0.25)",
        magenta: "0 0 24px rgba(255,63,165,0.25)",
        glow: "0 0 30px rgba(167,255,61,0.25)"
      },
      keyframes: {
        flicker: {
          "0%, 19%, 22%, 62%, 64%, 70%, 100%": { opacity: "1" },
          "20%, 21%, 63%": { opacity: "0.6" }
        },
        scan: {
          "0%": { transform: "translateY(-120%)" },
          "100%": { transform: "translateY(120%)" }
        },
        glowpulse: {
          "0%, 100%": { filter: "drop-shadow(0 0 6px rgba(255,57,248,0.6))" },
          "50%": { filter: "drop-shadow(0 0 14px rgba(51,214,255,0.8))" }
        }
      },
      animation: {
        flicker: "flicker 4s infinite",
        scan: "scan 6s linear infinite",
        glowpulse: "glowpulse 2.8s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
