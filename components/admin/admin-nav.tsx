"use client";

import { FileDown, FileUp, History, LayoutDashboard, ScrollText, UserPlus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type AdminNavIcon = "summary" | "import" | "export" | "audit" | "notice" | "invite";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: AdminNavIcon;
}

export interface AdminNavGroup {
  /** Título del grupo. `null` deja el grupo sin título (el Resumen va solo arriba). */
  label: string | null;
  items: AdminNavItem[];
}

const ICONS: Record<AdminNavIcon, LucideIcon> = {
  summary: LayoutDashboard,
  import: FileUp,
  export: FileDown,
  audit: History,
  notice: ScrollText,
  invite: UserPlus,
};

export function isCurrent(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/personas");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Navegación del panel, agrupada por tarea. La usan la barra lateral (escritorio) y el menú deslizable (teléfono).
 * La página actual se marca con `aria-current="page"`, una barra de color y un fondo, no solo con color.
 */
export function AdminNav({ groups, label = "Administración" }: { groups: AdminNavGroup[]; label?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="space-y-5">
      {groups.map((group, index) => {
        const headingId = group.label ? `${label.replace(/\s+/g, "-").toLowerCase()}-grupo-${index}` : undefined;
        return (
          <div key={group.label ?? "inicio"} className="space-y-1">
            {group.label && <p id={headingId} className="px-3.5 pb-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">{group.label}</p>}
            <ul aria-labelledby={headingId} className="space-y-1">
              {group.items.map((item) => {
                const current = isCurrent(pathname, item.href);
                const Icon = ICONS[item.icon];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "group relative flex min-h-[46px] items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium transition-colors",
                        current ? "bg-marian-soft font-semibold text-marian" : "text-ink hover:bg-marian-soft/60",
                      )}
                    >
                      {current && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-marian" />}
                      <Icon className="h-5 w-5 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
