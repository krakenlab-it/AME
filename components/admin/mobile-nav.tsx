"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AdminNav, type AdminNavGroup } from "@/components/admin/admin-nav";

/** Menú deslizable para pantallas chicas. Usa <dialog> modal: atrapa el foco, Escape lo cierra y el foco vuelve al botón. */
export function MobileNav({ groups, brand, footer }: { groups: AdminNavGroup[]; brand: ReactNode; footer: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (query.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-marian transition-colors hover:bg-marian-soft"
      >
        <Menu className="h-6 w-6" aria-hidden />
        <span className="sr-only">Abrir el menú</span>
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClick={(event) => {
          if (event.target === ref.current) setOpen(false);
        }}
        className="fixed inset-y-0 left-0 !m-0 h-dvh max-h-none w-80 max-w-[88vw] bg-white p-0 text-ink shadow-xl backdrop:bg-ink/50"
      >
        {open && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-marian-line/70 px-4 py-3">
              <p id={titleId} className="sr-only">Menú del panel administrativo</p>
              {brand}
              <button type="button" onClick={() => setOpen(false)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-ink-muted hover:bg-marian-soft">
                <X className="h-6 w-6" aria-hidden />
                <span className="sr-only">Cerrar el menú</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <AdminNav groups={groups} label="Administración (móvil)" />
            </div>
            <div className="border-t border-marian-line p-3">{footer}</div>
          </div>
        )}
      </dialog>
    </>
  );
}
