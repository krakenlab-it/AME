import { randomUUID } from "node:crypto";
import { encrypt, keyedHash } from "@/lib/encryption/crypto";
import {
  RepoError,
  type AccessTokenRecord,
  type AdminSessionRecord,
  type AdminUserRecord,
  type AuditEvent,
  type AuditRow,
  type ExportSourceRow,
  type NoticeRecord,
  type PersonDetail,
  type PersonRecord,
  type Repo,
  type RespondentSessionRecord,
  type SubmissionRecord,
} from "@/lib/database/types";
import type { PersonStatus } from "@/lib/validation/constants";

/**
 * Implementación en memoria que replica las reglas de la base (incluida submit_person_data).
 * Se usa en las pruebas y en el modo demostración local (DEMO_MODE=true, nunca en producción).
 */
export class MemoryRepo implements Repo {
  people = new Map<string, PersonRecord & { review_reasons: string[]; retention_until: string | null }>();
  tokens = new Map<string, AccessTokenRecord>();
  sessions = new Map<string, RespondentSessionRecord>();
  submissions = new Map<string, SubmissionRecord>();
  auditLog: (AuditEvent & { created_at?: string })[] = [];
  securityEvents: { event_type: string; ip_hash: string | null }[] = [];
  buckets = new Map<string, number>();
  admins = new Map<string, AdminUserRecord>();
  adminSessions = new Map<string, AdminSessionRecord>();
  exports: { admin_id: string; record_count: number; fields: string[]; purpose: string }[] = [];
  notices: NoticeRecord[] = [];
  exportRows: ExportSourceRow[] = [];

  // ── helpers de prueba ──
  addPerson(firstNames: string, lastNames: string, cedula: string, status: PersonStatus = "PENDING") {
    const id = randomUUID();
    this.people.set(id, {
      id, first_names: firstNames, last_names: lastNames, national_id_encrypted: encrypt(cedula),
      national_id_hash: keyedHash(cedula, "national_id"), national_id_last2: cedula.slice(-2), status,
      confirmation_code: null, submitted_at: null, review_reasons: [], retention_until: null,
    });
    return id;
  }

  addToken(personId: string, tokenHash: string, opts: Partial<AccessTokenRecord> = {}) {
    const id = randomUUID();
    this.tokens.set(id, {
      id, person_id: personId, token_hash: tokenHash, expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      used_at: null, revoked_at: null, failed_attempts: 0, ...opts,
    });
    return id;
  }

  // ── comunes ──
  async rateLimitHit(bucket: string, limit: number) {
    const hits = (this.buckets.get(bucket) ?? 0) + 1;
    this.buckets.set(bucket, hits);
    return { allowed: hits <= limit, hits };
  }
  async logSecurityEvent(e: { event_type: string; ip_hash: string | null }) { this.securityEvents.push(e); }
  async audit(e: AuditEvent) { this.auditLog.push({ ...e, created_at: new Date().toISOString() }); }

