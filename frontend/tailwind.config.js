/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        tv: {
          bg: "var(--tv-bg)",
          surface: "var(--tv-surface)",
          "surface-hover": "var(--tv-surface-hover)",
          border: "var(--tv-border)",
          "text-primary": "var(--tv-text-primary)",
          "text-secondary": "var(--tv-text-secondary)",
          "text-muted": "var(--tv-text-muted)",
          accent: "var(--tv-accent)",
          "accent-hover": "var(--tv-accent-hover)",
          "accent-text": "var(--tv-accent-text)",
          error: "var(--tv-error)",
          warning: "var(--tv-warning)",
          info: "var(--tv-info)",
          "nav-active-bg": "var(--tv-nav-active-bg)",
          "nav-active-text": "var(--tv-nav-active-text)",
        },
      },
      borderColor: {
        tv: {
          DEFAULT: "var(--tv-border)",
        },
      },
      fontFamily: {
        inter: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
