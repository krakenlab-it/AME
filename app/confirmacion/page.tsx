import { redirect } from "next/navigation";
import { finishAction } from "@/app/verificar/actions";
import { Reveal } from "@/components/motion/primitives";
import { SuccessCheck } from "@/components/motion/success-check";
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
        <Reveal className="sheet space-y-6 p-7 text-center md:p-10">
        <section className="space-y-6" aria-labelledby="ok-title">
          <SuccessCheck className="mx-auto h-16 w-16" />
          <h1 id="ok-title" className="text-[30px] leading-tight">Listo, registramos tu información</h1>
          <p className="text-lg">Gracias. Recibimos la actualización de tus datos.</p>
          <div className="rounded-xl bg-marian-soft/60 px-5 py-4">
            <p className="text-sm text-ink-muted">Tu número de confirmación</p>
            <p className="mt-1 break-all font-serif text-[28px] font-semibold tracking-[0.08em] text-marian">{ctx.person.confirmation_code}</p>
          </div>
          <p className="text-[15px] text-ink-muted">
            Guarda este número por si necesitas consultarlo. Si registraste un correo, te enviamos una confirmación sin datos sensibles.
          </p>
          <p className="text-[15px] text-ink-muted">Usaremos tu información solo para lo descrito en el Aviso de Privacidad.</p>
          <form action={finishAction}>
            <Button type="submit" block>Terminar y cerrar sesión</Button>
          </form>
        </section>
        </Reveal>
      </div>
    </PortalShell>
  );
}
