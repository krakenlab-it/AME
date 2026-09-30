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
            <h1 className="text-2xl">{title}</h1>
            {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

export function AdminAuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-marian underline">
      {children}
    </Link>
  );
}
