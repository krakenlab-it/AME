import { digitsOnly } from "./sanitize";

export interface PhoneCheck {
  ok: boolean;
  e164?: string;
  message?: string;
}

/**
 * Valida y normaliza a formato E.164.
 * Ecuador (+593): celular de 9 dígitos que empieza en 9 (se acepta el 0 inicial: 099…).
 */
export function normalizePhone(countryCode: string, number: string): PhoneCheck {
  if (!/^\+\d{1,3}$/.test(countryCode)) return { ok: false, message: "Selecciona el código de país." };
  let national = digitsOnly(number);
  if (countryCode === "+593") {
    if (national.startsWith("593")) national = national.slice(3);
    if (national.startsWith("0")) national = national.slice(1);
    if (!/^9\d{8}$/.test(national)) {
      return { ok: false, message: "Ingresa un celular ecuatoriano válido, por ejemplo 099 123 4567." };
    }
  } else if (national.length < 6 || national.length > 14) {
    return { ok: false, message: "Ingresa un número de teléfono válido." };
  }
  const e164 = `${countryCode}${national}`;
  if (digitsOnly(e164).length > 15) return { ok: false, message: "El número es demasiado largo." };
  return { ok: true, e164 };
}
