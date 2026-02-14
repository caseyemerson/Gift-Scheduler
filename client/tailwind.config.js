/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f5ff',
          100: '#e0eaff',
          200: '#c2d5ff',
          300: '#93b4ff',
          400: '#6490ff',
          500: '#3b6cff',
          600: '#1a4fff',
          700: '#0039e6',
          800: '#002db8',
          900: '#002291',
        },
        accent: {
          50: '#fff5f0',
          100: '#ffe8db',
          200: '#ffd1b8',
          300: '#ffb088',
          400: '#ff8c57',
          500: '#ff6b2b',
          600: '#ff4d00',
          700: '#cc3d00',
          800: '#993000',
          900: '#662000',
        },
      },
    },
  },
  plugins: [],
};
