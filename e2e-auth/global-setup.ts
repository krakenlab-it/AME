import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { AUTH_E2E_PORT } from "../playwright.auth.config";
import { readLocalStack } from "./local-stack";
import { ADMIN_A, ADMIN_B, ADMIN_EMAILS } from "./helpers";

async function resetLocalState(apiUrl: string, serviceRoleKey: string, mailUrl: string) {
  const db = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const listed = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const user of listed.data?.users ?? []) {
    if (user.email && (ADMIN_EMAILS.includes(user.email) || user.email.endsWith("@ame.test"))) {
      await db.from("admin_users").delete().eq("auth_user_id", user.id);
      await db.auth.admin.deleteUser(user.id);
    }
  }
  await db.from("admin_users").delete().like("email", "%@ame.test");
  await db.from("rate_limits").delete().like("bucket", "admin-%");
  await fetch(`${mailUrl}/api/v1/messages`, { method: "DELETE" });
}

async function waitForHealth(url: string, child: ChildProcess) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("El servidor de pruebas terminó antes de arrancar.");
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // todavía arrancando
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("El servidor de pruebas no respondió a tiempo.");
}

export default async function globalSetup() {
  const stack = readLocalStack();
  await resetLocalState(stack.apiUrl, stack.serviceRoleKey, stack.mailUrl);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "",
    NEXT_TELEMETRY_DISABLED: "1",
    DEMO_MODE: "false",
    PORTAL_E2E: "",
    SEED_PRODUCT_USERS: "",
    APP_STAGE: "development",
    VERCEL_ENV: "",
    SUPABASE_URL: stack.apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: stack.serviceRoleKey,
    NEXT_PUBLIC_SUPABASE_URL: stack.apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: stack.anonKey,
    // Claves desechables: se generan en cada corrida y no salen de esta máquina.
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    HASH_PEPPER: randomBytes(48).toString("base64url"),
    // Dominio sin www a propósito: el portal tiene que enviar siempre la base canónica con www.
    APP_BASE_URL: "http://ame.test:3000",
    ADMIN_BOOTSTRAP_EMAILS: `${ADMIN_A}, ${ADMIN_B}`,
  };

  const child = spawn("npx", ["next", "start", "--hostname", "0.0.0.0", "--port", String(AUTH_E2E_PORT)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const stop = () => {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // ya terminó
      }
    }
  };
  const log: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => log.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => log.push(chunk.toString()));
  try {
    await waitForHealth(`http://127.0.0.1:${AUTH_E2E_PORT}/api/health`, child);
  } catch (error) {
    stop();
    console.error(log.join("").slice(-4000));
    throw error;
  }

  return async () => {
    stop();
    await new Promise((resolve) => setTimeout(resolve, 500));
  };
}
