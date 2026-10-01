import { Lock } from "lucide-react";
import type { ReactNode } from "react";

/** Copy blocks on the landing right column. */
const bodyParagraph = "w-full text-pretty text-justify leading-relaxed hyphens-auto";
const shortLine = "w-full text-center text-pretty leading-snug";

/** Wraps intro + protected panel + staff footer (inside PortalHero action). */
export function LandingRightEntry({ children }: { children: ReactNode }) {
  return <div className="landing-right-entry flex w-full flex-col items-center gap-5 text-center">{children}</div>;
}

export function LandingIntro({ children }: { children: ReactNode }) {
  return <p className={`${bodyParagraph} text-[15px] text-ink`}>{children}</p>;
}

export function LandingProtectedPanel({ children }: { children: ReactNode }) {
  return (
    <section className="w-full space-y-5 rounded-2xl bg-marian-soft/70 px-5 py-5 text-center md:px-6 md:py-6">
      <div className="space-y-2">
        <Lock className="mx-auto h-5 w-5 text-marian" aria-hidden />
        <p className={`${bodyParagraph} text-[15px] text-ink`}>
          <span className="font-semibold">Tu información está protegida.</span> Este portal usa medidas de seguridad para cuidar su confidencialidad.
        </p>
      </div>
      <div className="w-full">{children}</div>
    </section>
  );
}

export function LandingStaffFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="w-full space-y-3 border-t border-marian-line/70 pt-5">
      <p className={`${shortLine} text-sm text-ink-muted`}>
        Si forma parte del equipo, ingrese con su correo institucional.
      </p>
      <div className="flex justify-center">{children}</div>
    </footer>
  );
}