  // ── titular ──
  async findAccessToken(hash: string) { return [...this.tokens.values()].find((t) => t.token_hash === hash) ?? null; }
  async registerTokenFailure(id: string, threshold: number) {
    const t = this.tokens.get(id)!;
    t.failed_attempts += 1;
    if (t.failed_attempts >= threshold && !t.revoked_at) t.revoked_at = new Date().toISOString();
    return { failed_attempts: t.failed_attempts, locked: t.failed_attempts >= threshold };
  }
  async getPerson(id: string) { return this.people.get(id) ?? null; }
  async markStarted(id: string) { const p = this.people.get(id); if (p?.status === "PENDING") p.status = "STARTED"; }
  async createRespondentSession(s: { session_hash: string; person_id: string; access_token_id: string; expires_at: string }) {
    const rec: RespondentSessionRecord = { id: randomUUID(), submitted_at: null, revoked_at: null, ...s };
    this.sessions.set(rec.id, rec);
    return rec;
  }
  async findRespondentSession(hash: string) { return [...this.sessions.values()].find((s) => s.session_hash === hash) ?? null; }
  async revokeRespondentSession(id: string) { this.sessions.get(id)!.revoked_at = new Date().toISOString(); }
  async submitPersonData(s: SubmissionRecord) {
    if ([...this.people.values()].some((x) => x.confirmation_code === s.confirmation_code)) throw new RepoError("DUPLICATE_CODE");
    const p = this.people.get(s.person_id);
    if (!p) throw new RepoError("PERSON_NOT_FOUND");
    if (p.submitted_at) throw new RepoError("ALREADY_SUBMITTED");
    const sess = this.sessions.get(s.session_id);
    if (!sess || sess.person_id !== s.person_id || sess.revoked_at || sess.submitted_at || new Date(sess.expires_at) < new Date()) throw new RepoError("SESSION_INVALID");
    const tok = this.tokens.get(s.access_token_id);
    if (!tok || tok.person_id !== s.person_id || tok.revoked_at || tok.used_at || new Date(tok.expires_at) < new Date()) throw new RepoError("TOKEN_INVALID");
    if (s.names_changed) { p.first_names = s.first_names; p.last_names = s.last_names; }
    p.status = s.review_reasons.length ? "NEEDS_REVIEW" : "COMPLETED";
    p.review_reasons = s.review_reasons;
    p.confirmation_code = s.confirmation_code;
    p.submitted_at = new Date().toISOString();
    p.retention_until = s.retention_until;
    tok.used_at = new Date().toISOString();
    sess.submitted_at = new Date().toISOString();
    this.submissions.set(s.person_id, s);
    this.auditLog.push({ person_id: s.person_id, actor_type: "respondent", action: "DATA_UPDATED", changed_fields: s.changed_fields });
    this.auditLog.push({ person_id: s.person_id, actor_type: "respondent", action: "CONSENT_ACCEPTED", metadata: { types: s.consents.map((c) => c.type) } });
    this.auditLog.push({ person_id: s.person_id, actor_type: "respondent", action: "FORM_SUBMITTED" });
    return { confirmation_code: s.confirmation_code };
  }
  async getActiveNotice() { return this.notices.find((n) => n.is_active) ?? null; }

