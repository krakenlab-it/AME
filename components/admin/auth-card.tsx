import Link from "next/link";
import type { ReactNode } from "react";
import { MaristaLogo } from "@/components/brand/logos";

export function AdminAuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main id="contenido" className="flex min-h-dvh items-center justify-center bg-marian-soft/40 px-5 py-12">
      <div className="sheet w-full max-w-md space-y-6 p-8">
        <div className="flex items-center gap-3">
          <MaristaLogo className="w-12" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Panel administrativo</p>
            <h1 className="text-2xl">{title}</h1>
            {subtitle && <p className="text-[15px] text-ink-muted">{subtitle}</p>}
          </div>
        </div>
        {children}
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
