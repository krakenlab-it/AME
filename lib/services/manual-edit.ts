import type { AdminRepo, ManualPersonPatch } from "@/lib/database/types";
import { cleanText } from "@/lib/validation/sanitize";
import { looksLikeEmail } from "./import-layout";

const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;

export interface ManualEditDraft {
  firstNames: string;
  lastNames: string;
  outreachEmail: string;
  contact: ManualPersonPatch["contact"];
}

export type ManualEditResult =
  | { ok: true; changed: string[] }
  | { ok: false; error: string };

function cleanName(value: string, label: string): string | { error: string } {
  const text = cleanText(value);
  if (text.length < 2 || text.length > 80 || !NAME_RE.test(text)) {
    return { error: `${label} debe tener entre 2 y 80 letras.` };
  }
  return text;
}

function optionalEmail(value: string, label: string): string | null | { error: string } {
  const text = cleanText(value).toLowerCase();
  if (!text) return null;
  if (!looksLikeEmail(text) || text.length > 254) return { error: `${label} no es un correo válido.` };
  return text;
}

/** Valida el formulario antes de pedir el código. No escribe nada. */
export function parseManualEdit(input: ManualEditDraft): { ok: true; patch: ManualPersonPatch } | { ok: false; error: string } {
  const first = cleanName(input.firstNames, "Los nombres");
  if (typeof first !== "string") return { ok: false, error: first.error };
  const last = cleanName(input.lastNames, "Los apellidos");
  if (typeof last !== "string") return { ok: false, error: last.error };
  const outreach = optionalEmail(input.outreachEmail, "El correo para el enlace");
  if (outreach && typeof outreach !== "string") return { ok: false, error: outreach.error };

  let contact = input.contact;
  if (contact) {
    const primary = optionalEmail(contact.primary_email, "El correo principal");
    if (!primary || typeof primary !== "string") return { ok: false, error: "El correo principal es obligatorio y debe ser válido." };
    const secondary = optionalEmail(contact.secondary_email ?? "", "El correo alternativo");
    if (secondary && typeof secondary !== "string") return { ok: false, error: secondary.error };
    if (secondary && secondary === primary) return { ok: false, error: "El correo alternativo debe ser distinto al principal." };
    const phone = cleanText(contact.mobile_phone);
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return { ok: false, error: "El celular debe estar en formato internacional, por ejemplo +593991234567." };
    const address = cleanText(contact.address_line_1);
    const city = cleanText(contact.city);
    const province = cleanText(contact.province);
    const country = cleanText(contact.country || "Ecuador");
    if (address.length < 2 || city.length < 2 || province.length < 2 || country.length < 2) {
      return { ok: false, error: "Completa dirección, ciudad, provincia y país." };
    }
    contact = {
      primary_email: primary,
      secondary_email: secondary,
      mobile_phone: phone,
      address_line_1: address,
      address_line_2: cleanText(contact.address_line_2 ?? "") || null,
      city,
      province,
      country,
      postal_code: cleanText(contact.postal_code ?? "") || null,
    };
  }

  return { ok: true, patch: { first_names: first, last_names: last, outreach_email: outreach, contact } };
}

/**
 * Aplica un cambio manual solo si el administrador acaba de confirmar su TOTP.
 * La auditoría guarda quién y qué campos, nunca los valores.
 */
export async function applyManualPersonEdit(
  repo: AdminRepo,
  input: { personId: string; adminId: string; patch: ManualPersonPatch; mfaConfirmed: boolean },
): Promise<ManualEditResult> {
  if (!input.mfaConfirmed) return { ok: false, error: "Confirma el código de tu aplicación autenticadora para guardar el cambio." };
  const result = await repo.applyManualEdit(input.personId, input.patch);
  if (!result) return { ok: false, error: "No encontramos a esa persona." };
  if (result.changed.length === 0) return { ok: false, error: "No hay cambios para guardar." };
  await repo.audit({
    person_id: input.personId,
    actor_type: "admin",
    actor_id: input.adminId,
    action: "MANUAL_EDIT",
    changed_fields: result.changed,
    metadata: { mfa: "totp" },
  });
  return { ok: true, changed: result.changed };
}
