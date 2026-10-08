/** Código dactilar de la cédula ecuatoriana: letra + 4 dígitos + letra + 4 dígitos. */
export const FINGERPRINT_CODE_RE = /^[A-Z]\d{4}[A-Z]\d{4}$/;

/** Quita espacios y guiones, y pasa a mayúsculas. No valida el formato. */
export function normalizeFingerprintCode(raw: string): string {
  return raw.trim().replace(/[\s-]/g, "").toUpperCase();
}

export function isFingerprintCode(value: string): boolean {
  return FINGERPRINT_CODE_RE.test(normalizeFingerprintCode(value));
}
