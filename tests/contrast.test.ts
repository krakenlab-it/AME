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
const AA_NON_TEXT = 3;

describe("contraste de la paleta (WCAG 2.1 AA)", () => {
  const textOnWhite = ["ink", "ink.muted", "ink.faint", "marian", "marian.deep", "alert", "ok", "warn", "crown.deep"];
  it.each(textOnWhite)("texto %s sobre blanco llega a 4.5:1", (name) => {
    expect(ratio(token(name), WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("texto blanco sobre botones marian llega a 4.5:1", () => {
    expect(ratio(WHITE, token("marian"))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(WHITE, token("marian.deep"))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  const onSoft: [string, string][] = [
    ["ink", "marian.soft"],
    ["ink.muted", "marian.soft"],
    ["marian", "marian.soft"],
    ["alert", "alert.soft"],
    ["ok", "ok.soft"],
    ["warn", "warn.soft"],
    ["crown.deep", "warn.soft"],
    ["ink", "warn.soft"],
    ["marian.soft", "marian.deep"],
  ];
  it.each(onSoft)("texto %s sobre fondo %s llega a 4.5:1", (fg, bg) => {
    expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("el borde de los campos llega a 3:1 sobre blanco", () => {
    expect(ratio(token("field"), WHITE)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("el anillo de foco (marian) llega a 3:1 sobre blanco y sobre el papel", () => {
    expect(ratio(token("marian"), WHITE)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(ratio(token("marian"), token("paper"))).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});
