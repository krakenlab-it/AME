import Link from "next/link";
import { LogOut } from "lucide-react";
import { MaristaLogo } from "@/components/brand/logos";
import { AdminNav, type AdminNavItem } from "@/components/admin/admin-nav";
import { logoutAction } from "@/app/admin/auth-actions";
import { ROLE_LABELS, ROLE_SCOPE } from "@/lib/admin/labels";
import { can, type Permission } from "@/lib/security/rbac";
import { requireAdmin } from "@/lib/server/admin-guard";

const NAV: (AdminNavItem & { perm: Permission })[] = [
  { href: "/admin", label: "Resumen", shortLabel: "Resumen", icon: "summary", perm: "dashboard:view" },
  { href: "/admin/importar", label: "Importar y enlaces", shortLabel: "Importar", icon: "import", perm: "people:import" },
  { href: "/admin/exportar", label: "Archivo para AIG", shortLabel: "Exportar", icon: "export", perm: "export:create" },
  { href: "/admin/auditoria", label: "Auditoría", shortLabel: "Auditoría", icon: "audit", perm: "audit:view" },
  { href: "/admin/aviso", label: "Aviso de privacidad", shortLabel: "Aviso", icon: "notice", perm: "notice:manage" },
];

export const metadata = { title: { default: "Panel administrativo", template: "%s | Panel administrativo" } };

function LogoutButton({ name, compact }: { name: string; compact?: boolean }) {
  return (
    <form action={logoutAction}>
      <button
        className={
          compact
            ? "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-marian transition-colors hover:bg-marian-soft"
            : "flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3.5 text-[15px] font-medium text-ink transition-colors hover:bg-marian-soft"
        }
        type="submit"
      >
        <LogOut className="h-5 w-5" aria-hidden />
        <span className={compact ? "sr-only" : undefined}>Salir</span>
        <span className="sr-only"> de la sesión de {name}</span>
      </button>
    </form>
  );
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();
  const items: AdminNavItem[] = NAV.filter((n) => can(admin.role, n.perm)).map(({ href, label, shortLabel, icon }) => ({ href, label, shortLabel, icon }));
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-marian-line/70 bg-white lg:flex">
        <Link href="/admin" className="flex items-center gap-3 px-5 py-5">
          <MaristaLogo className="w-10" />
          <span className="font-serif text-[17px] font-semibold leading-tight text-marian">
            Actualización
            <br />
            de datos
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <AdminNav items={items} variant="sidebar" />
        </div>
        <div className="space-y-1 border-t border-marian-line p-3">
          <p className="px-3.5 pb-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-ink">{admin.full_name}</span>
            <span className="block text-sm text-ink-muted">{ROLE_LABELS[admin.role]}</span>
            <span className="mt-1 block text-xs leading-snug text-ink-muted">{ROLE_SCOPE[admin.role]}</span>
          </p>
          <LogoutButton name={admin.full_name} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-marian-line/60 bg-white px-4 py-2 lg:hidden">
          <Link href="/admin" className="flex items-center gap-2.5">
            <MaristaLogo className="w-8" />
            <span className="font-serif text-base font-semibold text-marian">Panel de datos</span>
          </Link>
          <div className="flex items-center gap-1">
            <p className="text-right text-xs leading-tight">
              <span className="block max-w-[9rem] truncate font-semibold text-ink">{admin.full_name}</span>
              <span className="block text-ink-muted">{ROLE_SCOPE[admin.role]}</span>
            </p>
            <LogoutButton name={admin.full_name} compact />
          </div>
        </header>
        <main id="contenido" className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-marian-line/60 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          <AdminNav items={items} variant="tabbar" />
        </div>
      </div>
    </div>
  );
}
