import { CheckCircle2, CircleDashed, ClipboardCheck, Play, type LucideIcon } from "lucide-react";
import { STATUS_LABELS, type PersonStatus } from "@/lib/validation/constants";

const TONE: Record<PersonStatus, { box: string; Icon: LucideIcon }> = {
  PENDING: { box: "bg-marian-soft text-ink", Icon: CircleDashed },
  STARTED: { box: "bg-warn-soft text-ink", Icon: Play },
  COMPLETED: { box: "bg-ok-soft text-ok", Icon: CheckCircle2 },
  NEEDS_REVIEW: { box: "bg-alert-soft text-alert", Icon: ClipboardCheck },
};

/** El estado se distingue por icono y texto, no solo por color. */
export function StatusBadge({ status }: { status: PersonStatus }) {
  const { box, Icon } = TONE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] font-semibold ${box}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}
