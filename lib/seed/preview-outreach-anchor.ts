import "server-only";
import { keyedHash, sha256 } from "@/lib/encryption/crypto";
import type { MemoryRepo } from "@/lib/database/memory-repo";
import { previewSandboxEmptyPeople } from "@/lib/demo-mode";
import {
  PREVIEW_OUTREACH_LEGACY_RAW_TOKEN,
  PREVIEW_OUTREACH_RAW_TOKEN,
  PREVIEW_OUTREACH_SIMULATION_TO,
} from "@/lib/demo/preview-outreach-tokens";
import { settings } from "@/lib/services/settings";

export { PREVIEW_OUTREACH_RAW_TOKEN, PREVIEW_OUTREACH_SIMULATION_TO } from "@/lib/demo/preview-outreach-tokens";
export { PREVIEW_OUTREACH_LEGACY_RAW_TOKEN } from "@/lib/demo/preview-outreach-tokens";
const ANCHOR_CEDULA = "1710034065";

export function previewOutreachAnchorEnabled(): boolean {
  return previewSandboxEmptyPeople();
}

/** Persona de prueba + enlace vigente para simulación de correo y happy path público. */
export function ensurePreviewOutreachAnchor(repo: MemoryRepo): void {
  if (!previewOutreachAnchorEnabled()) return;
  const nationalHash = keyedHash(ANCHOR_CEDULA, "national_id");
  let personId = [...repo.people.values()].find((p) => p.national_id_hash === nationalHash)?.id;
  if (!personId) {
    personId = repo.addPerson("Persona", "Prueba correo", ANCHOR_CEDULA);
    repo.outreachEmails.set(personId, PREVIEW_OUTREACH_SIMULATION_TO);
  }
  const now = Date.now();
  for (const raw of [PREVIEW_OUTREACH_RAW_TOKEN, PREVIEW_OUTREACH_LEGACY_RAW_TOKEN]) {
    const tokenHash = sha256(raw);
    const hasVigente = [...repo.tokens.values()].some(
      (t) =>
        t.person_id === personId &&
        t.token_hash === tokenHash &&
        !t.used_at &&
        !t.revoked_at &&
        new Date(t.expires_at).getTime() > now,
    );
    if (!hasVigente) repo.addToken(personId, tokenHash);
  }
}

export function previewOutreachCompletionUrl(): string {
  return `${settings.baseUrl()}/verificar/${PREVIEW_OUTREACH_RAW_TOKEN}`;
}
