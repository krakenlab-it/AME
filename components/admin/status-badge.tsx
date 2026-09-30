import { STATUS_LABELS, type PersonStatus } from "@/lib/validation/constants";

export function StatusBadge({ status }: { status: PersonStatus }) {
  const tone: Record<PersonStatus, string> = {
    PENDING: "bg-marian-soft text-ink",
    STARTED: "bg-warn-soft text-ink",
    COMPLETED: "bg-ok-soft text-ok",
    NEEDS_REVIEW: "bg-alert-soft text-alert",
  };
  return <span className={`inline-block rounded-md px-2.5 py-1 whitespace-nowrap text-[13px] font-semibold ${tone[status]}`}>{STATUS_LABELS[status]}</span>;
}
