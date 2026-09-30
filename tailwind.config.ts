import type { Config } from "tailwindcss";

/**
 * Paleta original del portal. El texto corrido usa ink e ink-muted (pasan AA sobre blanco).
 * ink-faint es el gris suave de placeholders y bordes; crown es el oro del logo, no un color de texto.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        marian: { DEFAULT: "#005289", deep: "#003A61", soft: "#E6EEF5", line: "#C9D8E6" },
        ink: { DEFAULT: "#13263A", muted: "#51627A", faint: "#8595A8" },
        paper: "#FAFBFC",
        crown: "#B98A1E",
        alert: { DEFAULT: "#B3261E", soft: "#FCEDEC" },
        ok: { DEFAULT: "#1E6B45", soft: "#E7F3EC" },
        warn: { soft: "#FBF5E6" },
      },
      fontFamily: {
        serif: ["Literata", "Georgia", "serif"],
        sans: ["Figtree", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: { sheet: "20px" },
    },
  },
  plugins: [],
};
export default config;
