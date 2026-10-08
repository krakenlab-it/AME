"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { getRepo } from "@/lib/database";
import { adminForAction } from "@/lib/server/admin-guard";
import { hasPlaceholder } from "@/lib/privacy/placeholders";
import { ImportFileError, importPeople, parseImportFile, type ImportError, type ImportNote } from "@/lib/services/import";
import { FingerprintImportError, importFingerprintCodes, type FingerprintImportReport } from "@/lib/services/fingerprint-import";
import { resetPersonGeneralAuth } from "@/lib/services/general-link";
import { issueLinks, linksToCsv, regenerateLink, revokeLinks } from "@/lib/services/links";
import { isMemoryRepo } from "@/lib/database/memory-repo";
import {
  ensurePreviewOutreachAnchor,
  previewOutreachAnchorEnabled,
  previewOutreachCompletionUrl,
  PREVIEW_OUTREACH_SIMULATION_TO,
} from "@/lib/seed/preview-outreach-anchor";
import { deliverEmail, emailConfigured, personalLinkEmail } from "@/lib/services/email";
import { exportPersonalEntryLinks } from "@/lib/services/personal-links-export";
import { settings } from "@/lib/services/settings";
import { applyManualPersonEdit, parseManualEdit, type ManualEditDraft } from "@/lib/services/manual-edit";
import { reconfirmAdminTotp } from "@/lib/server/reconfirm-totp";
import { maskCedula } from "@/lib/security/masking";
import { decrypt } from "@/lib/encryption/crypto";
import { loadPreviewSandboxRepo, persistPreviewSandboxRepo } from "@/lib/demo/preview-sandbox-store";

const DENIED = "No tienes permiso para esta acción o tu sesión venció.";

export interface ImportState {
  error?: string;
  committed?: boolean;
  total?: number;
  imported?: number;
  rejected?: ImportError[];
  notes?: ImportNote[];
  linksCsv?: string | null;
  noteTitle?: string;
  noteBody?: string;
}

export async function importAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await adminForAction("people:import");
  if (!ctx) return { error: DENIED };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo .csv o .xlsx." };
  try {
    await loadPreviewSandboxRepo();
    const repo = getRepo();
    const rows = await parseImportFile(await file.arrayBuffer(), file.name);
    const out = await importPeople(repo, { rows, filename: file.name, adminId: ctx.admin.id, allowPartial: formData.get("allowPartial") === "on" });
    if (out.committed) await persistPreviewSandboxRepo(repo);
    revalidatePath("/admin");
    return out;
  } catch (err) {
    if (err instanceof ImportFileError) return { error: err.message };
    console.error("[import] error inesperado");
    return { error: "No se pudo procesar el archivo." };
  }
}

export async function issueMissingLinksAction(): Promise<{ error?: string; csv?: string; count?: number }> {
  const ctx = await adminForAction("links:manage");
  if (!ctx) return { error: DENIED };
  await loadPreviewSandboxRepo();
  const repo = getRepo();
  const ids = await repo.listPersonIdsWithoutActiveToken();
  if (!ids.length) return { count: 0 };
  const links = await issueLinks(repo, ids, ctx.admin.id);
  const rows = await Promise.all(
    links.map(async (l) => {
      const p = await repo.getPerson(l.person_id);
      let masked = "—";
      try { masked = p?.national_id_encrypted ? maskCedula(decrypt(p.national_id_encrypted)) : "—"; } catch { /* enmascarado por defecto */ }
      return { first_names: p?.first_names ?? "", last_names: p?.last_names ?? "", cedula_masked: masked, url: l.url, expires_at: l.expires_at };
    }),
  );
  await persistPreviewSandboxRepo(repo);
  return { csv: linksToCsv(rows), count: rows.length };
}

