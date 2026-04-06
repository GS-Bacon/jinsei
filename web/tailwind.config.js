/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Scrapboxに近いカラーパレット
        "wiki-link": "#4a9eff",
        "wiki-link-new": "#ff6b35",
        "wiki-tag": "#7c3aed",
      },
    },
  },
  plugins: [],
};
