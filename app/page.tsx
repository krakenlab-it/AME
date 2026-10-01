import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
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
                Tu sesión se cerró de forma segura. Ya puedes cerrar esta ventana.
              </Notice>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <Mail className="mt-1 h-6 w-6 shrink-0 text-marian" aria-hidden />
                  <div>
                    <h2 className="text-xl">Para comenzar, abre tu enlace personal</h2>
                    <p className="mt-2 text-ink-muted">
                      Cada persona recibe un enlace individual por correo o mensaje. Ábrelo desde ese mensaje para iniciar el proceso.
                    </p>
                  </div>
                </div>
                <p className="text-[15px] text-ink-muted">
                  Por seguridad, este portal no permite buscar registros por nombre o cédula.
                </p>
              </>
            )}
            <div className="border-t border-marian-line/70 pt-5">
              <p className="text-sm text-ink-muted">Si formas parte del equipo, ingresa con tu correo.</p>
              <ButtonLink href="/admin/login" variant="secondary" size="sm" className="mt-3">
                Iniciar sesión con correo
              </ButtonLink>
            </div>
            <ProtectedNote />
            <DemoAccess />
          </div>
        }
      />
    </PortalShell>
  );
}
