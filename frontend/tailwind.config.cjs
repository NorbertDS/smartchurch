/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        faith: {
          gold: '#d4af37',
          blue: '#1e3a8a',
          white: '#ffffff',
          purple: '#7c3aed',
        },
      },
    },
  },
  plugins: [],
};
