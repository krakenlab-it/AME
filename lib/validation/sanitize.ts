/**
 * Limpieza de entradas: normaliza Unicode, elimina caracteres de control,
 * colapsa espacios y recorta inicio/final. La salida se renderiza siempre
 * escapada por React y se guarda con consultas parametrizadas (sin SQL dinámico).
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g;

export function cleanText(value: string): string {
  return value.normalize("NFC").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

/** Aplica cleanText a todos los strings de un objeto plano (sin recorrer prototipos). */
export function sanitizeDeep<T>(input: T): T {
  if (typeof input === "string") return cleanText(input) as T;
  if (Array.isArray(input)) return input.map((v) => sanitizeDeep(v)) as T;
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      out[k] = sanitizeDeep(v);
    }
    return out as T;
  }
  return input;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
