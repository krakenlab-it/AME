import { Lock } from "lucide-react";
import type { ReactNode } from "react";

const justify = "text-justify hyphens-auto";

export function LandingIntro({ children }: { children: ReactNode }) {
  return <p className={`text-[15px] leading-relaxed text-ink ${justify}`}>{children}</p>;
}

export function LandingProtectedPanel({ children }: { children: ReactNode }) {
  return (
    <section className={`space-y-5 rounded-2xl bg-marian-soft/70 px-5 py-5 md:px-6 md:py-6 ${justify}`}>
      <div className="flex items-start gap-3 text-[15px] leading-snug text-ink">
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
      <p className={`text-sm leading-relaxed text-ink-muted ${justify}`}>
        Si forma parte del equipo, ingrese con su correo institucional.
      </p>
      <div className="flex justify-center">{children}</div>
    </footer>
  );
}
