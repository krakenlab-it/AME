import { randomBytes } from "node:crypto";
import { RepoError } from "@/lib/database/types";
import { FingerprintImportError } from "./fingerprint-import";
import { ImportFileError } from "./import";

export const ALREADY_IMPORTED_EMAILS = "Algunos correos ya estaban importados; no se guardó nada.";

/** Traduce un fallo de importación. No registra datos de las personas. */
export function classifyImportFailure(err: unknown): { error: string } {
  if (err instanceof ImportFileError || err instanceof FingerprintImportError) return { error: err.message };
  if (err instanceof RepoError && err.pgCode === "23505") {
    console.error(`[import] ${err.message} code=23505`);
    return { error: ALREADY_IMPORTED_EMAILS };
  }
  const name = err instanceof Error ? err.name : "UnknownError";
  const message = err instanceof Error ? err.message : "";
  const stack = err instanceof Error ? err.stack ?? "" : "";
  const reference = randomBytes(3).toString("hex");
  console.error(`[import] ${reference} ${name}: ${message}\n${stack}`);
  return { error: `No se pudo procesar el archivo. Referencia: ${reference}` };
}
