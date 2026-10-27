/**
 * Qué hacer con cada novedad del reporte de importación.
 * El texto de la novedad lo escribe el servicio de importación; aquí solo se agrega la siguiente acción.
 */
export function importRowAdvice(reason: string): string {
  const text = reason.toLowerCase();
  if (text.includes("ya existe en la base")) {
    return "Esa persona ya está registrada. Quita la fila del archivo. Si hay que cambiar sus datos, búscala en el Resumen y edítala desde su ficha.";
  }
  if (text.includes("duplicad") && text.includes("en el archivo")) {
    return "Aparece más de una vez en el archivo. Deja una sola fila y vuelve a cargarlo.";
  }
  if (text.includes("cédula inválida") || text.includes("número de cédula no es válido") || text.includes("documento")) {
    return "Revisa los dígitos en el archivo. Una cédula tiene 10 números; un pasaporte se escribe sin espacios ni guiones.";
  }
  if (text.includes("faltaban nombres")) {
    return "No hace falta corregirla. Completa los nombres desde la ficha cuando quieras.";
  }
  if (text.includes("correo no tiene un formato válido")) {
    return "La persona sí se importa, pero sin correo. Corrígelo en el archivo si quieres guardarlo.";
  }
  if (text.includes("correo ya importado")) {
    return "Ese correo ya estaba en la lista. Quita la fila repetida si quieres evitar confusiones.";
  }
  return "Revisa esta fila en el archivo y vuelve a cargarlo.";
}
