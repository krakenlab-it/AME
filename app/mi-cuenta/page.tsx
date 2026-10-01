import { InsuredDashboard, InsuredLocked, InsuredMissingRecord } from "@/components/portal/insured-dashboard";
import { PortalShell, PortalUnavailable } from "@/components/portal/shell";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { composeInsuredHome } from "@/lib/services/insured-home";
import { currentRespondent } from "@/lib/server/respondent-session";

export default async function InsuredHomePage() {
  const repo = getRepo();
  const privacy = await getActivePrivacy(repo);
  if (privacy.readiness.blockPortal) return <PortalUnavailable />;

  const ctx = await currentRespondent({ allowSubmitted: true });
  if (!ctx) {
    return (
      <PortalShell readiness={privacy.readiness} organizationName={privacy.config.organizationName}>
        <InsuredLocked supportContact={privacy.config.supportContact} />
      </PortalShell>
    );
  }

  const record = await repo.getInsuredRecord(ctx.person.id);
  return (
    <PortalShell readiness={privacy.readiness} organizationName={privacy.config.organizationName}>
      {record && record.person.id === ctx.person.id ? (
        <InsuredDashboard
          home={composeInsuredHome(record, { version: privacy.version })}
          supportContact={privacy.config.supportContact}
        />
      ) : (
        <InsuredMissingRecord supportContact={privacy.config.supportContact} />
      )}
    </PortalShell>
  );
}
