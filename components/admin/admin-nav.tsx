"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface AdminNavItem {
  href: string;
  label: string;
}

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/personas");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegación del panel: marca la sección actual (aria-current) y se desplaza en horizontal en pantallas pequeñas. */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Administración" className="-mx-5 overflow-x-auto px-5 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex min-w-max gap-1 md:min-w-0 md:flex-wrap">
        {items.map((item) => {
          const current = isCurrent(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[44px] items-center whitespace-nowrap rounded-lg px-3.5 text-[15px] font-medium transition-colors",
                  current ? "bg-marian text-white" : "text-ink hover:bg-marian-soft",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
