"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function ExportPanel({ profiles }: { profiles: { key: string; label: string; columns: string[] }[] }) {
  const [profile, setProfile] = useState(profiles[0]?.key ?? "");
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const current = profiles.find((p) => p.key === profile);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, format, purpose }),
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg({ tone: "error", text: data.error ?? "No se pudo generar el archivo." });
        return;
      }
      const count = res.headers.get("X-Record-Count") ?? "0";
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `AIG.${format}`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg({ tone: "success", text: `Archivo generado con ${count} registros. La exportación quedó registrada en la auditoría.` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="sheet space-y-5 p-6">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-[15px] font-semibold">1. ¿Para qué es el archivo?</legend>
        {profiles.map((p) => (
          <label key={p.key} className="choice">
            <input type="radio" name="profile" value={p.key} checked={profile === p.key} onChange={() => setProfile(p.key)} className="h-5 w-5 shrink-0 accent-marian" />
            {p.label}
          </label>
        ))}
      </fieldset>
      {current && <p className="text-sm text-ink-muted"><span className="font-semibold">Columnas incluidas:</span> {current.columns.join(", ")}.</p>}
      <Field id="purpose" label="2. Motivo o solicitud que justifica la exportación" required hint="Queda registrado en la auditoría. Ej.: Envío mensual de reembolsos a AIG, solicitud del 30/09.">
        <textarea id="purpose" aria-describedby="purpose-hint" value={purpose} onChange={(e) => setPurpose(e.target.value)} minLength={10} maxLength={300} required rows={3} className="field-input" />
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-[15px] font-semibold">3. Formato</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["xlsx", "Excel (.xlsx)"], ["csv", "Texto separado por comas (.csv)"]] as const).map(([f, label]) => (
            <label key={f} className="choice">
              <input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} className="h-5 w-5 shrink-0 accent-marian" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" loading={busy}><Download className="h-4 w-4" aria-hidden /> {busy ? "Generando…" : "Generar archivo para AIG"}</Button>
      {msg && <Notice tone={msg.tone} live>{msg.text}</Notice>}
    </form>
  );
}
