/**
 * Validación de formato de cédula ecuatoriana (persona natural).
 * - exactamente 10 dígitos numéricos
 * - provincia 01–24, o 30 (ecuatorianos registrados en el exterior)
 * - tercer dígito menor a 6
 * - dígito verificador (módulo 10, coeficientes 2-1-2-1…)
 *
 * IMPORTANTE: una cédula matemáticamente válida NO prueba la identidad de quien la escribe.
 */
export function normalizeCedula(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export function isValidCedula(input: string): boolean {
  const value = normalizeCedula(input);
  if (!/^\d{10}$/.test(value)) return false;

  const province = Number(value.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30)) return false;

  const third = Number(value[2]);
  if (third >= 6) return false;

  const digits = value.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let product = digits[i]! * (i % 2 === 0 ? 2 : 1);
    if (product > 9) product -= 9;
    sum += product;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === digits[9];
}
