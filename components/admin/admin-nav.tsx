"use client";

import { FileDown, FileUp, History, LayoutDashboard, ScrollText, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type AdminNavIcon = "summary" | "import" | "export" | "audit" | "notice";

export interface AdminNavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: AdminNavIcon;
}

const ICONS: Record<AdminNavIcon, LucideIcon> = {
  summary: LayoutDashboard,
  import: FileUp,
  export: FileDown,
  audit: History,
  notice: ScrollText,
};

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/personas");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Navegación del panel. En pantallas grandes es una lista vertical dentro de la barra lateral;
 * en teléfonos es una barra inferior fija con icono y nombre corto (alcance con el pulgar).
 */
export function AdminNav({ items, variant }: { items: AdminNavItem[]; variant: "sidebar" | "tabbar" }) {
  const pathname = usePathname();
  const sidebar = variant === "sidebar";
  return (
    <nav aria-label={sidebar ? "Administración" : "Administración (móvil)"}>
      <ul className={cn(sidebar ? "space-y-1" : "grid auto-cols-fr grid-flow-col")}>
        {items.map((item) => {
          const current = isCurrent(pathname, item.href);
          const Icon = ICONS[item.icon];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "group flex items-center font-medium transition-colors duration-200",
                  sidebar
                    ? "min-h-[46px] gap-3 rounded-xl px-3.5 text-[15px]"
                    : "min-h-[60px] flex-col justify-center gap-1 px-1 text-[12px] leading-tight",
                  sidebar && (current ? "bg-marian text-white shadow-sm" : "text-ink hover:bg-marian-soft"),
                  !sidebar && (current ? "text-marian" : "text-ink-muted hover:text-marian"),
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center transition-transform duration-200 group-hover:scale-105",
                    !sidebar && "h-8 w-14 rounded-full transition-colors",
                    !sidebar && (current ? "bg-marian-soft" : "bg-transparent"),
                  )}
                >
                  <Icon className={sidebar ? "h-5 w-5" : "h-[22px] w-[22px]"} aria-hidden />
                </span>
                <span className={cn(!sidebar && current && "font-semibold")}>{sidebar ? item.label : item.shortLabel}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
