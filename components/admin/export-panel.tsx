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
        <legend className="font-semibold">Finalidad del archivo</legend>
        {profiles.map((p) => (
          <label key={p.key} className="flex items-center gap-3 rounded-xl border border-marian-line px-4 py-3 has-[:checked]:border-marian has-[:checked]:bg-marian-soft/50">
            <input type="radio" name="profile" value={p.key} checked={profile === p.key} onChange={() => setProfile(p.key)} className="h-5 w-5 accent-marian" />
            {p.label}
          </label>
        ))}
      </fieldset>
      {current && <p className="text-sm text-ink-muted">Columnas incluidas: {current.columns.join(", ")}.</p>}
      <Field id="purpose" label="Motivo o solicitud que justifica la exportación" required hint="Queda registrado en la auditoría. Ej.: Envío mensual de reembolsos a AIG, solicitud del 30/09.">
        <textarea id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} minLength={10} maxLength={300} required rows={3} className="field-input" />
      </Field>
      <fieldset className="flex gap-4">
        <legend className="mb-2 font-semibold">Formato</legend>
        {(["xlsx", "csv"] as const).map((f) => (
          <label key={f} className="flex items-center gap-2"><input type="radio" checked={format === f} onChange={() => setFormat(f)} className="h-5 w-5 accent-marian" />{f.toUpperCase()}</label>
        ))}
      </fieldset>
      <Button type="submit" loading={busy}><Download className="h-4 w-4" aria-hidden /> Generar archivo para AIG</Button>
      {msg && <Notice tone={msg.tone} live>{msg.text}</Notice>}
    </form>
  );
}
