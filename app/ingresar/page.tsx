import { redirect } from "next/navigation";
import { GeneralAccessPanel } from "@/components/forms/general-access-panel";
import { LandingAdminLink } from "@/components/portal/landing-entry-card";
import { PortalShell, PortalUnavailable } from "@/components/portal/shell";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { readAdminGate } from "@/lib/server/admin-guard";
import { landingConsolePath } from "@/lib/services/landing-redirect";
import { settings } from "@/lib/services/settings";

export const metadata = { title: "Ingresar" };

export default async function GeneralAccessPage() {
  // Quien ya tiene sesión de administración (misma barrera que la portada) va al panel.
  const gate = await readAdminGate();
  const adminDestination = landingConsolePath({ admin: gate.kind, hasRespondentSession: false });
  if (adminDestination) redirect(adminDestination);

  const privacy = await getActivePrivacy(getRepo());
  if (privacy.readiness.blockPortal) return <PortalUnavailable />;

  return (
    <PortalShell readiness={privacy.readiness} organizationName={privacy.config.organizationName}>
      <div className="mx-auto max-w-xl px-5 py-8 md:py-14">
        <h1 className="mb-6 text-[32px] leading-tight">Actualización de información</h1>
        <GeneralAccessPanel
          turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
          method={settings.generalAuthMethod()}
        />
        <div className="mt-8">
          <LandingAdminLink />
        </div>
      </div>
    </PortalShell>
  );
}
