import { GeneralAccessPanel } from "@/components/forms/general-access-panel";
import { PortalShell, PortalUnavailable } from "@/components/portal/shell";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { settings } from "@/lib/services/settings";

export const metadata = { title: "Ingresar" };

export default async function GeneralAccessPage() {
  const privacy = await getActivePrivacy(getRepo());
  if (privacy.readiness.blockPortal) return <PortalUnavailable />;

  return (
    <PortalShell readiness={privacy.readiness} organizationName={privacy.config.organizationName}>
      <div className="mx-auto max-w-xl px-5 py-8 md:py-14">
        <h1 className="mb-6 text-[32px] leading-tight">Actualización de información</h1>
        <GeneralAccessPanel turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} requireFingerprint={settings.requireFingerprintCode()} />
      </div>
    </PortalShell>
  );
}
