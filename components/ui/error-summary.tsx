"use client";

import { AlertTriangle } from "lucide-react";

export interface SummaryItem {
  id: string;
  message: string;
  label: string;
}

/**
 * Resumen de errores al inicio del paso. Cada elemento es un botón que lleva el foco
 * al campo con el problema (útil con teclado, lector de pantalla y celular).
 */
export function ErrorSummary({ items, onSelect }: { items: SummaryItem[]; onSelect: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-alert/40 bg-alert-soft px-4 py-3 text-[15px]" aria-labelledby="error-summary-title">
      <p id="error-summary-title" className="flex items-center gap-2 font-semibold text-ink">
        <AlertTriangle className="h-5 w-5 text-alert" aria-hidden />
        {items.length === 1 ? "Hay 1 campo por corregir" : `Hay ${items.length} campos por corregir`}
      </p>
      <ul className="mt-2 space-y-1 pl-7">
        {items.map((item) => (
          <li key={item.id} className="list-disc">
            <button type="button" onClick={() => onSelect(item.id)} className="text-left font-medium text-alert underline underline-offset-4">
              {item.label}: {item.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
