import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/admin/auth-actions";
import { ROLE_LABELS, ROLE_SCOPE } from "@/lib/admin/labels";
import type { AdminRole } from "@/lib/security/rbac";

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase() || "?";
}

/** Quién está dentro, con qué rol, y el botón de salir. */
export function AdminUser({ name, role }: { name: string; role: AdminRole }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 px-2 pt-1">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marian text-sm font-semibold text-white">{initials(name)}</span>
        <p className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-ink">{name}</span>
          <span className="block text-sm text-ink-muted">{ROLE_LABELS[role]}</span>
        </p>
      </div>
      <p className="px-2 text-xs leading-snug text-ink-muted">{ROLE_SCOPE[role]}</p>
      <form action={logoutAction}>
        <button type="submit" className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 text-[15px] font-medium text-ink transition-colors hover:bg-marian-soft">
          <LogOut className="h-5 w-5" aria-hidden />
          Salir
          <span className="sr-only"> de la sesión de {name}</span>
        </button>
      </form>
    </div>
  );
}
