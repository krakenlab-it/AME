"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

/** Si una página del panel falla al cargar, la persona ve qué hacer en vez de una pantalla en blanco. */
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Error en el panel administrativo", error.digest ?? "");
  }, [error]);

  return (
    <div role="alert" className="admin-card mx-auto mt-6 flex max-w-xl flex-col items-center gap-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-alert-soft text-alert"><AlertTriangle className="h-6 w-6" aria-hidden /></span>
      <div className="space-y-1">
        <h1 className="page-title !text-2xl">No pudimos cargar esta página</h1>
        <p className="section-lead">Puede ser un corte momentáneo. No se perdió ni se cambió ningún dato. Intenta de nuevo; si sigue igual, vuelve al resumen y avísanos.</p>
        {error.digest && <p className="text-xs text-ink-muted">Código para soporte: {error.digest}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Intentar de nuevo</Button>
        <ButtonLink href="/admin" variant="secondary">Volver al resumen</ButtonLink>
      </div>
    </div>
  );
}
