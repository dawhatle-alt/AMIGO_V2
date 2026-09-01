import type { Config } from 'tailwindcss';

/**
 * Design tokens ported from the approved prototypes
 * (reference/prototypes/amigo-plan-AZAMA79.html, amigo-runbook-AZAMA79-v2.jsx).
 * PRD §6: IBM Plex Sans / Mono, blue primary #2563eb, red/amber/emerald risk
 * colors, card layout, dark terminal blocks (green on navy).
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          dark: '#1e40af',
          soft: '#eff6ff',
          border: '#bfdbfe',
        },
        // Agent chrome — violet, per the runbook prototype's advisor panel.
        agent: {
          DEFAULT: '#7c3aed',
          hover: '#6d28d9',
          soft: '#f5f3ff',
        },
        risk: {
          blocker: '#dc2626',
          warning: '#d97706',
          clear: '#059669',
        },
        terminal: {
          bg: '#1a1a2e',
          fg: '#4ade80',
        },
        canvas: '#f5f6f8',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};

export default config;
