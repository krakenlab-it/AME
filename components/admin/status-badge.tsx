import { STATUS_LABELS, type PersonStatus } from "@/lib/validation/constants";

export function StatusBadge({ status }: { status: PersonStatus }) {
  const tone: Record<PersonStatus, string> = {
    PENDING: "bg-marian-soft text-ink",
    STARTED: "bg-[#FBF5E6] text-ink",
    COMPLETED: "bg-ok-soft text-ok",
    NEEDS_REVIEW: "bg-alert-soft text-alert",
  };
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tone[status]}`}>{STATUS_LABELS[status]}</span>;
}
