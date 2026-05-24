import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['var(--font-pixel)', 'monospace'],
        display: ['var(--font-display)', 'sans-serif']
      },
      colors: {
        neon: {
          pink: '#ff39f8',
          blue: '#33d6ff',
          green: '#62ff7d',
          yellow: '#ffe066'
        }
      },
      boxShadow: {
        glow: '0 0 24px rgba(255, 57, 248, 0.6), 0 0 80px rgba(51, 214, 255, 0.35)'
      },
      keyframes: {
        flicker: {
          '0%, 19%, 22%, 62%, 64%, 70%, 100%': { opacity: '1' },
          '20%, 21%, 63%': { opacity: '0.6' }
        },
        scan: {
          '0%': { transform: 'translateY(-120%)' },
          '100%': { transform: 'translateY(120%)' }
        },
        glowpulse: {
          '0%, 100%': { filter: 'drop-shadow(0 0 6px rgba(255,57,248,0.6))' },
          '50%': { filter: 'drop-shadow(0 0 14px rgba(51,214,255,0.8))' }
        }
      },
      animation: {
        flicker: 'flicker 4s infinite',
        scan: 'scan 6s linear infinite',
        glowpulse: 'glowpulse 2.8s ease-in-out infinite'
      }
    }
  },
  plugins: []
};

export default config;
