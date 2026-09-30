import Link from "next/link";
import { LogOut } from "lucide-react";
import { MaristaLogo } from "@/components/brand/logos";
import { logoutAction } from "@/app/admin/auth-actions";
import { can, type Permission } from "@/lib/security/rbac";
import { requireAdmin } from "@/lib/server/admin-guard";

const NAV: { href: string; label: string; perm: Permission }[] = [
  { href: "/admin", label: "Resumen", perm: "dashboard:view" },
  { href: "/admin/importar", label: "Importar y enlaces", perm: "people:import" },
  { href: "/admin/exportar", label: "Generar archivo para AIG", perm: "export:create" },
  { href: "/admin/auditoria", label: "Auditoría", perm: "audit:view" },
  { href: "/admin/aviso", label: "Aviso de privacidad", perm: "notice:manage" },
];

export const metadata = { title: "Panel administrativo" };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-marian-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <MaristaLogo className="w-9" />
            <span className="font-serif font-semibold text-marian">Panel de actualización de datos</span>
          </Link>
          <nav aria-label="Administración" className="order-3 flex w-full flex-wrap gap-1 md:order-none md:ml-6 md:w-auto">
            {NAV.filter((n) => can(admin.role, n.perm)).map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-marian-soft">{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-ink-muted">{admin.full_name} <span className="rounded bg-marian-soft px-1.5 py-0.5 text-xs font-semibold text-marian">{admin.role}</span></span>
            <form action={logoutAction}>
              <button className="flex items-center gap-1 rounded-lg px-2 py-2 text-marian hover:bg-marian-soft" type="submit">
                <LogOut className="h-4 w-4" aria-hidden /> Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
