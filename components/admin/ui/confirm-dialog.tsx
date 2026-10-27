"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Confirmación modal con el elemento nativo <dialog>: atrapa el foco, se cierra con Escape y devuelve el foco al botón que la abrió.
 * El foco inicial queda en "Cancelar" para que Enter nunca ejecute la acción por descuido.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "danger",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onCancel();
      }}
      className="fixed inset-0 !m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-2xl border border-marian-line bg-white p-0 text-ink shadow-xl backdrop:bg-ink/50"
    >
      {open && (
        <div className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <span className={tone === "danger" ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-alert-soft text-alert" : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marian-soft text-marian"}>
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-2">
              <h2 id={titleId} className="section-title">{title}</h2>
              <div id={descriptionId} className="section-lead">{children}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" size="sm" autoFocus onClick={onCancel}>{cancelLabel}</Button>
            <Button type="button" variant={tone === "danger" ? "danger" : "primary"} size="sm" loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
