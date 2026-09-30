/** Construye una cédula con dígito verificador válido a partir de 9 dígitos (solo para pruebas). */
export function makeCedula(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let p = Number(first9[i]) * (i % 2 === 0 ? 2 : 1);
    if (p > 9) p -= 9;
    sum += p;
  }
  return `${first9}${(10 - (sum % 10)) % 10}`;
}
