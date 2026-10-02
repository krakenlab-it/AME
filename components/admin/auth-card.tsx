import { History, KeyRound, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/admin/auth-actions";
import { MaristaLogo } from "@/components/brand/logos";
import { Reveal } from "@/components/motion/primitives";
import { Button } from "@/components/ui/button";

/**
 * Regla de UX del portal: pantallas de autenticación y pasos intermedios (MFA, contraseña)
 * siempre ofrecen una salida visible; nunca dejar al usuario atrapado sin volver al ingreso.
 */

const ASSURANCES = [
  { Icon: ShieldCheck, title: "Solo por invitación", text: "Nadie puede crear su propio acceso administrativo." },
  { Icon: Users, title: "Gestión de personas y enlaces", text: "Usted importa registros, genera enlaces seguros y hace seguimiento del avance." },
  { Icon: KeyRound, title: "Verificación en dos pasos", text: "Cada ingreso se confirma con su aplicación autenticadora." },
  { Icon: History, title: "Auditoría completa", text: "Cada consulta, cambio manual y exportación queda registrada con su usuario." },
];

export function AdminAuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main id="contenido" className="min-h-dvh bg-paper lg:grid lg:grid-cols-[1fr_1.05fr]">
      <section aria-label="Sobre el panel" className="hidden flex-col justify-between border-r border-marian-line/70 bg-marian-soft/60 p-12 text-ink lg:flex">
        <MaristaLogo className="w-16" />
        <div className="max-w-md space-y-8">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-marian">Versión administrador</p>
            <h2 className="text-4xl leading-tight">Usted está en la versión administrador</h2>
            <p className="text-lg text-ink-muted">
              Este acceso es exclusivo para personal invitado. No es la página de la persona asegurada. Desde aquí usted administra personas importadas, enlaces individuales, envíos por correo, exportaciones y el registro de auditoría.
            </p>
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
                <p className="text-sm font-semibold text-marian">Versión administrador</p>
                <h1 className="text-2xl">{title}</h1>
                {subtitle && <p className="text-[15px] text-ink-muted">{subtitle}</p>}
                <p className="mt-2 text-sm text-ink-muted lg:hidden">
                  Acceso solo por invitación, con verificación en dos pasos y auditoría de cada acción.
                </p>
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

/**
 * Vuelve a /admin/login. Con `clearSession`, cierra la sesión a medias (p. ej. tras login sin MFA)
 * para que el ingreso muestre de nuevo «Probar el portal» y el acceso demo.
 */
export function AdminAuthBackToLogin({
  clearSession = false,
  children = "Volver al ingreso",
}: {
  clearSession?: boolean;
  children?: ReactNode;
}) {
  if (clearSession) {
    return (
      <div className="border-t border-marian-line/60 pt-4">
        <form action={logoutAction}>
          <Button type="submit" variant="secondary" block className="min-h-[44px]">
            {children}
          </Button>
        </form>
      </div>
    );
  }
  return (
    <p className="text-sm">
      <AdminAuthLink href="/admin/login">{children}</AdminAuthLink>
    </p>
  );
}
