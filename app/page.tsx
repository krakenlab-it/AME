import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { PortalHero } from "@/components/portal/hero";
import {
  LandingAdminLink,
  LandingIntro,
  LandingProtectedPanel,
  LandingRightEntry,
  LandingStaffFooter,
} from "@/components/portal/landing-entry-card";
import { PortalShell, PortalUnavailable } from "@/components/portal/shell";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { readAdminGate } from "@/lib/server/admin-guard";
import { currentRespondent } from "@/lib/server/respondent-session";
import { landingConsolePath } from "@/lib/services/landing-redirect";
import { settings } from "@/lib/services/settings";

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
        passportSignIn={settings.passportSignInEnabled()}
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
                <LandingAdminLink />
              </LandingRightEntry>
            ) : (
              <LandingRightEntry>
                <LandingIntro>
                  Ingrese con su correo para actualizar sus datos. Le enviaremos un código de verificación para proteger su información personal.
                </LandingIntro>
                <LandingProtectedPanel>
                  <ButtonLink href="/ingresar" variant="primary" block className="w-full">
                    <LogIn className="h-5 w-5" aria-hidden />
                    Ingresar
                  </ButtonLink>
                </LandingProtectedPanel>
                <LandingStaffFooter>
                  <ButtonLink href="/admin/login" variant="ghost" size="sm">
                    Iniciar sesión con correo
                  </ButtonLink>
                </LandingStaffFooter>
                <LandingAdminLink />
              </LandingRightEntry>
            )}
          </div>
        }
      />
    </PortalShell>
  );
}
