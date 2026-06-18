import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050816',
        panel: 'rgba(255,255,255,0.05)',
      },
      boxShadow: {
        glow: '0 0 60px rgba(34,211,238,0.18)',
        'glow-sm': '0 0 20px rgba(34,211,238,0.14)',
        'glow-violet': '0 0 40px rgba(167,139,250,0.18)',
        'glow-emerald': '0 0 40px rgba(52,211,153,0.16)',
        'glow-amber': '0 0 40px rgba(251,191,36,0.16)',
      },
      animation: {
        'spin-slow': 'spin 16s linear infinite',
        'spin-reverse-slow': 'spin 22s linear infinite reverse',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        scanline: 'scanline 6s linear infinite',
      },
      backgroundImage: {
        'grid-subtle':
          'linear-gradient(rgba(255,255,255,0.06) 1px,transparent 1px), linear-gradient(90deg,rgba(255,255,255,0.06) 1px,transparent 1px)',
        'radial-glow':
          'radial-gradient(circle, rgba(34,211,238,0.15) 0%, transparent 70%)',
      },
      backgroundSize: {
        grid: '44px 44px',
      },
    },
  },
  plugins: [],
} satisfies Config;
