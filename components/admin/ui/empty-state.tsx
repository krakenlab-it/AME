import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-marian-soft text-marian"><Icon className="h-6 w-6" aria-hidden /></span>
      <p className="font-serif text-lg font-semibold text-ink">{title}</p>
      {children && <div className="max-w-md text-[15px] text-ink-muted">{children}</div>}
      {action}
    </div>
  );
}
