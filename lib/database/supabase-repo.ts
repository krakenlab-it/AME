import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PersonStatus } from "@/lib/validation/constants";
import { PERSON_STATUSES } from "@/lib/validation/constants";
import {
  RepoError,
  type AccessTokenRecord,
  type AdminUserRecord,
  type AuditRow,
  type ExportSourceRow,
  type InsuredRecord,
  type LinkMailTarget,
  type ManualPersonPatch,
  type NoticeRecord,
  type PersonDetail,
  type UnibrokersSourceRow,
  type PersonListRow,
  type PersonRecord,
  type Repo,
  type RespondentSessionRecord,
} from "./types";

type Row = Record<string, unknown>;

function one<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

function check<T>(res: { data: T; error: { message: string; code?: string } | null }, context: string): T {
  if (res.error) {
    // Nunca se registran valores de la consulta, solo el contexto y el código.
    console.error(`[db] ${context}: ${res.error.code ?? ""} ${res.error.message}`);
    throw new RepoError("UNKNOWN", `Error de base de datos (${context})`);
  }
  return res.data;
}

/** Solo letras, números, espacios y guiones: evita inyección en filtros de PostgREST. */
function safeSearch(term: string): string {
  return term.replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 60);
}

export class SupabaseRepo implements Repo {
  constructor(private db: SupabaseClient) {}

