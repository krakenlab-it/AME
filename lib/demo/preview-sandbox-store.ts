import "server-only";
import { gzipSync, gunzipSync } from "node:zlib";
import { cookies } from "next/headers";
import { isDemoMode, previewSandboxEmptyPeople } from "@/lib/demo-mode";
import type { MemoryRepo } from "@/lib/database/memory-repo";
import { isMemoryRepo } from "@/lib/database/memory-repo";
import type { Repo } from "@/lib/database/types";
import type { AccessTokenRecord, PersonRecord } from "@/lib/database/types";
import { encrypt, decrypt } from "@/lib/encryption/crypto";
import { ADMIN_ABSOLUTE_HOURS, cookieOptions } from "@/lib/security/cookies";
import { ensurePreviewOutreachAnchor } from "@/lib/seed/preview-outreach-anchor";
import { cache } from "react";

const COOKIE_BASE = () => (process.env.NODE_ENV === "production" ? "__Host-ame_prv" : "ame_prv");
const CHUNK_BYTES = 3_500;
const SNAPSHOT_VERSION = 1;

type PersonSnap = PersonRecord & { review_reasons: string[]; retention_until: string | null };

interface PreviewSandboxSnapshot {
  v: number;
  people: PersonSnap[];
  tokens: AccessTokenRecord[];
  outreach: [string, string][];
}

export function previewSandboxPersistenceEnabled(): boolean {
  return isDemoMode() && previewSandboxEmptyPeople();
}

/** Una vez por petición: hidrata el MemoryRepo desde la cookie del navegador (Preview serverless). */
export const loadPreviewSandboxRepo = cache(async (): Promise<void> => {
  if (!previewSandboxPersistenceEnabled()) return;
  const { getRepo } = await import("@/lib/database");
  const repo = getRepo();
  if (!isMemoryRepo(repo)) return;
  const snap = await readSnapshotFromCookies();
  if (snap) applyPreviewSandboxSnapshot(repo, snap);
  ensurePreviewOutreachAnchor(repo);
});

export async function persistPreviewSandboxRepo(repo: Repo): Promise<void> {
  if (!previewSandboxPersistenceEnabled() || !isMemoryRepo(repo)) return;
  const payload = serializePreviewSandboxSnapshot(repo);
  await writeSnapshotToCookies(payload);
}

export function serializePreviewSandboxSnapshot(repo: MemoryRepo): PreviewSandboxSnapshot {
  return {
    v: SNAPSHOT_VERSION,
    people: [...repo.people.values()],
    tokens: [...repo.tokens.values()],
    outreach: [...repo.outreachEmails.entries()],
  };
}

export function applyPreviewSandboxSnapshot(repo: MemoryRepo, snap: PreviewSandboxSnapshot): void {
  repo.people.clear();
  repo.tokens.clear();
  repo.outreachEmails.clear();
  for (const person of snap.people) repo.people.set(person.id, person);
  for (const token of snap.tokens) repo.tokens.set(token.id, token);
  for (const [id, email] of snap.outreach) repo.outreachEmails.set(id, email);
}

function encodeSnapshot(snap: PreviewSandboxSnapshot): string {
  const json = JSON.stringify(snap);
  const compressed = gzipSync(Buffer.from(json, "utf8"));
  return encrypt(compressed.toString("base64"));
}

function decodeSnapshot(blob: string): PreviewSandboxSnapshot | null {
  try {
    const raw = decrypt(blob);
    const json = gunzipSync(Buffer.from(raw, "base64")).toString("utf8");
    const snap = JSON.parse(json) as PreviewSandboxSnapshot;
    if (snap.v !== SNAPSHOT_VERSION || !Array.isArray(snap.people)) return null;
    return snap;
  } catch {
    return null;
  }
}

async function readSnapshotFromCookies(): Promise<PreviewSandboxSnapshot | null> {
  const store = await cookies();
  const base = COOKIE_BASE();
  const single = store.get(base)?.value;
  if (single) return decodeSnapshot(single);
  const countRaw = store.get(`${base}_n`)?.value;
  if (!countRaw) return null;
  const count = Number(countRaw);
  if (!Number.isFinite(count) || count < 1 || count > 40) return null;
  let blob = "";
  for (let i = 0; i < count; i++) {
    const part = store.get(`${base}_${i}`)?.value;
    if (!part) return null;
    blob += part;
  }
  return decodeSnapshot(blob);
}

async function writeSnapshotToCookies(snap: PreviewSandboxSnapshot): Promise<void> {
  const store = await cookies();
  const base = COOKIE_BASE();
  const blob = encodeSnapshot(snap);
  const maxAge = ADMIN_ABSOLUTE_HOURS * 3600;
  const opts = cookieOptions(maxAge);
  const clearChunk = (i: number) => store.set(`${base}_${i}`, "", { ...opts, maxAge: 0 });

  if (blob.length <= 3_800) {
    store.set(base, blob, opts);
    store.set(`${base}_n`, "", { ...opts, maxAge: 0 });
    for (let i = 0; i < 40; i++) clearChunk(i);
    return;
  }

  const chunks: string[] = [];
  for (let i = 0; i < blob.length; i += CHUNK_BYTES) chunks.push(blob.slice(i, i + CHUNK_BYTES));
  store.set(base, "", { ...opts, maxAge: 0 });
  for (let i = 0; i < 40; i++) {
    const name = `${base}_${i}`;
    if (i < chunks.length) store.set(name, chunks[i]!, opts);
    else clearChunk(i);
  }
  store.set(`${base}_n`, String(chunks.length), opts);
}
