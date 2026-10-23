"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { TERMINOS_IDENTIFICACION_TEXTO, TERMINOS_IDENTIFICACION_TITULO } from "@/lib/content/terminos-identificacion";

const FOCUSABLE = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

/** Texto completo del mecanismo. Atrapa el foco, se cierra con Escape y se puede desplazar en el celular. */
export function TermsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Cerrar términos" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(85vh,40rem)] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-marian-line px-5 py-4">
          <h2 id={titleId} className="text-xl leading-snug">{TERMINOS_IDENTIFICACION_TITULO}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-marian hover:bg-marian-soft"
          >
            <X className="h-5 w-5" aria-hidden />
            <span className="sr-only">Cerrar</span>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{TERMINOS_IDENTIFICACION_TEXTO}</p>
        </div>
      </div>
    </div>
  );
}
