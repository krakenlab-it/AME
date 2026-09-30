"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { getRepo } from "@/lib/database";
import { adminForAction } from "@/lib/server/admin-guard";
import { hasPlaceholder } from "@/lib/privacy/placeholders";
import { ImportFileError, importPeople, parseImportFile, type ImportError } from "@/lib/services/import";
import { issueLinks, linksToCsv, regenerateLink, revokeLinks } from "@/lib/services/links";
import { maskCedula } from "@/lib/security/masking";
import { decrypt } from "@/lib/encryption/crypto";

const DENIED = "No tienes permiso para esta acción o tu sesión venció.";

export interface ImportState {
  error?: string;
  committed?: boolean;
  total?: number;
  imported?: number;
  rejected?: ImportError[];
  linksCsv?: string | null;
}

export async function importAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await adminForAction("people:import");
  if (!ctx) return { error: DENIED };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo .csv o .xlsx." };
  try {
    const rows = await parseImportFile(await file.arrayBuffer(), file.name);
    const out = await importPeople(getRepo(), { rows, filename: file.name, adminId: ctx.admin.id, allowPartial: formData.get("allowPartial") === "on" });
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
  return { csv: linksToCsv(rows), count: rows.length };
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
