const STEPS = [
  {
    title: "Ingresa tu correo",
    body: "Te enviaremos un código de verificación para confirmar que el correo es tuyo.",
  },
  {
    title: "Confirma tu identidad con tu cédula",
    body: "Escribe tu número de cédula. Es obligatorio. El código dactilar del reverso de tu cédula física es opcional.",
  },
  {
    title: "Completa tus datos",
    body: "Actualiza tu correo, teléfono y cuenta bancaria para los depósitos.",
  },
] as const;

/** Los tres pasos del ingreso. El segundo deja la cédula como obligatoria y el código dactilar como opcional. */
export function HowItWorks() {
  return (
    <section aria-labelledby="como-funciona" className="mt-8 max-w-md">
      <h2 id="como-funciona" className="text-lg">Cómo funciona</h2>
      <ol className="mt-4 space-y-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marian-soft text-sm font-semibold text-marian" aria-hidden>
              {index + 1}
            </span>
            <span>
              <span className="block font-semibold">{step.title}</span>
              <span className="mt-1 block text-[15px] text-ink-muted">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
