/** Código dactilar de la cédula ecuatoriana: letra + 4 dígitos + letra + 4 dígitos. */
export const FINGERPRINT_CODE_RE = /^[A-Z]\d{4}[A-Z]\d{4}$/;

/** Texto único para la ayuda y el error. El pasaporte no usa este código. */
export const FINGERPRINT_FORMAT_MESSAGE = "Formato: letra, 4 números, letra, 4 números (ej. V1234V1234)";

/** Quita espacios y guiones, y pasa a mayúsculas. No valida el formato. */
export function normalizeFingerprintCode(raw: string): string {
  return raw.trim().replace(/[\s-]/g, "").toUpperCase();
}

export function isFingerprintCode(value: string): boolean {
  return FINGERPRINT_CODE_RE.test(normalizeFingerprintCode(value));
}
