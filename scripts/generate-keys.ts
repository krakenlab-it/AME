/**
 * Genera secretos aleatorios para .env / Vercel. Uso: npm run keys:generate
 * Guárdalos en un gestor de secretos. Si pierdes ENCRYPTION_KEY, los datos cifrados son irrecuperables.
 */
import { randomBytes } from "node:crypto";

console.log(`ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
console.log(`HASH_PEPPER=${randomBytes(48).toString("base64url")}`);
console.log(`CRON_SECRET=${randomBytes(32).toString("base64url")}`);
