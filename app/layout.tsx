import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/literata/400.css";
import "@fontsource/literata/600.css";
import "./globals.css";
import { MotionProvider } from "@/components/motion/provider";

export const metadata: Metadata = {
  title: "Actualización de información | Agrupación Marista Ecuatoriana",
  description: "Portal seguro para verificar y actualizar su información para la gestión de reclamos y reembolsos.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
  icons: { icon: "/logos/agrupacion-marista.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#005289",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lectura de headers: fuerza render dinámico para que Next aplique el nonce de la CSP.
  await headers();
  return (
    <html lang="es">
      <body>
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
          Saltar al contenido
        </a>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
