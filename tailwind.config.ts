import type { Config } from "tailwindcss";

/**
 * Paleta con contraste verificado (ver tests/contrast.test.ts):
 * - ink-faint ≥ 4.5:1 sobre blanco (placeholders y texto auxiliar)
 * - field (borde de campos) ≥ 3:1 sobre blanco (WCAG 1.4.11)
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        marian: { DEFAULT: "#005289", deep: "#003A61", soft: "#E6EEF5", line: "#C9D8E6" },
        ink: { DEFAULT: "#13263A", muted: "#51627A", faint: "#5B6C82" },
        field: "#6F7F94",
        paper: "#FAFBFC",
        crown: { DEFAULT: "#B98A1E", deep: "#8A6410" },
        alert: { DEFAULT: "#B3261E", soft: "#FCEDEC" },
        ok: { DEFAULT: "#1E6B45", soft: "#E7F3EC" },
        warn: { DEFAULT: "#7A5500", soft: "#FBF5E6" },
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
