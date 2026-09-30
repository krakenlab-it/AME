import { base32Encode } from "@/lib/security/totp";
import type { ProductPersonaFixture } from "@/lib/seed/product-personas";

/**
 * Datos fijos del seed sintético cuando el portal corre en memoria (DEMO_MODE).
 * No son secretos de producción y no se usan si el entorno es producción.
 * El script `seed:product-users --write` sigue siendo el camino con service_role
 * contra una base real; CI no lo llama porque eso exigiría claves.
 */
export const PRODUCT_SEED_TOKENS: Record<ProductPersonaFixture["key"], string> = {
  completed: "kan106completedlinktoken000000000001",
  needsReview: "kan106reviewlinktoken00000000000002",
  started: "kan106startedlinktoken00000000000003",
};

export const PRODUCT_SEED_DEMO_ADMIN = {
  email: "admin@demo.local",
  password: "Demo-portal-2026",
} as const;

/** Secreto TOTP solo para el panel de demostración cuando el seed está activo. */
export const PRODUCT_SEED_DEMO_TOTP_SECRET = base32Encode(Buffer.from("kan-106-demo-totp-key"));
