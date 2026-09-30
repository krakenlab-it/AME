import Link from "next/link";
import { LogOut } from "lucide-react";
import { MaristaLogo } from "@/components/brand/logos";
import { AdminNav } from "@/components/admin/admin-nav";
import { logoutAction } from "@/app/admin/auth-actions";
import { ROLE_LABELS } from "@/lib/admin/labels";
import { can, type Permission } from "@/lib/security/rbac";
import { requireAdmin } from "@/lib/server/admin-guard";

const NAV: { href: string; label: string; perm: Permission }[] = [
  { href: "/admin", label: "Resumen", perm: "dashboard:view" },
  { href: "/admin/importar", label: "Importar y enlaces", perm: "people:import" },
  { href: "/admin/exportar", label: "Archivo para AIG", perm: "export:create" },
  { href: "/admin/auditoria", label: "Auditoría", perm: "audit:view" },
  { href: "/admin/aviso", label: "Aviso de privacidad", perm: "notice:manage" },
];

export const metadata = { title: { default: "Panel administrativo", template: "%s | Panel administrativo" } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-marian-line bg-white">
        <div className="mx-auto max-w-6xl space-y-3 px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <Link href="/admin" className="flex items-center gap-2.5 rounded-lg">
              <MaristaLogo className="w-9" />
              <span className="font-serif text-[17px] font-semibold leading-tight text-marian">Panel de actualización de datos</span>
            </Link>
            <div className="flex items-center gap-2 text-sm">
              <p className="hidden text-right leading-tight sm:block">
                <span className="block font-semibold text-ink">{admin.full_name}</span>
                <span className="block text-ink-muted">{ROLE_LABELS[admin.role]}</span>
              </p>
              <form action={logoutAction}>
                <button
                  className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 font-medium text-marian hover:bg-marian-soft"
                  type="submit"
                >
                  <LogOut className="h-4 w-4" aria-hidden /> Salir
                  <span className="sr-only"> de la sesión de {admin.full_name}</span>
                </button>
              </form>
            </div>
          </div>
          <AdminNav items={NAV.filter((n) => can(admin.role, n.perm)).map(({ href, label }) => ({ href, label }))} />
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-6xl px-5 py-8 md:py-10">{children}</main>
    </div>
  );
}
