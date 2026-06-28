/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0b',
          elev: '#111114',
          card: '#15151a',
          hover: '#1c1c22',
          border: '#26262e',
        },
        accent: {
          DEFAULT: '#c9a44c',
          dim: '#8a7234',
          hot: '#e63946',
          cool: '#4ea1d3',
          green: '#3fb950',
          red: '#f85149',
        },
        text: {
          DEFAULT: '#e6e6e6',
          dim: '#9b9ba1',
          mute: '#6b6b73',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
