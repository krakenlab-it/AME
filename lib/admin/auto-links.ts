import type { CedulaLinkMatch } from "@/lib/database/types";

const MATCH_LABELS: Record<CedulaLinkMatch, string> = {
  dactilar_first_use: "Primera vez: se guardó el código dactilar",
  dactilar_match: "El código dactilar coincidió",
  preload: "Correo de la lista importada",
  new: "Persona nueva",
};

export function autoLinkMatchLabel(match: string): string {
  switch (match) {
    case "dactilar_first_use":
    case "dactilar_match":
    case "preload":
    case "new":
      return MATCH_LABELS[match];
    default:
      return "Vinculación automática";
  }
}

/** Inicio del día en Ecuador (America/Guayaquil, UTC−5, sin horario de verano). */
export function guayaquilDayStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return new Date(`${year}-${month}-${day}T00:00:00-05:00`).toISOString();
}
