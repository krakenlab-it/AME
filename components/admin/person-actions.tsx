"use client";

import { useState, useTransition } from "react";
import { markReviewedAction, regenerateLinkAction, revokeLinksAction } from "@/app/admin/panel-actions";
import { ConfirmDialog } from "@/components/admin/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function PersonActions({ personId, canLinks, canReview, needsReview }: { personId: string; canLinks: boolean; canReview: boolean; needsReview: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<"regenerate" | "revoke" | null>(null);

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
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming("regenerate")}>Generar nuevo enlace</Button>
            <Button variant="danger" disabled={pending} onClick={() => setConfirming("revoke")}>Revocar enlaces</Button>
          </>
        )}
        {canReview && needsReview && (
          <Button disabled={pending} onClick={() => run(async () => {
            const r = await markReviewedAction(personId);
            setMessage(r.error ? { tone: "error", text: r.error } : { tone: "success", text: "Registro marcado como revisado." });
          })}>Marcar como revisado</Button>
        )}
      </div>
      <ConfirmDialog
        open={confirming === "regenerate"}
        title="¿Generar un nuevo enlace?"
        tone="primary"
        confirmLabel="Generar nuevo enlace"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          run(async () => {
            const r = await regenerateLinkAction(personId);
            if (r.error) setMessage({ tone: "error", text: r.error });
            else { setLink(r.url ?? null); setCopied(false); setMessage({ tone: "success", text: "Nuevo enlace generado. Cópialo ahora: no se volverá a mostrar." }); }
          });
        }}
      >
        Se desactivarán los enlaces anteriores de esta persona y se creará uno nuevo. El enlace nuevo se muestra una sola vez.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "revoke"}
        title="¿Revocar los enlaces?"
        confirmLabel="Revocar enlaces"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          run(async () => {
            const r = await revokeLinksAction(personId);
            setLink(null);
            setMessage(r.error ? { tone: "error", text: r.error } : { tone: "success", text: `Enlaces revocados: ${r.revoked ?? 0}.` });
          });
        }}
      >
        Se revocan todos los enlaces vigentes de esta persona. Dejará de poder entrar con ellos hasta que le generes uno nuevo.
      </ConfirmDialog>
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
