import { keyedHash } from "@/lib/encryption/crypto";
import type { Repo } from "@/lib/database/types";
import { assessNationalId } from "@/lib/validation/document";

export type AdminLinkResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Vínculo manual de una cuenta propia (ingreso solo con correo) con la persona importada.
 * Usa la cédula que escribe el administrador o, si la deja vacía, la que pidió la persona al ingresar.
 * No rompe KAN-148: si la persona ya tiene otro correo de ingreso verificado, no se vincula.
 */
export async function linkUnlinkedAccount(repo: Repo, input: { accountId: string; cedula?: string; adminId: string }): Promise<AdminLinkResult> {
  if (!UUID.test(input.accountId)) return { ok: false, error: "Cuenta no válida." };
  const typed = (input.cedula ?? "").trim();
  let hash: string | null = null;
  if (typed) {
    const doc = assessNationalId(typed);
    if (!doc.ok) return { ok: false, error: "Revisa la cédula o el pasaporte." };
    hash = keyedHash(doc.value, "national_id");
  } else {
    const account = (await repo.listUnlinkedAccounts(500)).find((row) => row.id === input.accountId);
    if (!account) return { ok: false, error: "Esa cuenta ya no está pendiente." };
    hash = account.link_request_national_id_hash;
    if (!hash) return { ok: false, error: "La persona no escribió su cédula. Escríbela para vincular." };
  }
  const target = await repo.findGeneralAuthByNationalIdHash(hash);
  if (!target) return { ok: false, error: "No hay una persona importada con esa cédula." };
  const result = await repo.linkSelfAccount(input.accountId, target.id, input.adminId);
  switch (result) {
    case "linked":
      return { ok: true };
    case "account_missing":
      return { ok: false, error: "Esa cuenta ya no está pendiente." };
    case "person_missing":
      return { ok: false, error: "No hay una persona importada con esa cédula." };
    case "person_bound":
      return { ok: false, error: "Esa persona ya ingresa con otro correo verificado. Restablece su ingreso desde su ficha antes de vincular." };
  }
}
