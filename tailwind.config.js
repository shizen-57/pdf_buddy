/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: { extend: { fontFamily: { serif: ['Georgia', 'serif'] } } },
  plugins: []
}
