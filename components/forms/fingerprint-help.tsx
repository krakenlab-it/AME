export function FingerprintHelp() {
  return (
    <details className="rounded-xl border border-marian-line bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-[15px] font-semibold text-marian [&::-webkit-details-marker]:hidden">
        ¿Dónde encuentro mi código dactilar?
      </summary>
      <div className="space-y-4 border-t border-marian-line px-4 py-4">
        <p className="text-sm text-ink-muted">
          Dale la vuelta a la cédula. El código está en la esquina superior derecha del reverso: una letra, 4 números, una letra y 4 números. En la cédula anterior y en la electrónica está en esa misma zona.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <figure className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ayuda/cedula-anterior.svg"
              alt="Dibujo simplificado del reverso de una cédula anterior. El código de ejemplo V1234V5678 está resaltado arriba a la derecha."
              width={360}
              height={220}
              className="w-full rounded-lg border border-marian-line bg-white"
            />
            <figcaption className="text-sm text-ink-muted">Cédula anterior, reverso.</figcaption>
          </figure>
          <figure className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ayuda/cedula-electronica.svg"
              alt="Dibujo simplificado del reverso de una cédula electrónica. El código de ejemplo V1234V5678 está resaltado arriba a la derecha."
              width={360}
              height={230}
              className="w-full rounded-lg border border-marian-line bg-white"
            />
            <figcaption className="text-sm text-ink-muted">Cédula electrónica, reverso.</figcaption>
          </figure>
        </div>
        <p className="text-xs text-ink-muted">Ilustraciones originales con datos ficticios. No son el documento real.</p>
      </div>
    </details>
  );
}