  // ── administración ──
  async findAdminByEmail(email: string) { return [...this.admins.values()].find((a) => a.email === email.toLowerCase()) ?? null; }
  async getAdmin(id: string) { return this.admins.get(id) ?? null; }
  async createAdmin(a: { email: string; full_name: string; role: AdminUserRecord["role"]; password_hash: string }) {
    return this.createAdminSync(a);
  }
  createAdminSync(a: { email: string; full_name: string; role: AdminUserRecord["role"]; password_hash: string }) {
    const rec: AdminUserRecord = { id: randomUUID(), mfa_secret_encrypted: null, mfa_enabled: false, active: true, failed_logins: 0, locked_until: null, ...a };
    this.admins.set(rec.id, rec);
    return rec;
  }
  async updateAdmin(id: string, patch: Partial<AdminUserRecord>) { Object.assign(this.admins.get(id)!, patch); }
  async createAdminSession(s: { session_hash: string; admin_id: string; expires_at: string }) {
    const now = new Date().toISOString();
    const rec: AdminSessionRecord = { id: randomUUID(), mfa_verified: false, created_at: now, last_seen_at: now, revoked_at: null, ...s };
    this.adminSessions.set(rec.id, rec);
    return rec;
  }
  async findAdminSession(hash: string) { return [...this.adminSessions.values()].find((s) => s.session_hash === hash) ?? null; }
  async updateAdminSession(id: string, patch: Partial<AdminSessionRecord>) { Object.assign(this.adminSessions.get(id)!, patch); }
  async statusCounts() {
    const c: Record<PersonStatus, number> = { PENDING: 0, STARTED: 0, COMPLETED: 0, NEEDS_REVIEW: 0 };
    for (const p of this.people.values()) c[p.status]++;
    return c;
  }
  async listPeople(q: { status?: PersonStatus; search?: string; nationalIdHash?: string; page: number; pageSize: number }) {
    const term = q.search?.toLowerCase();
    const all = [...this.people.values()].filter((p) =>
      (!q.status || p.status === q.status) &&
      (!q.nationalIdHash || p.national_id_hash === q.nationalIdHash) &&
      (!term || `${p.first_names} ${p.last_names} ${p.confirmation_code ?? ""}`.toLowerCase().includes(term)));
    const rows = all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map((p) => ({
      id: p.id, first_names: p.first_names, last_names: p.last_names, national_id_last2: p.national_id_last2,
      status: p.status, confirmation_code: p.confirmation_code, submitted_at: p.submitted_at, updated_at: p.submitted_at ?? "",
    }));
    return { rows, total: all.length };
  }
  async getPersonDetail(id: string): Promise<PersonDetail | null> {
    const p = this.people.get(id);
    if (!p) return null;
    const s = this.submissions.get(id);
    const now = new Date().toISOString();
    return {
      person: { ...p, created_at: now, updated_at: now, reviewed_at: null, anonymized_at: null },
      contact: s ? { ...s.contact } : null,
      bank: s ? { bank_name: s.bank.bank_name, bank_other_name: s.bank.bank_other_name || null, account_type: s.bank.account_type, account_number_last4: s.bank.account_number_last4, account_holder_name: s.bank.account_holder_name, holder_is_titular: s.bank.holder_is_titular, ownership_declared: s.bank.ownership_declared, updated_at: now } : null,
      consents: s ? s.consents.map((c) => ({ consent_type: c.type, privacy_notice_version: s.notice_version, accepted_at: p.submitted_at, revoked_at: null, session_id: s.session_id, consent_text_hash: c.text_hash })) : [],
      nameChanges: [],
      tokens: [...this.tokens.values()].filter((t) => t.person_id === id).map((t) => ({ id: t.id, expires_at: t.expires_at, used_at: t.used_at, revoked_at: t.revoked_at, revoked_reason: null, failed_attempts: t.failed_attempts, created_at: now })),
      audit: this.auditLog.filter((a) => a.person_id === id).map((a, i) => this.toAuditRow(a, i)).reverse(),
    };
  }
  private toAuditRow(a: AuditEvent & { created_at?: string }, i: number): AuditRow {
    return { id: i + 1, person_id: a.person_id ?? null, actor_type: a.actor_type, actor_id: a.actor_id ?? null, action: a.action, changed_fields: a.changed_fields ?? [], metadata: a.metadata ?? {}, created_at: a.created_at ?? new Date().toISOString() };
  }
  async markReviewed(id: string) { const p = this.people.get(id); if (p?.status === "NEEDS_REVIEW") p.status = "COMPLETED"; }
  async existingNationalIdHashes(hashes: string[]) {
    const all = new Set([...this.people.values()].map((p) => p.national_id_hash));
    return new Set(hashes.filter((h) => all.has(h)));
  }
  async createImportBatch() { return randomUUID(); }
  async insertPeople(rows: { first_names: string; last_names: string; national_id_encrypted: string; national_id_hash: string; national_id_last2: string }[]) {
    return rows.map((r) => {
      const id = randomUUID();
      this.people.set(id, { id, ...r, status: "PENDING", confirmation_code: null, submitted_at: null, review_reasons: [], retention_until: null });
      return { id, national_id_hash: r.national_id_hash };
    });
  }
  async createAccessTokens(items: { person_id: string; token_hash: string; expires_at: string }[]) {
    for (const i of items) this.addToken(i.person_id, i.token_hash, { expires_at: i.expires_at });
  }
  async revokeTokensForPerson(personId: string) {
    let n = 0;
    for (const t of this.tokens.values()) if (t.person_id === personId && !t.revoked_at && !t.used_at) { t.revoked_at = new Date().toISOString(); n++; }
    return n;
  }
  async listPersonIdsWithoutActiveToken() {
    const now = Date.now();
    return [...this.people.values()]
      .filter((p) => (p.status === "PENDING" || p.status === "STARTED") && ![...this.tokens.values()].some((t) => t.person_id === p.id && !t.used_at && !t.revoked_at && new Date(t.expires_at).getTime() > now))
      .map((p) => p.id);
  }
  async getExportRows() { return this.exportRows; }
  async recordExport(e: { admin_id: string; record_count: number; fields: string[]; purpose: string }) { this.exports.push(e); }
  async listNotices() { return this.notices; }
  async publishNotice(n: { version: string; body: string; body_hash: string; effective_date: string | null }) {
    this.notices.forEach((x) => (x.is_active = false));
    const rec: NoticeRecord = { id: randomUUID(), is_active: true, created_at: new Date().toISOString(), ...n };
    this.notices.push(rec);
    return rec;
  }
  async listAudit(q: { page: number; pageSize: number; action?: string }) {
    const all = this.auditLog.map((a, i) => this.toAuditRow(a, i)).filter((a) => !q.action || a.action === q.action).reverse();
    return { rows: all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: all.length };
  }
  async recentSecurityEvents(limit: number) {
    return this.securityEvents.slice(-limit).reverse().map((e) => ({ event_type: e.event_type, created_at: new Date().toISOString(), detail: {} }));
  }
  async anonymizeExpired() { return 0; }
  async purgeExpiredSessions() {}
}
