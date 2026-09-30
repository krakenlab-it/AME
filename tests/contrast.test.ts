import { describe, expect, it } from "vitest";
import config from "@/tailwind.config";

type ColorTree = Record<string, string | Record<string, string>>;
const colors = config.theme?.extend?.colors as ColorTree;

function token(path: string): string {
  const [group = "", shade = "DEFAULT"] = path.split(".");
  const entry = colors[group];
  const value = typeof entry === "string" ? entry : entry?.[shade];
  if (!value) throw new Error(`Token sin definir: ${path}`);
  return value;
}

function luminance(hex: string): number {
  const channel = (start: number) => {
    const c = parseInt(hex.slice(start, start + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function ratio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const WHITE = "#FFFFFF";
const AA_TEXT = 4.5;

describe("paleta original del portal", () => {
  it("conserva los colores de fondo, línea y acento con los que nació el portal", () => {
    expect(token("paper")).toBe("#FAFBFC");
    expect(token("marian")).toBe("#005289");
    expect(token("marian.soft")).toBe("#E6EEF5");
    expect(token("marian.line")).toBe("#C9D8E6");
    expect(token("ink")).toBe("#13263A");
    expect(token("ink.muted")).toBe("#51627A");
    expect(token("ink.faint")).toBe("#8595A8");
    expect(token("crown")).toBe("#B98A1E");
    expect(token("warn.soft")).toBe("#FBF5E6");
  });

  const textOnWhite = ["ink", "ink.muted", "marian", "marian.deep", "alert", "ok"];
  it.each(textOnWhite)("el texto %s sobre blanco llega a 4.5:1", (name) => {
    expect(ratio(token(name), WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("el texto blanco sobre el botón marian llega a 4.5:1", () => {
    expect(ratio(WHITE, token("marian"))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  const onSoft: [string, string][] = [
    ["ink", "marian.soft"],
    ["ink.muted", "marian.soft"],
    ["marian", "marian.soft"],
    ["ink", "warn.soft"],
    ["alert", "alert.soft"],
    ["ok", "ok.soft"],
  ];
  it.each(onSoft)("el texto %s sobre el fondo %s llega a 4.5:1", (fg, bg) => {
    expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
