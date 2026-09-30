"use client";

import { useActionState } from "react";
import { publishNoticeAction, type NoticeState } from "@/app/admin/panel-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function NoticeEditor({ current, suggestedVersion }: { current: string; suggestedVersion: string }) {
  const [state, action, pending] = useActionState<NoticeState, FormData>(publishNoticeAction, {});
  return (
    <form action={action} className="sheet space-y-5 p-6">
      <h2 className="text-xl">Publicar nueva versión</h2>
      <p className="text-sm text-ink-muted">
        Puedes usar variables que se reemplazan con la configuración legal: {"{{responsibleLegalName}}"}, {"{{recipientLegalName}}"},
        {" {{privacyEmail}}"}, {"{{retentionPeriod}}"}, {"{{retentionReason}}"}. Las personas que ya enviaron su información conservan
        la evidencia de la versión que aceptaron.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="version" label="Versión" required><input id="version" name="version" defaultValue={suggestedVersion} className="field-input" required /></Field>
        <Field id="effective_date" label="Vigente desde"><input id="effective_date" name="effective_date" type="date" className="field-input" /></Field>
      </div>
      <Field id="body" label="Texto del aviso" required>
        <textarea id="body" name="body" defaultValue={current} rows={16} className="field-input font-serif text-[15px] leading-relaxed" required />
      </Field>
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      {state.ok && <Notice tone="success" live>Versión publicada. Se mostrará a partir de ahora en el portal.</Notice>}
      <Button type="submit" loading={pending}>Publicar versión</Button>
    </form>
  );
}
