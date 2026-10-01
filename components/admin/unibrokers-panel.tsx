"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function UnibrokersPanel({ columns, hold }: { columns: string[]; hold: string }) {
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "warning" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/unibrokers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, purpose }),
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg({ tone: "error", text: data.error ?? "No se pudo generar la carga." });
        return;
      }
      const count = res.headers.get("X-Record-Count") ?? "0";
      const sync = res.headers.get("X-Unibrokers-Sync") ?? "local";
      const detail = decodeURIComponent(res.headers.get("X-Unibrokers-Detail") ?? "");
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `Unibrokers_contacto.${format}`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const tone = sync === "sent" ? "success" : "warning";
      setMsg({ tone, text: `Paquete con ${count} personas. ${detail || hold}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="sheet space-y-5 p-6">
      <p className="text-sm text-ink-muted"><span className="font-semibold">Columnas del paquete:</span> {columns.join(", ")}.</p>
      <Field id="unibrokers-purpose" label="Motivo de esta carga" required hint="Queda en la auditoría. Ej.: Entrega semanal de contacto a operaciones de Unibrokers.">
        <textarea id="unibrokers-purpose" aria-describedby="unibrokers-purpose-hint" value={purpose} onChange={(event) => setPurpose(event.target.value)} minLength={10} maxLength={300} required rows={3} className="field-input" />
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-[15px] font-semibold">Formato del paquete</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["xlsx", "Excel (.xlsx)"], ["csv", "Texto separado por comas (.csv)"]] as const).map(([value, label]) => (
            <label key={value} className="choice">
              <input type="radio" name="unibrokers-format" value={value} checked={format === value} onChange={() => setFormat(value)} className="h-5 w-5 shrink-0 accent-marian" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" loading={busy}><Download className="h-4 w-4" aria-hidden /> {busy ? "Generando…" : "Descargar carga para Unibrokers"}</Button>
      {msg && <Notice tone={msg.tone} live>{msg.text}</Notice>}
    </form>
  );
}
