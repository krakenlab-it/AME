import Link from "next/link";
import { MaristaLogo } from "@/components/brand/logos";
import { AdminNav, type AdminNavGroup, type AdminNavItem } from "@/components/admin/admin-nav";
import { AdminUser } from "@/components/admin/admin-user";
import { MobileNav } from "@/components/admin/mobile-nav";
import { can, type Permission } from "@/lib/security/rbac";
import { requireAdmin } from "@/lib/server/admin-guard";

type NavEntry = AdminNavItem & { perm: Permission };

const NAV_GROUPS: { label: string | null; items: NavEntry[] }[] = [
  { label: null, items: [{ href: "/admin", label: "Resumen", icon: "summary", perm: "dashboard:view" }] },
  {
    label: "Datos",
    items: [
      { href: "/admin/importar", label: "Importar y enlaces", icon: "import", perm: "people:import" },
      { href: "/admin/exportar", label: "Archivo para AIG", icon: "export", perm: "export:create" },
    ],
  },
  {
    label: "Control",
    items: [
      { href: "/admin/auditoria", label: "Auditoría", icon: "audit", perm: "audit:view" },
      { href: "/admin/aviso", label: "Aviso de privacidad", icon: "notice", perm: "notice:manage" },
    ],
  },
  { label: "Equipo", items: [{ href: "/admin/invitar", label: "Invitar personal", icon: "invite", perm: "staff:invite" }] },
];

export const metadata = { title: { default: "Panel administrativo", template: "%s | Panel administrativo" } };

function Brand({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <Link href="/admin" className="flex items-center gap-3 rounded-lg">
      <MaristaLogo className={size === "sm" ? "w-8" : "w-10"} />
      <span className={size === "sm" ? "font-serif text-base font-semibold leading-tight text-marian" : "font-serif text-[17px] font-semibold leading-tight text-marian"}>
        Actualización
        <br />
        de datos
      </span>
    </Link>
  );
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();
  const groups: AdminNavGroup[] = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => can(admin.role, item.perm)).map(({ href, label, icon }) => ({ href, label, icon })),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-marian-line/70 bg-white lg:flex">
        <div className="px-5 py-5"><Brand /></div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <AdminNav groups={groups} />
        </div>
        <div className="border-t border-marian-line p-3">
          <AdminUser name={admin.full_name} role={admin.role} />
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-marian-line/60 bg-white px-3 py-2 lg:hidden">
          <MobileNav groups={groups} brand={<Brand size="sm" />} footer={<AdminUser name={admin.full_name} role={admin.role} />} />
          <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
            <MaristaLogo className="w-8" />
            <span className="truncate font-serif text-base font-semibold text-marian">Panel de datos</span>
          </Link>
        </header>
        <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-6 sm:px-6 lg:px-10 lg:pt-10">{children}</main>
        <footer className="border-t border-marian-line/60 bg-white/60 px-4 py-4 text-xs text-ink-muted sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <p>Panel administrativo · Portal de actualización de datos</p>
            <p>Cada acción queda en la auditoría con su nombre y la hora.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