export async function generatePersonalLinksAction(): Promise<{ error?: string; count?: number; csv?: string | null }> {
  const ctx = await adminForAction("links:manage");
  if (!ctx) return { error: DENIED };
  await loadPreviewSandboxRepo();
  const repo = getRepo();
  const result = await exportPersonalEntryLinks(repo, ctx.admin.id);
  if (result.count) await persistPreviewSandboxRepo(repo);
  return { count: result.count, csv: result.csv };
}

export interface OutreachSimulationState {
  error?: string;
  sent?: boolean;
  url?: string;
  recipient?: string;
}

/** Preview: enlace fijo que abre el formulario público + envío real a yepezmancheno@gmail.com si hay Resend. */
export async function simulateOutreachLinkAction(): Promise<OutreachSimulationState> {
  const ctx = await adminForAction("links:manage");
  if (!ctx) return { error: DENIED };
  if (!previewOutreachAnchorEnabled()) return { error: "No disponible en este entorno." };
  await loadPreviewSandboxRepo();
  const repo = getRepo();
  if (!isMemoryRepo(repo)) return { error: "No disponible en este entorno." };
  ensurePreviewOutreachAnchor(repo);
  const url = previewOutreachCompletionUrl();
  const recipient = PREVIEW_OUTREACH_SIMULATION_TO;
  let sent = false;
  if (emailConfigured()) {
    const organization = process.env.ORGANIZATION_NAME?.trim() || "Agrupación Marista Ecuatoriana";
    const expiresAt = new Date(Date.now() + settings.tokenTtlDays() * 86_400_000).toISOString();
    const draft = personalLinkEmail({ firstName: "Persona", url, expiresAt, organization });
    sent = await deliverEmail({ ...draft, to: recipient });
  }
  await persistPreviewSandboxRepo(repo);
  return { sent, url, recipient };
}

export interface ManualEditState {
  error?: string;
  ok?: boolean;
}

