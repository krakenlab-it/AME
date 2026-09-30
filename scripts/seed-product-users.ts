/**
 * Siembra tres recorridos sintéticos (KAN-106) para ver el panel con datos
 * de punta a punta. No escribe personas reales ni secretos.
 *
 *   npm run seed:product-users                 # solo muestra las fichas
 *   npm run seed:product-users -- --write      # inserta con service_role
 *
 * Requiere en .env.local (nunca en el repositorio):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY, HASH_PEPPER
 *
 * Es idempotente: vuelve a escribir solo las tres fichas de este seed
 * (ids fijos). Si una cédula del seed ya pertenece a otra fila, se detiene
 * sin tocarla. No abre RLS ni cambia Auth.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { getPrivacyConfig } from "../config/privacy";
import { encrypt, keyedHash, randomToken, sha256 } from "../lib/encryption/crypto";
import { renderConsentTexts, type ConsentType } from "../lib/privacy/notice";
import {
  planProductSeed,
  PRODUCT_PERSONAS,
  SEED_BATCH_ID,
  SEED_PERSON_ID_LIST,
  type SeedPlan,
} from "../lib/seed/product-personas";

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    try { process.loadEnvFile(f); } catch { /* archivo opcional */ }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta ${name}. Cárgala en .env.local (service role solo en el servidor).`);
    process.exit(1);
  }
  return value;
}

function printRoster(links: SeedPlan["links"] | null) {
  console.log("Fichas sintéticas KAN-106 (no son personas reales):");
  for (const persona of PRODUCT_PERSONAS) {
    const link = links?.find((item) => item.key === persona.key);
    const code = persona.confirmationCode ?? "—";
    console.log(`- ${persona.currentFirstNames} ${persona.currentLastNames} · cédula ${persona.cedula} · ${persona.status} · ${code}`);
    if (link) {
      const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
      console.log(`  enlace (${link.linkState}): ${base}/verificar/${link.rawToken}`);
    }
  }
  if (!links) {
    console.log("Sin --write no se guarda nada. El enlace vigente de quien está en curso se imprime solo al escribir.");
  }
}

async function activeNoticeVersion(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.from("privacy_notices").select("version").eq("is_active", true).maybeSingle();
  if (error) throw new Error(`No se pudo leer el aviso de privacidad: ${error.message}`);
  if (data?.version) return String(data.version);

  const config = getPrivacyConfig();
  const version = config.privacyNoticeVersion || "1.0";
  const body = "Aviso provisional del seed KAN-106. El texto legal sigue pendiente de revisión.";
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const inserted = await db.from("privacy_notices").insert({
    version,
    body,
    body_hash: bodyHash,
    effective_date: null,
    is_active: true,
  });
  if (inserted.error) throw new Error(`No se pudo publicar el aviso provisional: ${inserted.error.message}`);
  console.log(`No había aviso activo. Se dejó la versión provisional ${version}, sin reemplazar textos legales aprobados.`);
  return version;
}

async function assertNoForeignCedula(db: SupabaseClient, plan: SeedPlan) {
  const hashes = plan.people.map((person) => person.national_id_hash);
  const { data, error } = await db.from("people").select("id, national_id_hash").in("national_id_hash", hashes);
  if (error) throw new Error(`No se pudo comprobar cédulas existentes: ${error.message}`);
  const foreign = (data ?? []).filter((row) => !SEED_PERSON_ID_LIST.includes(String(row.id)));
  if (foreign.length > 0) {
    throw new Error("Una cédula del seed ya está en otra ficha. No se sobrescribe. Revisa la base antes de volver a correr el script.");
  }
}

async function replaceChildren(db: SupabaseClient, plan: SeedPlan) {
  const ids = [...SEED_PERSON_ID_LIST];
  const steps: [string, Record<string, unknown>[]][] = [
    ["respondent_sessions", []],
    ["access_tokens", []],
    ["consents", []],
    ["name_change_history", []],
    ["bank_information", []],
    ["contact_information", []],
    ["audit_logs", []],
  ];
  for (const [table] of steps) {
    const deleted = await db.from(table).delete().in("person_id", ids);
    if (deleted.error) throw new Error(`No se pudo limpiar ${table}: ${deleted.error.message}`);
  }

  const inserts: [string, Record<string, unknown>[]][] = [
    ["contact_information", plan.contacts],
    ["bank_information", plan.banks],
    ["access_tokens", plan.tokens],
    ["respondent_sessions", plan.sessions],
    ["name_change_history", plan.nameChanges],
    ["consents", plan.consents],
    ["audit_logs", plan.audits],
  ];
  for (const [table, rows] of inserts) {
    if (!rows.length) continue;
    const inserted = await db.from(table).insert(rows);
    if (inserted.error) throw new Error(`No se pudo insertar ${table}: ${inserted.error.message}`);
  }
}

async function writeSeed(db: SupabaseClient, plan: SeedPlan) {
  const batch = await db.from("import_batches").upsert(plan.batch, { onConflict: "id" });
  if (batch.error) throw new Error(`No se pudo guardar el lote: ${batch.error.message}`);
  const people = await db.from("people").upsert(plan.people, { onConflict: "id" });
  if (people.error) throw new Error(`No se pudo guardar las fichas: ${people.error.message}`);
  await replaceChildren(db, plan);
}

async function main() {
  loadEnv();
  const write = process.argv.includes("--write");
  if (!write) {
    printRoster(null);
    return;
  }

  requireEnv("ENCRYPTION_KEY");
  requireEnv("HASH_PEPPER");
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const noticeVersion = await activeNoticeVersion(db);
  const texts = renderConsentTexts(getPrivacyConfig());
  const consentTextHashes = Object.fromEntries(
    (Object.keys(texts) as ConsentType[]).map((type) => [type, sha256(texts[type])]),
  ) as Record<ConsentType, string>;

  const plan = planProductSeed({
    crypto: { encrypt, keyedHash, sha256, randomToken },
    noticeVersion,
    consentTextHashes,
  });
  await assertNoForeignCedula(db, plan);
  await writeSeed(db, plan);
  console.log(`Listo. Lote ${SEED_BATCH_ID}. Se reescribieron solo las tres fichas del seed.`);
  printRoster(plan.links);
  console.log("El enlace en claro no queda guardado: en la base solo está su hash. Vuelve a correr --write si necesitas uno nuevo.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "No se pudo sembrar");
  process.exit(1);
});
