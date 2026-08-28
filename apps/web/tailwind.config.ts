import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // CSS variable driven — otomatik dark mode geçişi
        primary:         'rgb(var(--color-primary) / <alpha-value>)',
        muted:           'rgb(var(--color-muted) / <alpha-value>)',
        subtle:          'rgb(var(--color-subtle) / <alpha-value>)',
        accent:          'rgb(var(--color-accent) / <alpha-value>)',
        'accent-blue':   'rgb(var(--color-accent-blue) / <alpha-value>)',
        'accent-violet': 'rgb(var(--color-accent-violet) / <alpha-value>)',
        success:         'rgb(var(--color-success) / <alpha-value>)',
        warning:         'rgb(var(--color-warning) / <alpha-value>)',
        danger:          'rgb(var(--color-danger) / <alpha-value>)',
        background:      'rgb(var(--color-background) / <alpha-value>)',
        surface:         'rgb(var(--color-surface) / <alpha-value>)',
        border:          'rgb(var(--color-border) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      backdropBlur: {
        xs:    '2px',
        '3xl': '48px',
        '4xl': '64px',
      },
      boxShadow: {
        'glass':      '0 8px 32px rgba(99,102,241,0.08), 0 2px 8px rgba(15,23,42,0.05)',
        'glass-lg':   '0 16px 48px rgba(99,102,241,0.10), 0 4px 16px rgba(15,23,42,0.07)',
        'glass-glow': '0 0 0 1px rgba(99,102,241,0.15), 0 8px 32px rgba(99,102,241,0.12)',
        'inner-top':  'inset 0 1px 0 rgba(255,255,255,1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