export async function manualEditAction(_prev: ManualEditState, formData: FormData): Promise<ManualEditState> {
  const ctx = await adminForAction("people:edit");
  if (!ctx) return { error: DENIED };
  const personId = String(formData.get("personId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(personId)) return { error: "Registro no válido." };
  const hasContact = formData.get("hasContact") === "1";
  const draft: ManualEditDraft = {
    firstNames: String(formData.get("firstNames") ?? ""),
    lastNames: String(formData.get("lastNames") ?? ""),
    outreachEmail: String(formData.get("outreachEmail") ?? ""),
    contact: hasContact
      ? {
          primary_email: String(formData.get("primaryEmail") ?? ""),
          secondary_email: String(formData.get("secondaryEmail") ?? ""),
          mobile_phone: String(formData.get("mobilePhone") ?? ""),
          address_line_1: String(formData.get("addressLine1") ?? ""),
          address_line_2: String(formData.get("addressLine2") ?? ""),
          city: String(formData.get("city") ?? ""),
          province: String(formData.get("province") ?? ""),
          country: String(formData.get("country") ?? ""),
          postal_code: String(formData.get("postalCode") ?? ""),
        }
      : null,
  };
  const parsed = parseManualEdit(draft);
  if (!parsed.ok) return { error: parsed.error };
  const totp = await reconfirmAdminTotp(String(formData.get("totp") ?? ""));
  if (!totp.ok) return { error: totp.error };
  const saved = await applyManualPersonEdit(getRepo(), { personId, adminId: ctx.admin.id, patch: parsed.patch, mfaConfirmed: true });
  if (!saved.ok) return { error: saved.error };
  revalidatePath(`/admin/personas/${personId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function regenerateLinkAction(personId: string): Promise<{ error?: string; url?: string; expiresAt?: string }> {
  const ctx = await adminForAction("links:manage");
  if (!ctx) return { error: DENIED };
  if (!/^[0-9a-f-]{36}$/i.test(personId)) return { error: "Registro no válido." };
  const link = await regenerateLink(getRepo(), personId, ctx.admin.id);
  revalidatePath(`/admin/personas/${personId}`);
  return { url: link.url, expiresAt: link.expires_at };
}

export async function revokeLinksAction(personId: string): Promise<{ error?: string; revoked?: number }> {
  const ctx = await adminForAction("links:manage");
  if (!ctx) return { error: DENIED };
  if (!/^[0-9a-f-]{36}$/i.test(personId)) return { error: "Registro no válido." };
  const revoked = await revokeLinks(getRepo(), personId, ctx.admin.id);
  revalidatePath(`/admin/personas/${personId}`);
  return { revoked };
}

export async function markReviewedAction(personId: string): Promise<{ error?: string }> {
  const ctx = await adminForAction("people:review");
  if (!ctx) return { error: DENIED };
  if (!/^[0-9a-f-]{36}$/i.test(personId)) return { error: "Registro no válido." };
  const repo = getRepo();
  await repo.markReviewed(personId, ctx.admin.id);
  await repo.audit({ person_id: personId, actor_type: "admin", actor_id: ctx.admin.id, action: "RECORD_REVIEWED" });
  revalidatePath(`/admin/personas/${personId}`);
  return {};
}

export interface NoticeState {
  error?: string;
  ok?: boolean;
}

export async function publishNoticeAction(_prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const ctx = await adminForAction("notice:manage");
  if (!ctx) return { error: DENIED };
  const version = String(formData.get("version") ?? "").trim();
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  const effective = String(formData.get("effective_date") ?? "").trim();
  if (!/^[0-9A-Za-z.\-_]{1,20}$/.test(version)) return { error: "Versión no válida (ej.: 1.1)." };
  if (body.length < 200 || body.length > 20000) return { error: "El texto debe tener entre 200 y 20.000 caracteres." };
  if (effective && !/^\d{4}-\d{2}-\d{2}$/.test(effective)) return { error: "Fecha no válida." };
  const repo = getRepo();
  const existing = await repo.listNotices();
  if (existing.some((n) => n.version === version)) return { error: "Esa versión ya existe. Usa un número nuevo." };
  const warning = hasPlaceholder(body.replace(/\{\{\s*\w+\s*\}\}/g, ""));
  await repo.publishNotice({ version, body, body_hash: createHash("sha256").update(body).digest("hex"), effective_date: effective || null, created_by: ctx.admin.id });
  await repo.audit({ actor_type: "admin", actor_id: ctx.admin.id, action: "NOTICE_PUBLISHED", metadata: { version, has_placeholders: warning } });
  revalidatePath("/admin/aviso");
  return { ok: true };
}

export type FingerprintImportState = { error?: string } & Partial<FingerprintImportReport>;

export async function importFingerprintAction(_prev: FingerprintImportState, formData: FormData): Promise<FingerprintImportState> {
  const ctx = await adminForAction("people:import");
  if (!ctx) return { error: DENIED };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo .xlsx o .csv." };
  try {
    const report = await importFingerprintCodes(getRepo(), await file.arrayBuffer(), file.name, ctx.admin.id);
    revalidatePath("/admin");
    return report;
  } catch (err) {
    if (err instanceof FingerprintImportError) return { error: err.message };
    console.error("[fingerprint-import] error inesperado");
    return { error: "No se pudo procesar el archivo." };
  }
}

export async function resetGeneralAuthAction(_prev: ManualEditState, formData: FormData): Promise<ManualEditState> {
  const ctx = await adminForAction("people:reset-factors");
  if (!ctx) return { error: DENIED };
  const personId = String(formData.get("personId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(personId)) return { error: "Registro no válido." };
  const totp = await reconfirmAdminTotp(String(formData.get("totp") ?? ""));
  if (!totp.ok) return { error: totp.error };
  const cleared = await resetPersonGeneralAuth(getRepo(), personId, ctx.admin.id);
  if (!cleared) return { error: "No encontramos a esa persona." };
  revalidatePath(`/admin/personas/${personId}`);
  return { ok: true };
}
