import dynamic from "next/dynamic";
import { PortalShell, PortalUnavailable } from "@/components/portal/shell";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { registeredView } from "@/lib/services/respondent";
import { currentRespondent } from "@/lib/server/respondent-session";

const UpdateWizard = dynamic(() => import("@/components/forms/update-wizard").then((m) => m.UpdateWizard), {
  loading: () => (
    <div role="status" className="mx-auto max-w-2xl space-y-4 px-5 py-10">
      <span className="sr-only">Cargando el formulario…</span>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  ),
});

export default async function FormPage() {
  const privacy = await getActivePrivacy(getRepo());
  if (privacy.readiness.blockPortal) return <PortalUnavailable />;
  const ctx = await currentRespondent();
  const { config } = privacy;

  return (
    <PortalShell readiness={privacy.readiness} organizationName={config.organizationName}>
      {!ctx ? (
        <div className="mx-auto max-w-xl space-y-4 px-5 py-16">
          <h1 className="text-3xl">Tu sesión no está activa</h1>
          <Notice tone="warning">
            Por seguridad, la sesión se cierra después de 30 minutos o al terminar el proceso. Abre otra vez el enlace personal que recibiste.
          </Notice>
          <p className="text-ink-muted">Si el enlace ya no funciona, escribe a {config.supportContact}.</p>
        </div>
      ) : (
        <UpdateWizard
          registered={registeredView(ctx.person)}
          supportContact={config.supportContact}
          privacy={{
            version: privacy.version,
            summary: privacy.text,
            consentTexts: privacy.consentTexts,
            responsibleLegalName: config.responsibleLegalName,
            responsibleRuc: config.responsibleRuc,
            responsibleAddress: config.responsibleAddress,
            privacyEmail: config.privacyEmail,
            privacyPhone: config.privacyPhone,
            dataProtectionOfficer: config.dataProtectionOfficer,
            recipientLegalName: config.recipientLegalName,
          }}
        />
      )}
    </PortalShell>
  );
}
