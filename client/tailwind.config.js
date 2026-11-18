/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Deep navy (primary / sidebar)
        navy: {
          50: '#eef1f9', 100: '#d8def0', 200: '#b1bde1', 300: '#8091c9', 400: '#4f63ad',
          500: '#2f4593', 600: '#1f3480', 700: '#16286c', 800: '#0f1f5a', 900: '#0b1849', 950: '#070f33',
        },
        // Royal blue (actions / links)
        royal: {
          50: '#eef3ff', 100: '#dde7ff', 200: '#bccfff', 300: '#8eacff', 400: '#5b80f5',
          500: '#3a5fe6', 600: '#1f43c9', 700: '#1733a3', 800: '#162d84', 900: '#16296b',
        },
        // Reliance brand red
        brand: { red: '#e31b23', 'red-dark': '#c2141b', 'red-soft': '#fdecec' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 31, 90, 0.04), 0 4px 16px rgba(15, 31, 90, 0.06)',
        'card-hover': '0 2px 4px rgba(15, 31, 90, 0.06), 0 10px 28px rgba(15, 31, 90, 0.10)',
      },
      borderRadius: { xl2: '1.125rem' },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in .25s ease-out' },
    },
  },
  plugins: [],
};
