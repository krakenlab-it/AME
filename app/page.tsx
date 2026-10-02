import { redirect } from "next/navigation";
import { CedulaCta } from "@/components/forms/cedula-cta";
import { PortalHero } from "@/components/portal/hero";
import {
  LandingIntro,
  LandingProtectedPanel,
  LandingRightEntry,
  LandingStaffFooter,
} from "@/components/portal/landing-entry-card";
import { PortalShell, PortalUnavailable } from "@/components/portal/shell";
import { DemoAccess } from "@/components/demo/demo-access";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { readAdminGate } from "@/lib/server/admin-guard";
import { currentRespondent } from "@/lib/server/respondent-session";
import { landingConsolePath } from "@/lib/services/landing-redirect";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ fin?: string }> }) {
  const [gate, respondent] = await Promise.all([
    readAdminGate(),
    currentRespondent({ allowSubmitted: true }),
  ]);
  const destination = landingConsolePath({
    admin: gate.kind,
    hasRespondentSession: respondent !== null,
  });
  if (destination) redirect(destination);

  const { fin } = await searchParams;
  const privacy = await getActivePrivacy(getRepo());
  if (privacy.readiness.blockPortal) return <PortalUnavailable />;

  return (
    <PortalShell readiness={privacy.readiness} organizationName={privacy.config.organizationName}>
      <PortalHero
        action={
          <div className="sheet p-6 md:p-8">
            {fin ? (
              <LandingRightEntry>
                <Notice tone="success" title={fin === "cuenta" ? "Sesión cerrada" : "Proceso finalizado"}>
                  Su sesión se cerró de forma segura. Ya puede cerrar esta ventana.
                </Notice>
                <LandingStaffFooter>
                  <ButtonLink href="/admin/login" variant="ghost" size="sm">
                    Iniciar sesión con correo
                  </ButtonLink>
                </LandingStaffFooter>
              </LandingRightEntry>
            ) : (
              <LandingRightEntry>
                <LandingIntro>
                  Usted ha ingresado desde un enlace seguro enviado para la protección de sus datos personales. Confirme su cédula a continuación para continuar con la actualización.
                </LandingIntro>
                <LandingProtectedPanel>
                  <CedulaCta turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
                </LandingProtectedPanel>
                <LandingStaffFooter>
                  <ButtonLink href="/admin/login" variant="ghost" size="sm">
                    Iniciar sesión con correo
                  </ButtonLink>
                </LandingStaffFooter>
              </LandingRightEntry>
            )}
            <div className="landing-right-entry mt-5 w-full [&_aside]:text-center">
              <DemoAccess />
            </div>
          </div>
        }
      />
    </PortalShell>
  );
}