  static fromEnv(): SupabaseRepo {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias");
    return new SupabaseRepo(
      createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { "x-application-name": "portal-actualizacion-ame" } },
      }),
    );
  }

  // ── Comunes ────────────────────────────────────────────────────────────────
  async rateLimitHit(bucket: string, limit: number, windowSeconds: number) {
    const data = check(
      await this.db.rpc("rate_limit_hit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds }),
      "rate_limit_hit",
    ) as { allowed: boolean; hits: number }[] | null;
    const row = data?.[0];
    return { allowed: row?.allowed ?? false, hits: row?.hits ?? limit + 1 };
  }

  async logSecurityEvent(e: { event_type: string; ip_hash: string | null; detail?: Record<string, unknown> }) {
    const res = await this.db.from("security_events").insert({ event_type: e.event_type, ip_hash: e.ip_hash, detail: e.detail ?? {} });
    if (res.error) console.error(`[db] security_events: ${res.error.message}`);
  }

  async audit(e: Parameters<Repo["audit"]>[0]) {
    const res = await this.db.from("audit_logs").insert({
      person_id: e.person_id ?? null,
      actor_type: e.actor_type,
      actor_id: e.actor_id ?? null,
      action: e.action,
      changed_fields: e.changed_fields ?? [],
      metadata: e.metadata ?? {},
    });
    if (res.error) console.error(`[db] audit_logs: ${res.error.message}`);
  }

  // ── Titular ────────────────────────────────────────────────────────────────
  async findAccessToken(tokenHash: string) {
    const data = check(
      await this.db
        .from("access_tokens")
        .select("id, person_id, token_hash, expires_at, used_at, revoked_at, failed_attempts")
        .eq("token_hash", tokenHash)
        .maybeSingle(),
      "findAccessToken",
    );
    return (data as AccessTokenRecord | null) ?? null;
  }

  async registerTokenFailure(tokenId: string, threshold: number) {
    const data = check(
      await this.db.rpc("register_token_failure", { p_token_id: tokenId, p_threshold: threshold }),
      "register_token_failure",
    ) as { failed_attempts: number; locked: boolean }[] | null;
    return data?.[0] ?? { failed_attempts: threshold, locked: true };
  }

  async getPerson(id: string) {
    const data = check(
      await this.db
        .from("people")
        .select("id, first_names, last_names, national_id_encrypted, national_id_hash, national_id_last2, status, confirmation_code, submitted_at")
        .eq("id", id)
        .is("anonymized_at", null)
        .maybeSingle(),
      "getPerson",
    );
    return (data as PersonRecord | null) ?? null;
  }

  async markStarted(personId: string) {
    check(await this.db.from("people").update({ status: "STARTED" }).eq("id", personId).eq("status", "PENDING"), "markStarted");
  }

  async createRespondentSession(s: { session_hash: string; person_id: string; access_token_id: string; expires_at: string; submitted_at?: string | null }) {
    const data = check(await this.db.from("respondent_sessions").insert(s).select().single(), "createRespondentSession");
    return data as RespondentSessionRecord;
  }

  async findRespondentSession(sessionHash: string) {
    const data = check(
      await this.db
        .from("respondent_sessions")
        .select("id, session_hash, person_id, access_token_id, expires_at, submitted_at, revoked_at")
        .eq("session_hash", sessionHash)
        .maybeSingle(),
      "findRespondentSession",
    );
    return (data as RespondentSessionRecord | null) ?? null;
  }

  async revokeRespondentSession(id: string) {
    check(await this.db.from("respondent_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", id), "revokeRespondentSession");
  }

  async submitPersonData(s: Parameters<Repo["submitPersonData"]>[0]) {
    const res = await this.db.rpc("submit_person_data", { p: s });
    if (res.error) {
      const msg = res.error.message ?? "";
      for (const code of ["ALREADY_SUBMITTED", "SESSION_INVALID", "TOKEN_INVALID", "PERSON_NOT_FOUND"] as const) {
        if (msg.includes(code)) throw new RepoError(code);
      }
      if (res.error.code === "23505" && msg.includes("confirmation_code")) throw new RepoError("DUPLICATE_CODE");
      console.error(`[db] submit_person_data: ${res.error.code ?? ""}`);
      throw new RepoError("UNKNOWN");
    }
    return { confirmation_code: String(res.data) };
  }

  async getActiveNotice() {
    const data = check(
      await this.db.from("privacy_notices").select("*").eq("is_active", true).maybeSingle(),
      "getActiveNotice",
    );
    return (data as NoticeRecord | null) ?? null;
  }

  async getInsuredRecord(personId: string) {
    const person = check(
      await this.db
        .from("people")
        .select("id, first_names, last_names, national_id_encrypted, national_id_hash, national_id_last2, status, confirmation_code, submitted_at, review_reasons")
        .eq("id", personId)
        .is("anonymized_at", null)
        .maybeSingle(),
      "getInsuredRecord.person",
    ) as (PersonRecord & { review_reasons: string[] | null }) | null;
    if (!person) return null;

    const [contactRes, bankRes, consentRes] = await Promise.all([
      this.db
        .from("contact_information")
        .select("primary_email, secondary_email, mobile_phone, city, province, country")
        .eq("person_id", personId)
        .maybeSingle(),
      this.db
        .from("bank_information")
        .select("bank_name, bank_other_name, account_type, account_number_last4, holder_is_titular")
        .eq("person_id", personId)
        .maybeSingle(),
      this.db
        .from("consents")
        .select("privacy_notice_version")
        .eq("person_id", personId)
        .eq("consent_type", "PRIVACY_NOTICE")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const contact = check(contactRes, "getInsuredRecord.contact") as InsuredRecord["contact"];
    const bank = check(bankRes, "getInsuredRecord.bank") as InsuredRecord["bank"];
    const consent = check(consentRes, "getInsuredRecord.consent") as { privacy_notice_version: string } | null;
    return {
      person: { ...person, review_reasons: person.review_reasons ?? [] },
      contact,
      bank,
      notice_version: consent?.privacy_notice_version ?? null,
    };
  }

  // ── Administración: autenticación ─────────────────────────────────────────
  async findAdminByEmail(email: string) {
    const data = check(await this.db.from("admin_users").select("*").eq("email", email.toLowerCase()).maybeSingle(), "findAdminByEmail");
    return (data as AdminUserRecord | null) ?? null;
  }

  async findAdminByAuthUserId(authUserId: string) {
    const data = check(await this.db.from("admin_users").select("*").eq("auth_user_id", authUserId).maybeSingle(), "findAdminByAuthUserId");
    return (data as AdminUserRecord | null) ?? null;
  }

  async getAdmin(id: string) {
    const data = check(await this.db.from("admin_users").select("*").eq("id", id).maybeSingle(), "getAdmin");
    return (data as AdminUserRecord | null) ?? null;
  }

  async createAdmin(a: Parameters<Repo["createAdmin"]>[0]) {
    const data = check(await this.db.from("admin_users").insert({ ...a, email: a.email.toLowerCase() }).select().single(), "createAdmin");
    return data as AdminUserRecord;
  }

  async updateAdmin(id: string, patch: Parameters<Repo["updateAdmin"]>[1]) {
    check(await this.db.from("admin_users").update(patch).eq("id", id), "updateAdmin");
  }

  // ── Administración: personas ──────────────────────────────────────────────
  async statusCounts() {
    const data = check(await this.db.rpc("people_status_counts"), "people_status_counts") as { status: PersonStatus; total: number }[] | null;
    const counts = Object.fromEntries(PERSON_STATUSES.map((s) => [s, 0])) as Record<PersonStatus, number>;
    for (const row of data ?? []) counts[row.status] = Number(row.total);
    return counts;
  }

  async listPeople(q: { status?: PersonStatus; search?: string; nationalIdHash?: string; page: number; pageSize: number }) {
    let query = this.db
      .from("people")
      .select("id, first_names, last_names, national_id_last2, status, confirmation_code, submitted_at, updated_at", { count: "exact" })
      .is("anonymized_at", null);
    if (q.status) query = query.eq("status", q.status);
    if (q.nationalIdHash) query = query.eq("national_id_hash", q.nationalIdHash);
    if (q.search) {
      const term = safeSearch(q.search);
      if (term.toUpperCase().startsWith("AIG-")) query = query.eq("confirmation_code", term.toUpperCase());
      else if (term) query = query.or(`first_names.ilike.%${term}%,last_names.ilike.%${term}%`);
    }
    const from = (q.page - 1) * q.pageSize;
    const res = await query.order("last_names", { ascending: true }).range(from, from + q.pageSize - 1);
    const data = check(res, "listPeople");
    return { rows: (data ?? []) as PersonListRow[], total: res.count ?? 0 };
  }

  async getPersonDetail(id: string): Promise<PersonDetail | null> {
    const personRow = check(
      await this.db
        .from("people")
        .select("id, first_names, last_names, national_id_encrypted, national_id_hash, national_id_last2, status, confirmation_code, submitted_at, created_at, updated_at, review_reasons, reviewed_at, anonymized_at, retention_until, outreach_email")
        .eq("id", id)
        .maybeSingle(),
      "getPersonDetail.person",
    ) as (PersonDetail["person"] & { outreach_email: string | null }) | null;
    if (!personRow) return null;
    const { outreach_email: outreachEmail, ...person } = personRow;

    const [contact, bank, consents, nameChanges, tokens, audit] = await Promise.all([
      this.db.from("contact_information").select("primary_email, secondary_email, mobile_phone, address_line_1, address_line_2, city, province, country, postal_code, updated_at").eq("person_id", id).maybeSingle(),
      this.db.from("bank_information").select("bank_name, bank_other_name, account_type, account_number_last4, account_holder_name, holder_is_titular, ownership_declared, updated_at").eq("person_id", id).maybeSingle(),
      this.db.from("consents").select("consent_type, privacy_notice_version, accepted_at, revoked_at, session_id, consent_text_hash").eq("person_id", id).order("created_at"),
      this.db.from("name_change_history").select("original_first_names, original_last_names, new_first_names, new_last_names, created_at").eq("person_id", id).order("created_at"),
      this.db.from("access_tokens").select("id, expires_at, used_at, revoked_at, revoked_reason, failed_attempts, created_at").eq("person_id", id).order("created_at", { ascending: false }),
      this.db.from("audit_logs").select("*").eq("person_id", id).order("created_at", { ascending: false }).limit(100),
    ]);
    return {
      person,
      contact: check(contact, "detail.contact") as Record<string, string | null> | null,
      bank: check(bank, "detail.bank") as PersonDetail["bank"],
      consents: (check(consents, "detail.consents") ?? []) as PersonDetail["consents"],
      nameChanges: (check(nameChanges, "detail.names") ?? []) as PersonDetail["nameChanges"],
      tokens: (check(tokens, "detail.tokens") ?? []) as PersonDetail["tokens"],
      audit: (check(audit, "detail.audit") ?? []) as AuditRow[],
      outreach_email: outreachEmail,
    };
  }

  async markReviewed(personId: string, adminId: string) {
    check(
      await this.db
        .from("people")
        .update({ status: "COMPLETED", reviewed_at: new Date().toISOString(), reviewed_by: adminId })
        .eq("id", personId)
        .eq("status", "NEEDS_REVIEW"),
      "markReviewed",
    );
  }

  async existingNationalIdHashes(hashes: string[]) {
    const found = new Set<string>();
    for (let i = 0; i < hashes.length; i += 500) {
      const chunk = hashes.slice(i, i + 500);
      const data = check(await this.db.from("people").select("national_id_hash").in("national_id_hash", chunk), "existingHashes") as Row[] | null;
      for (const r of data ?? []) found.add(String(r.national_id_hash));
    }
    return found;
  }

  async createImportBatch(b: Parameters<Repo["createImportBatch"]>[0]) {
    const data = check(await this.db.from("import_batches").insert(b).select("id").single(), "createImportBatch") as Row;
    return String(data.id);
  }

  async insertPeople(rows: Parameters<Repo["insertPeople"]>[0], batchId: string) {
    const out: { id: string; national_id_hash: string }[] = [];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, import_batch_id: batchId }));
      const data = check(await this.db.from("people").insert(chunk).select("id, national_id_hash"), "insertPeople") as Row[] | null;
      for (const r of data ?? []) out.push({ id: String(r.id), national_id_hash: String(r.national_id_hash) });
    }
    return out;
  }

  async createAccessTokens(items: Parameters<Repo["createAccessTokens"]>[0]) {
    for (let i = 0; i < items.length; i += 500) {
      check(await this.db.from("access_tokens").insert(items.slice(i, i + 500)), "createAccessTokens");
    }
  }

  async revokeTokensForPerson(personId: string, reason: string) {
    const data = check(
      await this.db
        .from("access_tokens")
        .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
        .eq("person_id", personId)
        .is("revoked_at", null)
        .is("used_at", null)
        .select("id"),
      "revokeTokensForPerson",
    ) as Row[] | null;
    const revoked = await this.db.from("respondent_sessions").update({ revoked_at: new Date().toISOString() }).eq("person_id", personId).is("revoked_at", null);
    check(revoked, "revokeSessionsForPerson");
    return data?.length ?? 0;
  }

  async listPersonIdsWithoutActiveToken(personIds?: string[]) {
    let query = this.db.from("people").select("id, status, access_tokens(expires_at, used_at, revoked_at)").is("anonymized_at", null).in("status", ["PENDING", "STARTED"]);
    if (personIds?.length) query = query.in("id", personIds);
    const data = check(await query, "listWithoutToken") as Row[] | null;
    const now = Date.now();
    return (data ?? [])
      .filter((p) => {
        const tokens = (p.access_tokens as { expires_at: string; used_at: string | null; revoked_at: string | null }[] | null) ?? [];
        return !tokens.some((t) => !t.used_at && !t.revoked_at && new Date(t.expires_at).getTime() > now);
      })
      .map((p) => String(p.id));
  }

  async applyManualEdit(personId: string, patch: ManualPersonPatch): Promise<{ changed: string[] } | null> {
    const current = check(
      await this.db.from("people").select("id, first_names, last_names, outreach_email").eq("id", personId).maybeSingle(),
      "applyManualEdit.person",
    ) as { id: string; first_names: string; last_names: string; outreach_email: string | null } | null;
    if (!current) return null;
    const changed: string[] = [];
    if (patch.first_names !== current.first_names) changed.push("first_names");
    if (patch.last_names !== current.last_names) changed.push("last_names");
    if ((patch.outreach_email || null) !== (current.outreach_email || null)) changed.push("outreach_email");
    if (changed.length) {
      check(
        await this.db
          .from("people")
          .update({ first_names: patch.first_names, last_names: patch.last_names, outreach_email: patch.outreach_email })
          .eq("id", personId),
        "applyManualEdit.personUpdate",
      );
    }
    if (changed.includes("first_names") || changed.includes("last_names")) {
      check(
        await this.db.from("name_change_history").insert({
          person_id: personId,
          original_first_names: current.first_names,
          original_last_names: current.last_names,
          new_first_names: patch.first_names,
          new_last_names: patch.last_names,
        }),
        "applyManualEdit.names",
      );
    }
    if (patch.contact) {
      const contact = check(
        await this.db
          .from("contact_information")
          .select("primary_email, secondary_email, mobile_phone, address_line_1, address_line_2, city, province, country, postal_code")
          .eq("person_id", personId)
          .maybeSingle(),
        "applyManualEdit.contact",
      ) as ManualPersonPatch["contact"];
      if (contact) {
        const next = patch.contact;
        const fields = [
          "primary_email",
          "secondary_email",
          "mobile_phone",
          "address_line_1",
          "address_line_2",
          "city",
          "province",
          "country",
          "postal_code",
        ] as const;
        const contactChanged = fields.filter((field) => (contact[field] ?? null) !== (next[field] ?? null));
        if (contactChanged.length) {
          changed.push(...contactChanged);
          check(await this.db.from("contact_information").update(next).eq("person_id", personId), "applyManualEdit.contactUpdate");
        }
      }
    }
    return { changed };
  }

  async listLinkMailTargets(): Promise<LinkMailTarget[]> {
    const data = check(
      await this.db
        .from("people")
        .select("id, first_names, last_names, status, outreach_email, national_id_last2, access_tokens(expires_at, used_at, revoked_at), contact_information(primary_email)")
        .is("anonymized_at", null)
        .in("status", ["PENDING", "STARTED"]),
      "listLinkMailTargets",
    ) as Row[] | null;
    const now = Date.now();
    return (data ?? []).map((person) => {
      const tokens = (person.access_tokens as { expires_at: string; used_at: string | null; revoked_at: string | null }[] | null) ?? [];
      const contact = one<{ primary_email?: string | null }>(person.contact_information);
      const email = (person.outreach_email ? String(person.outreach_email) : null) || contact?.primary_email || null;
      return {
        id: String(person.id),
        first_names: String(person.first_names),
        last_names: String(person.last_names),
        email,
        national_id_last2: person.national_id_last2 ? String(person.national_id_last2) : null,
        status: String(person.status) as LinkMailTarget["status"],
        has_active_token: tokens.some((token) => !token.used_at && !token.revoked_at && new Date(token.expires_at).getTime() > now),
      };
    });
  }

  async getUnibrokersRows(): Promise<UnibrokersSourceRow[]> {
    const data = check(
      await this.db
        .from("people")
        .select(
          "id, status, confirmation_code, first_names, last_names, national_id_encrypted, outreach_email, submitted_at, " +
            "contact_information(primary_email, mobile_phone, city, province)",
        )
        .is("anonymized_at", null)
        .order("last_names"),
      "getUnibrokersRows",
    ) as Row[] | null;
    return (data ?? []).map((person) => {
      const contact = one<Row>(person.contact_information) ?? {};
      const text = (value: unknown) => (value == null ? null : String(value));
      return {
        person_id: String(person.id),
        status: String(person.status) as UnibrokersSourceRow["status"],
        confirmation_code: text(person.confirmation_code),
        first_names: String(person.first_names),
        last_names: String(person.last_names),
        national_id_encrypted: text(person.national_id_encrypted),
        outreach_email: text(person.outreach_email),
        primary_email: text(contact.primary_email),
        mobile_phone: text(contact.mobile_phone),
        city: text(contact.city),
        province: text(contact.province),
        submitted_at: text(person.submitted_at),
      };
    });
  }

  // ── Exportación ───────────────────────────────────────────────────────────
  async getExportRows(): Promise<ExportSourceRow[]> {
    const data = check(
      await this.db
        .from("people")
        .select(
          "id, confirmation_code, first_names, last_names, national_id_encrypted, submitted_at, " +
            "contact_information(primary_email, secondary_email, mobile_phone, address_line_1, address_line_2, city, province, country, postal_code), " +
            "bank_information(bank_name, bank_other_name, account_type, account_number_encrypted, account_holder_name, account_holder_national_id_encrypted), " +
            "consents(consent_type, accepted, accepted_at, revoked_at, privacy_notice_version)",
        )
        .eq("status", "COMPLETED")
        .is("anonymized_at", null)
        .order("last_names"),
      "getExportRows",
    ) as unknown as Row[] | null;

    return (data ?? []).map((p) => {
      const c = one<Row>(p.contact_information) ?? {};
      const b = one<Row>(p.bank_information) ?? {};
      const consents = (p.consents as { consent_type: string; accepted: boolean; accepted_at: string | null; revoked_at: string | null; privacy_notice_version: string }[]) ?? [];
      const sharing = consents.find((x) => x.consent_type === "DATA_SHARING_AIG" && x.accepted && !x.revoked_at);
      const privacy = consents.find((x) => x.consent_type === "PRIVACY_NOTICE" && x.accepted && !x.revoked_at);
      const s = (v: unknown) => (v == null ? null : String(v));
      return {
        person_id: String(p.id),
        confirmation_code: s(p.confirmation_code),
        first_names: String(p.first_names),
        last_names: String(p.last_names),
        national_id_encrypted: s(p.national_id_encrypted),
        submitted_at: s(p.submitted_at),
        primary_email: s(c.primary_email),
        secondary_email: s(c.secondary_email),
        mobile_phone: s(c.mobile_phone),
        address_line_1: s(c.address_line_1),
        address_line_2: s(c.address_line_2),
        city: s(c.city),
        province: s(c.province),
        country: s(c.country),
        postal_code: s(c.postal_code),
        bank_name: s(b.bank_name),
        bank_other_name: s(b.bank_other_name),
        account_type: s(b.account_type),
        account_number_encrypted: s(b.account_number_encrypted),
        account_holder_name: s(b.account_holder_name),
        account_holder_national_id_encrypted: s(b.account_holder_national_id_encrypted),
        consent_accepted_at: sharing && privacy ? sharing.accepted_at : null,
        privacy_notice_version: sharing?.privacy_notice_version ?? null,
      };
    });
  }

  async recordExport(e: Parameters<Repo["recordExport"]>[0]) {
    check(await this.db.from("exports").insert(e), "recordExport");
  }

  // ── Aviso y auditoría ─────────────────────────────────────────────────────
  async listNotices() {
    const data = check(await this.db.from("privacy_notices").select("*").order("created_at", { ascending: false }), "listNotices");
    return (data ?? []) as NoticeRecord[];
  }

  async publishNotice(n: Parameters<Repo["publishNotice"]>[0]) {
    check(await this.db.from("privacy_notices").update({ is_active: false }).eq("is_active", true), "publishNotice.deactivate");
    const data = check(await this.db.from("privacy_notices").insert({ ...n, is_active: true }).select().single(), "publishNotice.insert");
    return data as NoticeRecord;
  }

  async listAudit(q: { page: number; pageSize: number; action?: string }) {
    let query = this.db.from("audit_logs").select("*", { count: "exact" });
    if (q.action) query = query.eq("action", q.action);
    const from = (q.page - 1) * q.pageSize;
    const res = await query.order("created_at", { ascending: false }).range(from, from + q.pageSize - 1);
    return { rows: (check(res, "listAudit") ?? []) as AuditRow[], total: res.count ?? 0 };
  }

  async recentSecurityEvents(limit: number) {
    const data = check(
      await this.db.from("security_events").select("event_type, created_at, detail").order("created_at", { ascending: false }).limit(limit),
      "recentSecurityEvents",
    );
    return (data ?? []) as { event_type: string; created_at: string; detail: Record<string, unknown> }[];
  }

  // ── Retención ─────────────────────────────────────────────────────────────
  async anonymizeExpired() {
    const data = check(await this.db.rpc("anonymize_expired_people"), "anonymize_expired_people");
    return Number(data ?? 0);
  }

  async purgeExpiredSessions() {
    check(await this.db.rpc("purge_expired_sessions"), "purge_expired_sessions");
  }
}
