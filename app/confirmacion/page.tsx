import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { finishAction } from "@/app/verificar/actions";
import { StepCrown } from "@/components/portal/step-crown";
import { PortalShell } from "@/components/portal/shell";
import { Button } from "@/components/ui/button";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { currentRespondent } from "@/lib/server/respondent-session";

export default async function ConfirmationPage() {
  const ctx = await currentRespondent({ allowSubmitted: true });
  if (!ctx || !ctx.session.submitted_at || !ctx.person.confirmation_code) redirect("/");
  const privacy = await getActivePrivacy(getRepo());

  return (
    <PortalShell readiness={privacy.readiness} organizationName={privacy.config.organizationName}>
      <div className="mx-auto max-w-xl space-y-6 px-5 py-10 md:py-14">
        <StepCrown current={7} />
        <section className="sheet step-enter space-y-6 p-7 text-center md:p-10" aria-labelledby="ok-title">
          <CheckCircle2 className="mx-auto h-14 w-14 text-ok" aria-hidden />
          <h1 id="ok-title" className="text-[30px] leading-tight">Información registrada correctamente</h1>
          <p className="text-lg">Gracias. Hemos recibido la actualización de su información.</p>
          <p className="text-ink-muted">Su información será utilizada únicamente para las finalidades descritas en el Aviso de Privacidad.</p>
          <div className="rounded-xl bg-marian-soft/60 px-5 py-4">
            <p className="text-sm text-ink-muted">Número de confirmación</p>
            <p className="mt-1 font-serif text-[28px] font-semibold tracking-[0.08em] text-marian">{ctx.person.confirmation_code}</p>
          </div>
          <p className="text-sm text-ink-muted">Guarda este número. Si registraste un correo, te enviamos una confirmación sin datos sensibles.</p>
          <form action={finishAction}>
            <Button type="submit" block>Finalizar</Button>
          </form>
        </section>
      </div>
    </PortalShell>
  );
}
