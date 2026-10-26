import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { isValidCedula } from "../../lib/validation/cedula";

function fakeMobile(seed: number): string {
  for (let n = seed; ; n += 1) {
    const candidate = `09${8 + (n % 2)}${String(1_000_000 + (n * 7919) % 10_000_000).padStart(7, "0").slice(-7)}`;
    if (!isValidCedula(candidate)) return candidate;
  }
}

const phones = Array.from({ length: 22 }, (_, index) => fakeMobile(index + 3));
phones.splice(3, 0, phones[0]!);

const rows = phones.map((phone, index) => {
  const withEmail = index < 14;
  const namedAside = index < 16;
  return {
    phone,
    responsable: namedAside ? "Pastoral" : `PEREZ LOPEZ PERSONA${index} ANDRES`,
    comunidad: `Comunidad ${index % 4}`,
    seguro: withEmail ? "AIG" : "",
    email: withEmail ? `persona${index}@fmsnor.org` : "",
    aside: namedAside ? `ANDRADE MORA NOMBRE${index} ELENA` : "",
  };
});

async function main() {
  const wb = new ExcelJS.Workbook();
  const hoja1 = wb.addWorksheet("Hoja1");
  hoja1.mergeCells("A1:C1");
  hoja1.getCell("A1").value = "LISTADO INTERNO";
  ["TELÉFONO", "RESPONSABLE", "COMUNIDAD", "SEGURO", "CORREO"].forEach((header, column) => {
    hoja1.getCell(2, column + 1).value = header;
  });
  rows.forEach((row, index) => {
    const line = hoja1.getRow(index + 3);
    line.getCell(1).value = row.phone;
    line.getCell(2).value = row.responsable;
    line.getCell(3).value = row.comunidad;
    if (row.seguro) line.getCell(4).value = row.seguro;
    if (row.email) line.getCell(5).value = row.email;
    if (index === 0) line.getCell(6).value = "Nota interna, no es un nombre";
    if (row.aside) line.getCell(7).value = row.aside;
  });

  const hoja2 = wb.addWorksheet("Hoja2");
  hoja2.getRow(4).getCell(2).value = "RESPONSABLE";
  hoja2.getRow(4).getCell(3).value = "COMUNIDAD";
  hoja2.getRow(4).getCell(4).value = "CORREO";
  hoja2.getRow(4).getCell(5).value = "TELÉFONO";
  rows.slice(0, 14).forEach((row, index) => {
    const line = hoja2.getRow(index + 5);
    line.getCell(2).value = row.responsable;
    line.getCell(3).value = row.comunidad;
    line.getCell(4).value = row.email;
    line.getCell(5).value = row.phone;
  });

  const target = join(dirname(fileURLToPath(import.meta.url)), "import-email-phone-list.xlsx");
  writeFileSync(target, Buffer.from(await wb.xlsx.writeBuffer()));
}

void main();
