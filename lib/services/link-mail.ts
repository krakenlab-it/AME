import type { AdminRepo } from "@/lib/database/types";
import { maskCedulaTail } from "@/lib/security/masking";
import type { OutboundEmail } from "./email";
import { personalLinkEmail } from "./email";
import { issueLinks, linksToCsv } from "./links";

export interface LinkMailResult {
  sent: number;
  failed: number;
  skippedNoEmail: number;
  skippedHasLink: number;
  csv: string | null;
}

/**
 * Crea enlaces solo para quienes no tienen uno vigente y les escribe el correo.
 * No revoca enlaces ya entregados: el enlace en claro no se guarda y no se puede reenviar el mismo.
 */
export async function sendMissingLinkEmails(
  repo: AdminRepo,
  input: {
    adminId: string;
    organization: string;
    deliver: (message: OutboundEmail) => Promise<boolean>;
  },
): Promise<LinkMailResult> {
  const targets = await repo.listLinkMailTargets();
  const skippedHasLink = targets.filter((person) => person.has_active_token).length;
  const withoutLink = targets.filter((person) => !person.has_active_token);
  const skippedNoEmail = withoutLink.filter((person) => !person.email).length;
  const ready = withoutLink.filter((person): person is typeof person & { email: string } => Boolean(person.email));

  if (!ready.length) {
    await repo.audit({
      actor_type: "admin",
      actor_id: input.adminId,
      action: "LINK_EMAIL_SENT",
      metadata: { sent: 0, failed: 0, skipped_no_email: skippedNoEmail, skipped_has_link: skippedHasLink },
    });
    return { sent: 0, failed: 0, skippedNoEmail, skippedHasLink, csv: null };
  }

  const links = await issueLinks(repo, ready.map((person) => person.id), input.adminId);
  const linkByPerson = new Map(links.map((link) => [link.person_id, link]));
  const csvRows: { first_names: string; last_names: string; cedula_masked: string; url: string; expires_at: string }[] = [];
  let sent = 0;
  let failed = 0;

  for (const person of ready) {
    const link = linkByPerson.get(person.id);
    if (!link) {
      failed += 1;
      continue;
    }
    csvRows.push({
      first_names: person.first_names,
      last_names: person.last_names,
      cedula_masked: maskCedulaTail(person.national_id_last2),
      url: link.url,
      expires_at: link.expires_at,
    });
    const message = personalLinkEmail({
      firstName: person.first_names.split(" ")[0] || person.first_names,
      url: link.url,
      expiresAt: link.expires_at,
      organization: input.organization,
    });
    let ok = false;
    try {
      ok = await input.deliver({ ...message, to: person.email });
    } catch {
      ok = false;
    }
    if (ok) sent += 1;
    else failed += 1;
  }

  await repo.audit({
    actor_type: "admin",
    actor_id: input.adminId,
    action: "LINK_EMAIL_SENT",
    metadata: { sent, failed, skipped_no_email: skippedNoEmail, skipped_has_link: skippedHasLink },
  });
  return { sent, failed, skippedNoEmail, skippedHasLink, csv: linksToCsv(csvRows) };
}
