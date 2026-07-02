import type { Config } from 'tailwindcss';

/**
 * ENS Hold'em design tokens.
 * Palette follows the ENS brand: primary blue #5298FF / #0080BC family,
 * deep navy felt, gold accents matching the "ENS High Roller Table" art.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ens: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#bcdcff',
          300: '#8ec6ff',
          400: '#5298ff', // ENS primary blue
          500: '#3888ff',
          600: '#2071f5',
          700: '#185ce1',
          800: '#1b4bb6',
          900: '#1c418f',
          950: '#162a57',
        },
        felt: {
          DEFAULT: '#12306b', // table felt blue
          dark: '#0b1f4a',
          rim: '#0a0f1e', // leather rail
        },
        gold: {
          300: '#f0d693',
          400: '#e3bd6d',
          500: '#c9a24e', // brass/gold accents from the table art
          600: '#a67f35',
        },
        night: {
          800: '#101528',
          900: '#0a0e1d',
          950: '#060912',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(82, 152, 255, 0.35)',
        gold: '0 0 18px rgba(201, 162, 78, 0.4)',
      },
      keyframes: {
        dealIn: {
          '0%': { opacity: '0', transform: 'translateY(-12px) scale(0.9)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        pulseRing: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(82,152,255,0.6)' },
          '50%': { boxShadow: '0 0 0 6px rgba(82,152,255,0)' },
        },
      },
      animation: {
        dealIn: 'dealIn 0.3s ease-out both',
        pulseRing: 'pulseRing 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
