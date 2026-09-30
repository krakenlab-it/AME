import { randomToken, sha256 } from "@/lib/encryption/crypto";
import type { AdminRepo } from "@/lib/database/types";
import { settings } from "./settings";

export interface IssuedLink {
  person_id: string;
  url: string;
  expires_at: string;
}

/**
 * Genera enlaces individuales. El token en claro solo existe en la respuesta
 * (para entregarlo al titular); en la base se guarda únicamente su SHA-256.
 */
export async function issueLinks(repo: AdminRepo, personIds: string[], adminId: string, ttlDays = settings.tokenTtlDays()): Promise<IssuedLink[]> {
  const expires = new Date(Date.now() + ttlDays * 86_400_000).toISOString();
  const issued: IssuedLink[] = [];
  const rows = personIds.map((person_id) => {
    const token = randomToken(32);
    issued.push({ person_id, url: `${settings.baseUrl()}/verificar/${token}`, expires_at: expires });
    return { person_id, token_hash: sha256(token), expires_at: expires, created_by: adminId };
  });
  if (rows.length) await repo.createAccessTokens(rows);
  await repo.audit({ actor_type: "admin", actor_id: adminId, action: "LINK_CREATED", metadata: { count: rows.length, ttl_days: ttlDays } });
  return issued;
}

/** Revoca enlaces vigentes y emite uno nuevo para una persona. */
export async function regenerateLink(repo: AdminRepo, personId: string, adminId: string): Promise<IssuedLink> {
  const revoked = await repo.revokeTokensForPerson(personId, "REGENERATED_BY_ADMIN");
  if (revoked > 0) await repo.audit({ person_id: personId, actor_type: "admin", actor_id: adminId, action: "LINK_REVOKED", metadata: { count: revoked } });
  const [link] = await issueLinks(repo, [personId], adminId);
  return link!;
}

export async function revokeLinks(repo: AdminRepo, personId: string, adminId: string): Promise<number> {
  const revoked = await repo.revokeTokensForPerson(personId, "REVOKED_BY_ADMIN");
  await repo.audit({ person_id: personId, actor_type: "admin", actor_id: adminId, action: "LINK_REVOKED", metadata: { count: revoked } });
  return revoked;
}

export function linksToCsv(rows: { row?: number; first_names: string; last_names: string; cedula_masked: string; url: string; expires_at: string }[]): string {
  const header = "fila,nombres,apellidos,cedula,enlace,expira";
  const esc = (v: string) => `"${v.replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
  return [header, ...rows.map((r) => [String(r.row ?? ""), r.first_names, r.last_names, r.cedula_masked, r.url, r.expires_at].map(esc).join(","))].join("\n");
}
