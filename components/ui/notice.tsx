import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: { box: "border-marian-line bg-marian-soft/60 text-ink", Icon: Info, icon: "text-marian" },
  warning: { box: "border-crown/40 bg-warn-soft text-ink", Icon: AlertTriangle, icon: "text-crown" },
  error: { box: "border-alert/40 bg-alert-soft text-ink", Icon: AlertTriangle, icon: "text-alert" },
  success: { box: "border-ok/40 bg-ok-soft text-ink", Icon: CheckCircle2, icon: "text-ok" },
};

export function Notice({ tone = "info", title, children, className, live }: { tone?: keyof typeof tones; title?: string; children?: ReactNode; className?: string; live?: boolean }) {
  const t = tones[tone];
  return (
    <div role={live ? (tone === "error" ? "alert" : "status") : undefined} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-[15px]", t.box, className)}>
      <t.Icon className={cn("mt-0.5 h-5 w-5 shrink-0", t.icon)} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink/90">{children}</div>}
      </div>
    </div>
  );
}
