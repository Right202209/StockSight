/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Inter Tight"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        paper: {
          50: '#FAF6EE',
          100: '#F4EFE6',
          200: '#EBE4D6',
          300: '#DDD3BE',
        },
        ink: {
          50: '#F0EBE0',
          100: '#C8C2B6',
          200: '#8A8478',
          300: '#5C5750',
          400: '#3A3631',
          500: '#1A1A18',
          600: '#0E0E0C',
        },
        oxblood: {
          400: '#A8413D',
          500: '#7A1F1F',
          600: '#5C1414',
        },
        forest: {
          400: '#3A8056',
          500: '#1F5C3E',
          600: '#143F2A',
        },
        gold: {
          400: '#C19E47',
          500: '#A6802C',
          600: '#7D5F1F',
        },
      },
      fontFeatureSettings: {
        tabular: '"tnum" 1, "lnum" 1',
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'fade-in': 'fade-in 0.4s ease both',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
