import { redirect } from "next/navigation";
import { CedulaCta } from "@/components/forms/cedula-cta";
import { PortalHero, ProtectedNote } from "@/components/portal/hero";
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
          <div className="sheet space-y-5 p-6 md:p-8">
            {fin ? (
              <Notice tone="success" title={fin === "cuenta" ? "Sesión cerrada" : "Proceso finalizado"}>
                Su sesión se cerró de forma segura. Ya puede cerrar esta ventana.
              </Notice>
            ) : (
              <p className="text-[15px] leading-relaxed text-ink">
                Usted ha ingresado desde un enlace seguro enviado para la protección de sus datos personales. Confirme su cédula a continuación para continuar con la actualización.
              </p>
            )}
            {!fin && (
              <ProtectedNote>
                <CedulaCta turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
              </ProtectedNote>
            )}
            <div className="border-t border-marian-line/70 pt-5">
              <p className="text-sm text-ink-muted">Si forma parte del equipo, ingrese con su correo institucional.</p>
              <ButtonLink href="/admin/login" variant="ghost" size="sm" className="mt-2">
                Iniciar sesión con correo
              </ButtonLink>
            </div>
            <DemoAccess />
          </div>
        }
      />
    </PortalShell>
  );
}
