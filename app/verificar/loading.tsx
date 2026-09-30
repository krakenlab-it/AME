import { Skeleton } from "@/components/ui/skeleton";

export default function RespondentLoading() {
  return (
    <div role="status" className="mx-auto max-w-2xl space-y-4 px-5 py-16">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}
