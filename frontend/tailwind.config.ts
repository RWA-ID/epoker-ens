import type { Config } from 'tailwindcss';
import { TILT_QUERY } from './lib/tilt-query';

/**
 * HoodPoker design tokens — values taken verbatim from the design handoff
 * (design_handoff_hoodpoker_landing/README.md § Design Tokens). Do not
 * "tidy" these hexes; the neutrals are deliberately near-black and slightly
 * warm rather than pure grey.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    screens: {
      // Spec: the leaderboard's 44/1fr/92/84 grid is the tightest element;
      // the Hands column is hidden below this.
      xs: '420px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      // "Tilt mode": a phone held sideways. Declared LAST so its utilities
      // come after sm/md in the CSS and win — a landscape phone is 700–930px
      // wide, which would otherwise pick up desktop-sized seats.
      tilt: { raw: TILT_QUERY },
    },
    extend: {
      colors: {
        acid: {
          DEFAULT: '#ccff00',
          400: '#ccff00', // primary accent
          hover: '#e0ff4d', // solid-button hover fill
          link: '#e6ff66', // a:hover
        },
        ink: '#0a0a06', // text ON accent surfaces
        night: {
          950: '#050505', // page background
          900: '#080805', // cards, panels, rows
          850: '#0d0e0a', // surface gradient top
          800: '#12140c', // surface gradient hover top
        },
        cream: '#f2f2f0', // primary text
        muted: '#a8ada0', // body copy
        dim: '#8b8f84', // nav links, inactive chips
        faint: '#7e8277', // mono metadata, labels
        ghost: '#4f5349', // footer headings, ranks 4+
      },
      fontFamily: {
        display: ['var(--font-display)', 'Archivo', 'system-ui', 'sans-serif'],
        sans: ['var(--font-display)', 'Archivo', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      maxWidth: {
        shell: '1180px',
        faq: '860px',
      },
      borderRadius: {
        btn: '6px',
        cta: '7px',
        faq: '10px',
        card: '12px',
      },
      boxShadow: {
        cta: '0 10px 40px rgba(204,255,0,0.28)',
        header: '0 0 24px rgba(204,255,0,0.45)',
      },
      keyframes: {
        hpMarquee: {
          from: { transform: 'translateX(0)' },
          // half the container PLUS half the 34px gap — see the ticker note.
          to: { transform: 'translateX(calc(-50% - 17px))' },
        },
        hpPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(204,255,0,0.7)' },
          '50%': { boxShadow: '0 0 0 7px rgba(204,255,0,0)' },
        },
        hpRise: {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        dealIn: {
          '0%': { opacity: '0', transform: 'translateY(-12px) scale(0.9)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        marquee: 'hpMarquee 26s linear infinite',
        pulse: 'hpPulse 1.6s infinite',
        rise: 'hpRise 0.6s ease-out both',
        dealIn: 'dealIn 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
