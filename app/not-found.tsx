import Link from "next/link";

export default function NotFound() {
  return (
    <main id="contenido" className="mx-auto max-w-lg px-5 py-24 text-center">
      <h1 className="text-3xl">Página no encontrada</h1>
      <p className="mt-4 text-ink-muted">Si recibiste un enlace personal, ábrelo directamente desde el mensaje original.</p>
      <Link href="/" className="mt-8 inline-block font-semibold text-marian underline underline-offset-4">Ir al inicio</Link>
    </main>
  );
}
