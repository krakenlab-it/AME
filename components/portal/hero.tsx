import { Clock3, Lock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { MaristaLogo } from "@/components/brand/logos";

export function PortalHero({ action }: { action: ReactNode }) {
  return (
    <section className="mx-auto grid max-w-5xl gap-10 px-5 pb-6 pt-10 md:grid-cols-[1.1fr_0.9fr] md:items-center md:pt-16">
      <div className="step-enter">
        <MaristaLogo className="mb-8 w-28 md:w-36" />
        <h1 className="text-[34px] leading-[1.12] md:text-[46px]">Actualización de información</h1>
        <p className="mt-4 max-w-[34ch] font-serif text-xl leading-relaxed text-ink">Verifica y actualiza tus datos de manera segura.</p>
        <p className="mt-4 max-w-[58ch] text-ink-muted">
          Este proceso nos permitirá contar con la información necesaria para facilitar la gestión de reclamos y reembolsos relacionados con AIG.
        </p>
        <ul className="mt-8 grid gap-3 text-[15px] sm:grid-cols-3 md:max-w-xl" aria-label="Características del proceso">
          <li className="flex items-center gap-2"><Lock className="h-5 w-5 text-marian" aria-hidden />Conexión segura</li>
          <li className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-marian" aria-hidden />Información confidencial</li>
          <li className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-marian" aria-hidden />Aproximadamente 3–5 minutos</li>
        </ul>
      </div>
      <div className="md:pl-4">{action}</div>
    </section>
  );
}

export function ProtectedNote() {
  return (
    <div className="flex gap-3 rounded-xl bg-marian-soft/60 px-4 py-3 text-[15px]">
      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-marian" aria-hidden />
      <p>
        <span className="font-semibold">Información protegida.</span> Este portal utiliza medidas de seguridad para proteger la confidencialidad de su información.
      </p>
    </div>
  );
}
