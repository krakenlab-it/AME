import { isValidCedula } from "./cedula";

/**
 * Documento de identidad para importar y para el paso de identificación.
 *
 * Cédula ecuatoriana: 10 dígitos (un valor de 9 dígitos recupera el cero
 * que Excel a veces elimina) y el verificador de provincia y módulo 10.
 *
 * Pasaporte u otro documento extranjero, cuando no es una cédula: de 6 a 12
 * caracteres, 1 a 3 letras y después solo dígitos. Ejemplos: BH823158, BA086520.
 * Se guarda en mayúsculas, sin espacios ni guiones.
 */
export const FOREIGN_DOCUMENT_MIN_LENGTH = 6;
export const FOREIGN_DOCUMENT_MAX_LENGTH = 12;

const FOREIGN_DOCUMENT_RE = /^[A-Z]{1,3}\d{4,11}$/;

const IMPORT_CEDULA_MESSAGE = "Cédula inválida: debe tener 10 dígitos y ser una cédula ecuatoriana";
const IMPORT_FOREIGN_MESSAGE =
  "Documento no válido. La cédula ecuatoriana tiene 10 números. Un pasaporte lleva de 6 a 12 caracteres: 1 a 3 letras y después solo números.";

export function normalizeDocument(input: string): string {
  return input.trim().replace(/[\s-]/g, "").toUpperCase();
}

export type NationalIdAssessment =
  | { ok: true; kind: "cedula" | "foreign"; value: string }
  | { ok: false; value: string; message: string };

export function isForeignDocument(input: string): boolean {
  const value = normalizeDocument(input);
  return value.length >= FOREIGN_DOCUMENT_MIN_LENGTH && value.length <= FOREIGN_DOCUMENT_MAX_LENGTH && FOREIGN_DOCUMENT_RE.test(value);
}

/** Clasifica el documento ya normalizado, con el cero inicial de Excel si aplica. */
export function assessNationalId(input: string): NationalIdAssessment {
  let value = normalizeDocument(input);
  if (/^\d{9}$/.test(value)) value = `0${value}`;

  if (value.length > 0 && /^\d+$/.test(value)) {
    if (isValidCedula(value)) return { ok: true, kind: "cedula", value };
    return { ok: false, value, message: IMPORT_CEDULA_MESSAGE };
  }

  if (isForeignDocument(value)) return { ok: true, kind: "foreign", value };
  return { ok: false, value, message: IMPORT_FOREIGN_MESSAGE };
}

/** Mensaje del paso de identificación. Null si el documento se puede comparar con el hash guardado. */
export function identityDocumentMessage(input: string): string | null {
  const assessed = assessNationalId(input);
  if (assessed.ok) return null;
  if (assessed.value.length > 0 && /^\d+$/.test(assessed.value)) {
    if (!/^\d{10}$/.test(assessed.value)) return "La cédula debe tener exactamente 10 números.";
    return "El número de cédula no es válido. Revisa los dígitos.";
  }
  return "Revisa el documento. La cédula tiene 10 números. El pasaporte usa letras y números, como en el documento.";
}
