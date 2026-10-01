import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/primitives";

/** Portada pública: tarjeta única centrada (sin columnas laterales). */
export function LandingEntryCard({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[34rem] flex-1 flex-col justify-center px-5 py-10 md:max-w-[36rem] md:py-14">
      <Reveal className="w-full">
        <article className="sheet w-full space-y-6 rounded-2xl border border-marian-line/80 bg-white p-6 shadow-sm md:p-8">{children}</article>
      </Reveal>
    </div>
  );
}

export function LandingIntro({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-ink text-justify hyphens-auto">{children}</p>;
}

export function LandingProtectedPanel({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-5 rounded-2xl bg-marian-soft/70 px-5 py-5 md:px-6 md:py-6">
      <div className="flex items-start gap-3 text-[15px] leading-snug text-ink text-justify">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-marian" aria-hidden />
        <p>
          <span className="font-semibold">Tu información está protegida.</span> Este portal usa medidas de seguridad para cuidar su confidencialidad.
        </p>
      </div>
      <div className="w-full">{children}</div>
    </section>
  );
}

export function LandingStaffFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="space-y-3 border-t border-marian-line/70 pt-5 text-center">
      <p className="text-sm leading-relaxed text-ink-muted text-pretty">Si forma parte del equipo, ingrese con su correo institucional.</p>
      <div className="flex justify-center">{children}</div>
    </footer>
  );
}
