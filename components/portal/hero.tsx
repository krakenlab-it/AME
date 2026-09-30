import { CreditCard, Clock3, Lock, ShieldCheck, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { MaristaLogo } from "@/components/brand/logos";
import { Reveal } from "@/components/motion/primitives";

export function PortalHero({ action }: { action: ReactNode }) {
  return (
    <section className="mx-auto grid max-w-5xl gap-10 px-5 pb-6 pt-8 md:grid-cols-[1.1fr_0.9fr] md:items-start md:pt-14">
      <Reveal>
        <MaristaLogo className="mb-6 w-24 md:mb-8 md:w-36" />
        <h1 className="text-[32px] leading-[1.12] md:text-[44px]">Actualización de información</h1>
        <p className="mt-4 max-w-[34ch] font-serif text-xl leading-relaxed text-ink">Verifica y actualiza tus datos de manera segura.</p>
        <p className="mt-4 max-w-[58ch] text-ink-muted">
          Así podremos facilitar la gestión de tus reclamos y reembolsos relacionados con AIG.
        </p>

        <section aria-labelledby="que-necesitas" className="mt-8 max-w-md rounded-xl border border-marian-line bg-white p-5">
          <h2 id="que-necesitas" className="font-sans text-base font-semibold">Ten a mano</h2>
          <ul className="mt-3 space-y-2.5 text-[15.5px]">
            <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-marian" aria-hidden />Tu número de cédula</li>
            <li className="flex items-center gap-3"><Smartphone className="h-5 w-5 shrink-0 text-marian" aria-hidden />Tu correo y tu celular</li>
            <li className="flex items-center gap-3"><CreditCard className="h-5 w-5 shrink-0 text-marian" aria-hidden />Los datos de tu cuenta bancaria para reembolsos</li>
          </ul>
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
            <Clock3 className="h-4 w-4 shrink-0 text-marian" aria-hidden />Toma de 3 a 5 minutos.
          </p>
        </section>
      </Reveal>
      <Reveal className="md:pl-4" delay={0.12}>{action}</Reveal>
    </section>
  );
}

export function ProtectedNote() {
  return (
    <div className="flex gap-3 rounded-xl bg-marian-soft/60 px-4 py-3 text-[15px]">
      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-marian" aria-hidden />
      <p>
        <span className="font-semibold">Tu información está protegida.</span> Este portal usa medidas de seguridad para cuidar su confidencialidad.
      </p>
    </div>
  );
}
