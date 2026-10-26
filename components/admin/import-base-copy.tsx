export function ImportBaseCopy() {
  return (
    <p className="text-[15px] text-ink-muted">
      Suba un archivo .csv o .xlsx (máximo 5 MB). Una fila se acepta con cédula o pasaporte, o solo con un correo o un teléfono.
      Si trae cédula, se crea la ficha. Si solo trae correo, queda en la lista de correos: la persona entra por <strong>/ingresar</strong>, escribe su cédula y su código dactilar, y no espera una aprobación.
      Un teléfono sin correo también se guarda en esa lista. Si faltan nombres, la fila se acepta igual.
      La plantilla de personas usa Nombres, Apellidos y Cédula. También valen Correo, Teléfono y Comunidad.
      ¿Necesita un modelo? Descargue la <a className="font-semibold text-marian underline underline-offset-2" href="/templates/initial_people.csv" download>plantilla de ejemplo</a>.
    </p>
  );
}
