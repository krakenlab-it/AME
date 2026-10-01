import type { AdminRepo } from "@/lib/database/types";
import { maskCedulaTail } from "@/lib/security/masking";
import type { OutboundEmail } from "./email";
import { personalLinkEmail } from "./email";
import { issueLinks, linksToCsv, regenerateLink } from "./links";

export interface LinkMailResult {
  sent: number;
  failed: number;
  skippedNoEmail: number;
  skippedHasLink: number;
  renewedLinks: number;
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
    /** Si es true, escribe a todas las personas con correo y renueva el enlace vigente para poder enviar la URL. */
    emailEveryoneWithOutreach?: boolean;
  },
): Promise<LinkMailResult> {
  const targets = await repo.listLinkMailTargets();
  const withEmail = targets.filter((person): person is typeof person & { email: string } => Boolean(person.email));
  const skippedNoEmail = targets.length - withEmail.length;

  const ready = input.emailEveryoneWithOutreach
    ? withEmail
    : withEmail.filter((person) => !person.has_active_token);

  const skippedHasLink = input.emailEveryoneWithOutreach
    ? 0
    : targets.filter((person) => person.has_active_token).length;

  if (!ready.length) {
    await repo.audit({
      actor_type: "admin",
      actor_id: input.adminId,
      action: "LINK_EMAIL_SENT",
      metadata: { sent: 0, failed: 0, skipped_no_email: skippedNoEmail, skipped_has_link: skippedHasLink, renewed: 0 },
    });
    return { sent: 0, failed: 0, skippedNoEmail, skippedHasLink, renewedLinks: 0, csv: null };
  }

  let renewedLinks = 0;
  const linkByPerson = new Map<string, { url: string; expires_at: string }>();
  const needIssue = ready.filter((person) => !person.has_active_token);
  const needRenew = input.emailEveryoneWithOutreach ? ready.filter((person) => person.has_active_token) : [];

  for (const link of await issueLinks(repo, needIssue.map((person) => person.id), input.adminId)) {
    linkByPerson.set(link.person_id, { url: link.url, expires_at: link.expires_at });
  }
  for (const person of needRenew) {
    const link = await regenerateLink(repo, person.id, input.adminId);
    linkByPerson.set(person.id, { url: link.url, expires_at: link.expires_at });
    renewedLinks += 1;
  }

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
    metadata: { sent, failed, skipped_no_email: skippedNoEmail, skipped_has_link: skippedHasLink, renewed: renewedLinks, mode: input.emailEveryoneWithOutreach ? "all" : "missing" },
  });
  return { sent, failed, skippedNoEmail, skippedHasLink, renewedLinks, csv: linksToCsv(csvRows) };
}
