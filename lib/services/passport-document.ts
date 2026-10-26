import { decrypt } from "@/lib/encryption/crypto";
import { assessNationalId } from "@/lib/validation/document";

/** El código dactilar solo está en la cédula. Un pasaporte guardado no lo pide. */
export function storedDocumentIsPassport(nationalIdEncrypted: string | null | undefined): boolean {
  if (!nationalIdEncrypted) return false;
  try {
    const assessed = assessNationalId(decrypt(nationalIdEncrypted));
    return assessed.ok && assessed.kind === "foreign";
  } catch {
    return false;
  }
}
