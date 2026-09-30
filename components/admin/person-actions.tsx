"use client";

import { useState, useTransition } from "react";
import { markReviewedAction, regenerateLinkAction, revokeLinksAction } from "@/app/admin/panel-actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function PersonActions({ personId, canLinks, canReview, needsReview }: { personId: string; canLinks: boolean; canReview: boolean; needsReview: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage({ tone: "error", text: "No pudimos copiar automáticamente. Selecciona el enlace y cópialo a mano." });
    }
  };

  const run = (fn: () => Promise<void>) => start(async () => { setMessage(null); await fn(); });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canLinks && (
          <>
            <Button variant="secondary" disabled={pending} onClick={() => run(async () => {
              if (!confirm("Se desactivarán los enlaces anteriores y se creará uno nuevo. ¿Continuar?")) return;
              const r = await regenerateLinkAction(personId);
              if (r.error) setMessage({ tone: "error", text: r.error });
              else { setLink(r.url ?? null); setCopied(false); setMessage({ tone: "success", text: "Nuevo enlace generado. Cópialo ahora: no se volverá a mostrar." }); }
            })}>Generar nuevo enlace</Button>
            <Button variant="danger" disabled={pending} onClick={() => run(async () => {
              if (!confirm("¿Revocar todos los enlaces vigentes de esta persona?")) return;
              const r = await revokeLinksAction(personId);
              setLink(null);
              setMessage(r.error ? { tone: "error", text: r.error } : { tone: "success", text: `Enlaces revocados: ${r.revoked ?? 0}.` });
            })}>Revocar enlaces</Button>
          </>
        )}
        {canReview && needsReview && (
          <Button disabled={pending} onClick={() => run(async () => {
            const r = await markReviewedAction(personId);
            setMessage(r.error ? { tone: "error", text: r.error } : { tone: "success", text: "Registro marcado como revisado." });
          })}>Marcar como revisado</Button>
        )}
      </div>
      {message && <Notice tone={message.tone} live>{message.text}</Notice>}
      {link && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-marian-line bg-white p-3">
          <code className="min-w-0 flex-1 break-all text-sm">{link}</code>
          <Button variant="secondary" size="sm" onClick={copyLink}>{copied ? "Copiado" : "Copiar enlace"}</Button>
        </div>
      )}
    </div>
  );
}
