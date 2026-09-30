import Link from "next/link";
import type { ReactNode } from "react";
import { MaristaLogo, PartnerStrip } from "@/components/brand/logos";
import type { LegalReadiness } from "@/lib/privacy/readiness";

export function PortalShell({ children, readiness, organizationName }: { children: ReactNode; readiness?: LegalReadiness; organizationName: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {readiness && !readiness.ready && !readiness.blockPortal && (
        <div className="bg-[#FBF5E6] px-4 py-2 text-center text-[13px] text-ink" role="note">
          Entorno de prueba: los textos legales están pendientes de revisión (LEGAL_REVIEW_REQUIRED). No ingrese datos reales.
        </div>
      )}
      <header className="border-b border-marian-line/60 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <Link href="/" className="flex items-center gap-3 rounded-lg" aria-label={`${organizationName}, inicio`}>
            <MaristaLogo className="w-10" />
            <span className="font-serif text-[17px] font-semibold leading-tight text-marian">{organizationName}</span>
          </Link>
        </div>
      </header>
      <main id="contenido" className="flex-1">{children}</main>
      <PortalFooter />
    </div>
  );
}

export function PortalFooter() {
  return (
    <footer className="mt-16 border-t border-marian-line/60 bg-white">
      <div className="mx-auto max-w-5xl space-y-6 px-5 py-8">
        <nav aria-label="Información legal" className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
          <Link className="font-medium text-marian underline-offset-4 hover:underline" href="/privacidad#derechos">Protección de Datos</Link>
          <Link className="font-medium text-marian underline-offset-4 hover:underline" href="/privacidad#aviso">Aviso de Privacidad</Link>
          <Link className="font-medium text-marian underline-offset-4 hover:underline" href="/privacidad#contacto">Contacto</Link>
        </nav>
        <PartnerStrip />
      </div>
    </footer>
  );
}

export function PortalUnavailable() {
  return (
    <div className="mx-auto max-w-xl px-5 py-20 text-center">
      <MaristaLogo className="mx-auto w-24" />
      <h1 className="mt-8 text-3xl">Portal en preparación</h1>
      <p className="mt-4 text-ink-muted">
        Estamos terminando de configurar este portal. Vuelve a intentarlo más tarde con el mismo enlace que recibiste.
      </p>
    </div>
  );
}
