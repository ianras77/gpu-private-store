import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0A0C10",
          900: "#0F1218",
          800: "#161A23",
          700: "#1E2431",
          600: "#2A3244",
          500: "#3B455D",
          400: "#56627D",
          300: "#7885A3",
          200: "#A3AEC4",
          100: "#D5DBE7",
          50: "#EEF1F6"
        },
        glow: {
          500: "#4EF0C7",
          400: "#79F6D8",
          300: "#B2FFE9"
        },
        ember: {
          500: "#FF7A59",
          400: "#FF9A7D",
          300: "#FFC0A8"
        }
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui"]
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(79, 240, 199, 0.25), 0 10px 40px rgba(79, 240, 199, 0.2)",
        ember: "0 0 0 1px rgba(255, 122, 89, 0.2), 0 12px 30px rgba(255, 122, 89, 0.25)"
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
        "hero-radial":
          "radial-gradient(1200px 600px at 10% 10%, rgba(79, 240, 199, 0.15), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(255, 122, 89, 0.12), transparent 60%)"
      }
    }
  },
  plugins: []
};

export default config;
