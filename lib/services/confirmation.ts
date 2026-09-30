import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // sin 0/O, 1/I/L, U

/** AIG-XXXXXXXX — aleatorio, sin relación con la cédula ni con el ID interno. */
export function generateConfirmationCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `AIG-${code}`;
}

export function isConfirmationCode(value: string): boolean {
  return /^AIG-[A-HJKMNP-TV-Z2-9]{8}$/.test(value);
}
