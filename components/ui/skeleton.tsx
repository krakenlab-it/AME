import { cn } from "@/lib/utils";

/** Marcador de carga. Es decorativo: el contenedor debe anunciar el estado con role="status". */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-marian-line/60", className)} />;
}

export function PageSkeleton({ label = "Cargando…", cards = 0, rows = 6 }: { label?: string; cards?: number; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-8">
      <span className="sr-only">{label}</span>
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      {cards > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      )}
      <div className="sheet space-y-3 p-5">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    </div>
  );
}
