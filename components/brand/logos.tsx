import Image from "next/image";
import { cn } from "@/lib/utils";

export function MaristaLogo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <Image
      src="/logos/agrupacion-marista.png"
      alt="Agrupación Marista Ecuatoriana"
      width={510}
      height={462}
      priority
      className={cn("h-auto", inverted && "brightness-0 invert", className)}
    />
  );
}

/** Franja de aliados: Unibrokers (gestión del seguro) y Kraken Lab (tecnología). */
export function PartnerStrip({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-8 gap-y-4", className)}>
      <div className="flex items-center gap-3">
        <Image src="/logos/unibrokers.png" alt="Unibrokers Seguros" width={157} height={157} className="h-10 w-10 rounded-lg" />
        <p className="text-sm leading-tight text-ink-muted">
          Gestión del seguro
          <br />
          <span className="font-semibold text-ink">Unibrokers Seguros</span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Image src="/logos/kraken-lab.png" alt="Kraken Lab" width={626} height={207} className="h-7 w-auto" />
        <p className="text-sm leading-tight text-ink-muted">Plataforma tecnológica</p>
      </div>
    </div>
  );
}
