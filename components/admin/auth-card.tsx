import { History, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MaristaLogo } from "@/components/brand/logos";
import { Reveal } from "@/components/motion/primitives";

const ASSURANCES = [
  { Icon: ShieldCheck, title: "Solo por invitación", text: "Nadie puede crear su propio acceso." },
  { Icon: KeyRound, title: "Verificación en dos pasos", text: "Cada ingreso se confirma con tu teléfono." },
  { Icon: History, title: "Todo queda registrado", text: "Cada consulta y descarga se guarda en la auditoría." },
];

export function AdminAuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main id="contenido" className="min-h-dvh bg-paper lg:grid lg:grid-cols-[1fr_1.05fr]">
      <section aria-label="Sobre el panel" className="hidden flex-col justify-between border-r border-marian-line/70 bg-marian-soft/60 p-12 text-ink lg:flex">
        <MaristaLogo className="w-16" />
        <div className="max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-4xl leading-tight">Panel de actualización de datos</h2>
            <p className="text-lg text-ink-muted">Sigue el avance de cada persona y gestiona su información con control y trazabilidad.</p>
          </div>
          <ul className="space-y-5">
            {ASSURANCES.map(({ Icon, title: t, text }) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-marian-line bg-white text-marian">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{t}</span>
                  <span className="block text-[15px] text-ink-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-ink-muted">Agrupación Marista Ecuatoriana</p>
      </section>

      <div className="flex items-center justify-center px-5 py-10">
        <Reveal className="w-full max-w-md">
          <div className="sheet space-y-6 p-7 sm:p-8">
            <div className="flex items-center gap-3">
              <MaristaLogo className="w-12 lg:hidden" />
              <div>
                <p className="text-sm text-ink-muted">Panel administrativo</p>
                <h1 className="text-2xl">{title}</h1>
                {subtitle && <p className="text-[15px] text-ink-muted">{subtitle}</p>}
              </div>
            </div>
            {children}
          </div>
        </Reveal>
      </div>
    </main>
  );
}

export function AdminAuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-marian underline underline-offset-2">
      {children}
    </Link>
  );
}
