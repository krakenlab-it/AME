import type { AdminRepo } from "@/lib/database/types";
import { maskCedulaTail } from "@/lib/security/masking";
import { issueLinks, linksToCsv, regenerateLink } from "./links";

/** Un /verificar/… por registro importado válido que aún no terminó el formulario (pendiente o iniciado). */
export async function exportPersonalEntryLinks(
  repo: AdminRepo,
  adminId: string,
): Promise<{ count: number; csv: string | null }> {
  const targets = await repo.listLinkMailTargets();
  if (!targets.length) return { count: 0, csv: null };

  const linkByPerson = new Map<string, { url: string; expires_at: string }>();
  const needIssue = targets.filter((person) => !person.has_active_token);
  const needRenew = targets.filter((person) => person.has_active_token);

  for (const link of await issueLinks(repo, needIssue.map((person) => person.id), adminId)) {
    linkByPerson.set(link.person_id, { url: link.url, expires_at: link.expires_at });
  }
  for (const person of needRenew) {
    const link = await regenerateLink(repo, person.id, adminId);
    linkByPerson.set(person.id, { url: link.url, expires_at: link.expires_at });
  }

  const rows = targets.flatMap((person) => {
    const link = linkByPerson.get(person.id);
    if (!link) return [];
    return [{
      first_names: person.first_names,
      last_names: person.last_names,
      cedula_masked: maskCedulaTail(person.national_id_last2),
      url: link.url,
      expires_at: link.expires_at,
    }];
  });

  await repo.audit({
    actor_type: "admin",
    actor_id: adminId,
    action: "LINK_CREATED",
    metadata: { export_personal_links: true, count: rows.length, renewed: needRenew.length, issued: needIssue.length },
  });

  return { count: rows.length, csv: rows.length ? linksToCsv(rows) : null };
}
