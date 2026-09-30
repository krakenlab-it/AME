import { cn } from "@/lib/utils";

export const STEPS = ["Identificación", "Verificación", "Contacto", "Información bancaria", "Privacidad", "Revisión", "Confirmación"] as const;

function Star({ state }: { state: "done" | "current" | "todo" }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("transition-all", state === "current" ? "h-7 w-7" : "h-5 w-5")} aria-hidden>
      <path
        d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
        className={cn(
          state === "done" && "fill-crown stroke-crown-deep",
          state === "current" && "fill-marian stroke-marian",
          state === "todo" && "fill-transparent stroke-ink-faint",
        )}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Progreso en forma de corona de estrellas (eco de la corona mariana del logo).
 * Accesible: lista ordenada con aria-current y texto "Paso X de 7" visible.
 */
export function StepCrown({ current }: { current: number }) {
  const total = STEPS.length;
  return (
    <div className="flex flex-col items-center gap-2">
      <ol className="flex items-end gap-1.5 sm:gap-3" aria-label="Progreso del formulario">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < current ? "done" : n === current ? "current" : "todo";
          const lift = Math.round(Math.sin((i / (total - 1)) * Math.PI) * 10);
          return (
            <li key={label} style={{ transform: `translateY(-${lift}px)` }} aria-current={state === "current" ? "step" : undefined}>
              <Star state={state} />
              <span className="sr-only">
                {label}: {state === "done" ? "completado" : state === "current" ? "paso actual" : "pendiente"}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-[15px] text-ink-muted" aria-live="polite">
        Paso {current} de {total} <span aria-hidden>·</span> <span className="font-semibold text-ink">{STEPS[current - 1]}</span>
      </p>
    </div>
  );
}
