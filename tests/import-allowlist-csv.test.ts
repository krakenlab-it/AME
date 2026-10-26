import { describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { RepoError } from "@/lib/database/types";
import { FILE_UNREADABLE, HEADER_NOT_RECOGNIZED } from "@/lib/services/import-layout";
import { importPeople, parseImportFile } from "@/lib/services/import";
import { ALREADY_IMPORTED_EMAILS, classifyImportFailure } from "@/lib/services/import-failure";

function csvBuffer(text: string): ArrayBuffer {
  const bytes = Buffer.from(`\uFEFF${text}`, "utf8");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const LIST = [
  "Nombres,Apellidos,Correo,Teléfono,Comunidad",
  "Ana,Pérez,ana.lista@example.com,0991110001,Quito",
  "Luis,Mora,luis.lista@example.com,,Guayaquil",
  ",, ,0991110002,Cuenca",
].join("\n");

describe("csv de correos y teléfonos", () => {
  it("la vista previa y la confirmación aceptan filas sin cédula, y la segunda vez no las vuelve a insertar", async () => {
    const rows = await parseImportFile(csvBuffer(LIST), "lista.csv");
    const repo = new MemoryRepo();
    const preview = await importPeople(repo, { rows, filename: "lista.csv", adminId: "admin-1", allowPartial: false, dryRun: true });
    expect(preview.preview).toBe(true);
    expect(preview.committed).toBe(false);
    expect(preview.contacts).toBe(3);
    expect(preview.withEmail).toBe(2);
    expect(preview.rejected).toHaveLength(0);
    expect(repo.preloadedContacts).toHaveLength(0);

    const saved = await importPeople(repo, { rows, filename: "lista.csv", adminId: "admin-1", allowPartial: false });
    expect(saved.committed).toBe(true);
    expect(saved.contacts).toBe(3);
    expect(repo.preloadedContacts).toHaveLength(3);
    const before = repo.auditLog.filter((entry) => entry.action === "IMPORT_CREATED").length;

    const againPreview = await importPeople(repo, { rows, filename: "lista.csv", adminId: "admin-1", allowPartial: false, dryRun: true });
    expect(againPreview.committed).toBe(false);
    expect(againPreview.contacts).toBe(1);
    expect(againPreview.withEmail).toBe(0);
    expect(againPreview.notes.map((note) => note.text).sort()).toEqual([
      "Correo ya importado (fila 2)",
      "Correo ya importado (fila 3)",
    ]);

    const again = await importPeople(repo, { rows, filename: "lista.csv", adminId: "admin-1", allowPartial: false });
    expect(again.committed).toBe(true);
    expect(again.contacts).toBe(1);
    expect(again.withEmail).toBe(0);
    expect(again.notes.map((note) => note.text)).toEqual([
      "Correo ya importado (fila 2)",
      "Correo ya importado (fila 3)",
    ]);
    expect(repo.preloadedContacts.filter((contact) => contact.email)).toHaveLength(2);

    const onlyEmails = rows.filter((row) => row.outreach_email);
    const repeat = await importPeople(repo, { rows: onlyEmails, filename: "lista.csv", adminId: "admin-1", allowPartial: false });
    expect(repeat.committed).toBe(false);
    expect(repeat.noteBody).toBe("No hay contactos nuevos: todos ya importados.");
    expect(repo.auditLog.filter((entry) => entry.action === "IMPORT_CREATED")).toHaveLength(before + 1);
  });

  it("volver a insertar el mismo correo falla igual que el índice único", async () => {
    const repo = new MemoryRepo();
    await repo.insertPreloadedContacts([{ email: "ana@example.com", phone: null, firstNames: "Ana", lastNames: "Pérez", comunidad: null }], "lote", "admin-1");
    await expect(
      repo.insertPreloadedContacts([{ email: "ANA@example.com", phone: null, firstNames: "Ana", lastNames: "Pérez", comunidad: null }], "lote", "admin-1"),
    ).rejects.toMatchObject({ pgCode: "23505" });
  });

  it("un título desconocido y un archivo ilegible tienen mensaje propio", async () => {
    await expect(parseImportFile(csvBuffer("foo,bar\n1,2\n"), "malo.csv")).rejects.toThrow(HEADER_NOT_RECOGNIZED);
    const broken = Uint8Array.from([0xff, 0xfe, 0x41]);
    await expect(parseImportFile(broken.buffer as ArrayBuffer, "roto.csv")).rejects.toThrow(FILE_UNREADABLE);
  });

  it("un 23505 se explica y un error inesperado deja una referencia sin datos de personas", () => {
    const duplicate = new RepoError("UNKNOWN", "Error de base de datos (insertPreloadedContacts)", "23505");
    expect(classifyImportFailure(duplicate).error).toBe(ALREADY_IMPORTED_EMAILS);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unexpected = classifyImportFailure(new Error("fallo interno"));
    expect(unexpected.error).toMatch(/^No se pudo procesar el archivo\. Referencia: [0-9a-f]{6}$/);
    const logged = error.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("Error: fallo interno");
    expect(logged).toContain("fallo interno");
    expect(logged).not.toMatch(/@/);
    error.mockRestore();
  });
});
