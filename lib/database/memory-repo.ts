import { randomUUID } from "node:crypto";
import { encrypt, keyedHash, safeEqual } from "@/lib/encryption/crypto";
import {
  RepoError,
  type AccessTokenRecord,
  type AdminUserRecord,
  type AuditEvent,
  type AuditRow,
  type ExportSourceRow,
  type InsuredRecord,
  type NoticeRecord,
  type LinkMailTarget,
  type ManualPersonPatch,
  type EntryMethod,
  type FingerprintAssignResult,
  type GeneralAuthRecord,
  type GeneralChallengeInput,
  type GeneralChallengeRecord,
  type PersonDetail,
  type PersonRecord,
  type UnibrokersSourceRow,
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
  /** Marca estructural: `instanceof` falla si Next carga el módulo en dos bundles distintos. */
  readonly isMemoryRepo = true as const;
  people = new Map<string, PersonRecord & { review_reasons: string[]; retention_until: string | null }>();
  tokens = new Map<string, AccessTokenRecord>();
  sessions = new Map<string, RespondentSessionRecord>();
  submissions = new Map<string, SubmissionRecord>();
  auditLog: (AuditEvent & { created_at?: string })[] = [];
  securityEvents: { event_type: string; ip_hash: string | null }[] = [];
  buckets = new Map<string, number>();
  admins = new Map<string, AdminUserRecord>();
  exports: { admin_id: string; record_count: number; fields: string[]; purpose: string }[] = [];
  notices: NoticeRecord[] = [];
  exportRows: ExportSourceRow[] = [];
  /** Contacto y banco ya enmascarables, por persona. Lo llena el envío y el seed. */
  profiles = new Map<string, Pick<InsuredRecord, "contact" | "bank" | "notice_version">>();
  outreachEmails = new Map<string, string>();
  nameChanges = new Map<string, PersonDetail["nameChanges"]>();
  /** Código dactilar solo hasheado y TOTP solo cifrado. No se mezcla con la ficha visible. */
  generalAuth = new Map<string, GeneralAuthState>();

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
  async rateLimitHit(bucket: string, limit: number, windowSeconds: number) {
    void windowSeconds;
    const hits = (this.buckets.get(bucket) ?? 0) + 1;
    this.buckets.set(bucket, hits);
    return { allowed: hits <= limit, hits };
  }
  async logSecurityEvent(e: { event_type: string; ip_hash: string | null }) { this.securityEvents.push(e); }
  async audit(e: AuditEvent) { this.auditLog.push({ ...e, created_at: new Date().toISOString() }); }

  // ── titular ──
  async findAccessToken(hash: string) { return [...this.tokens.values()].find((t) => t.token_hash === hash) ?? null; }
  async findPersonByNationalIdHash(hash: string) {
    return [...this.people.values()].find((p) => p.national_id_hash === hash) ?? null;
  }
  async findResumableAccessToken(personId: string) {
    const now = Date.now();
    return (
      [...this.tokens.values()].find(
        (t) => t.person_id === personId && !t.revoked_at && !t.used_at && new Date(t.expires_at).getTime() > now,
      ) ?? null
    );
  }
  async registerTokenFailure(id: string, threshold: number) {
    const t = this.tokens.get(id)!;
    t.failed_attempts += 1;
    if (t.failed_attempts >= threshold && !t.revoked_at) t.revoked_at = new Date().toISOString();
    return { failed_attempts: t.failed_attempts, locked: t.failed_attempts >= threshold };
  }
  async getPerson(id: string) { return this.people.get(id) ?? null; }
  async markStarted(id: string) { const p = this.people.get(id); if (p?.status === "PENDING") p.status = "STARTED"; }
  async createRespondentSession(s: { session_hash: string; person_id: string; access_token_id: string | null; entry_method: EntryMethod; expires_at: string; submitted_at?: string | null }) {
    const rec: RespondentSessionRecord = {
      id: randomUUID(),
      revoked_at: null,
      session_hash: s.session_hash,
      person_id: s.person_id,
      access_token_id: s.access_token_id,
      entry_method: s.entry_method,
      expires_at: s.expires_at,
      submitted_at: s.submitted_at ?? null,
    };
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
    switch (sess.entry_method) {
      case "token": {
        if (!s.access_token_id || sess.access_token_id !== s.access_token_id) throw new RepoError("SESSION_INVALID");
        const tok = this.tokens.get(s.access_token_id);
        if (!tok || tok.person_id !== s.person_id || tok.revoked_at || tok.used_at || new Date(tok.expires_at) < new Date()) throw new RepoError("TOKEN_INVALID");
        tok.used_at = new Date().toISOString();
        break;
      }
      case "general": {
        if (s.access_token_id || sess.access_token_id) throw new RepoError("SESSION_INVALID");
        break;
      }
      default: {
        const unexpected: never = sess.entry_method;
        throw new RepoError("SESSION_INVALID", unexpected);
      }
    }
    if (s.names_changed) { p.first_names = s.first_names; p.last_names = s.last_names; }
    p.status = s.review_reasons.length ? "NEEDS_REVIEW" : "COMPLETED";
    p.review_reasons = s.review_reasons;
    p.confirmation_code = s.confirmation_code;
    p.submitted_at = new Date().toISOString();
    p.retention_until = s.retention_until;
    sess.submitted_at = new Date().toISOString();
    this.submissions.set(s.person_id, s);
    this.profiles.set(s.person_id, {
      contact: {
        primary_email: s.contact.primary_email,
        secondary_email: s.contact.secondary_email,
        mobile_phone: s.contact.mobile_phone,
        city: s.contact.city,
        province: s.contact.province,
        country: s.contact.country,
      },
      bank: {
        bank_name: s.bank.bank_name,
        bank_other_name: s.bank.bank_other_name || null,
        account_type: s.bank.account_type,
        account_number_last4: s.bank.account_number_last4,
        holder_is_titular: s.bank.holder_is_titular,
      },
      notice_version: s.notice_version,
    });
    this.auditLog.push({ person_id: s.person_id, actor_type: "respondent", action: "DATA_UPDATED", changed_fields: s.changed_fields });
    this.auditLog.push({ person_id: s.person_id, actor_type: "respondent", action: "CONSENT_ACCEPTED", metadata: { types: s.consents.map((c) => c.type) } });
    this.auditLog.push({ person_id: s.person_id, actor_type: "respondent", action: "FORM_SUBMITTED" });
    return { confirmation_code: s.confirmation_code };
  }
  async getActiveNotice() { return this.notices.find((n) => n.is_active) ?? null; }
  async getInsuredRecord(personId: string): Promise<InsuredRecord | null> {
    const person = this.people.get(personId);
    if (!person) return null;
    const profile = this.profiles.get(personId);
    return {
      person: { ...person, review_reasons: person.review_reasons },
      contact: profile?.contact ?? null,
      bank: profile?.bank ?? null,
      notice_version: profile?.notice_version ?? null,
    };
  }

  // ── administración ──
  async findAdminByEmail(email: string) { return [...this.admins.values()].find((a) => a.email === email.toLowerCase()) ?? null; }
  async findAdminByAuthUserId(authUserId: string) { return [...this.admins.values()].find((a) => a.auth_user_id === authUserId) ?? null; }
  async getAdmin(id: string) { return this.admins.get(id) ?? null; }
  async createAdmin(a: { email: string; full_name: string; role: AdminUserRecord["role"]; auth_user_id: string | null }) {
    return this.createAdminSync(a);
  }
  createAdminSync(a: { email: string; full_name: string; role: AdminUserRecord["role"]; auth_user_id: string | null }) {
    const rec: AdminUserRecord = {
      id: randomUUID(),
      email: a.email.toLowerCase(),
      full_name: a.full_name,
      role: a.role,
      auth_user_id: a.auth_user_id,
      mfa_enabled: false,
      active: true,
      last_login_at: null,
    };
    this.admins.set(rec.id, rec);
    return rec;
  }
  async updateAdmin(id: string, patch: Partial<AdminUserRecord>) {
    const admin = this.admins.get(id);
    if (!admin) return;
    Object.assign(admin, patch);
  }
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
      nameChanges: this.nameChanges.get(id) ?? [],
      tokens: [...this.tokens.values()].filter((t) => t.person_id === id).map((t) => ({ id: t.id, expires_at: t.expires_at, used_at: t.used_at, revoked_at: t.revoked_at, revoked_reason: null, failed_attempts: t.failed_attempts, created_at: now })),
      audit: this.auditLog.filter((a) => a.person_id === id).map((a, i) => this.toAuditRow(a, i)).reverse(),
      outreach_email: this.outreachEmails.get(id) ?? null,
      general_access: this.generalAccessView(id),
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
  async insertPeople(rows: { first_names: string; last_names: string; national_id_encrypted: string; national_id_hash: string; national_id_last2: string; outreach_email?: string | null }[]) {
    return rows.map((r) => {
      const id = randomUUID();
      const { outreach_email: outreach, ...person } = r;
      this.people.set(id, { id, ...person, status: "PENDING", confirmation_code: null, submitted_at: null, review_reasons: [], retention_until: null });
      if (outreach) this.outreachEmails.set(id, outreach);
      return { id, national_id_hash: r.national_id_hash };
    });
  }

  async applyManualEdit(personId: string, patch: ManualPersonPatch): Promise<{ changed: string[] } | null> {
    const person = this.people.get(personId);
    if (!person) return null;
    const changed: string[] = [];
    if (patch.first_names !== person.first_names || patch.last_names !== person.last_names) {
      if (patch.first_names !== person.first_names) changed.push("first_names");
      if (patch.last_names !== person.last_names) changed.push("last_names");
      const history = this.nameChanges.get(personId) ?? [];
      history.push({
        original_first_names: person.first_names,
        original_last_names: person.last_names,
        new_first_names: patch.first_names,
        new_last_names: patch.last_names,
        created_at: new Date().toISOString(),
      });
      this.nameChanges.set(personId, history);
      person.first_names = patch.first_names;
      person.last_names = patch.last_names;
    }
    const previousOutreach = this.outreachEmails.get(personId) ?? null;
    if ((patch.outreach_email || null) !== previousOutreach) {
      changed.push("outreach_email");
      if (patch.outreach_email) this.outreachEmails.set(personId, patch.outreach_email);
      else this.outreachEmails.delete(personId);
    }
    if (patch.contact) {
      const submission = this.submissions.get(personId);
      if (submission) {
        const current = submission.contact;
        const next = patch.contact;
        const pairs: [keyof typeof current, string | null][] = [
          ["primary_email", next.primary_email],
          ["secondary_email", next.secondary_email ?? ""],
          ["mobile_phone", next.mobile_phone],
          ["address_line_1", next.address_line_1],
          ["address_line_2", next.address_line_2 ?? ""],
          ["city", next.city],
          ["province", next.province],
          ["country", next.country],
          ["postal_code", next.postal_code ?? ""],
        ];
        for (const [key, value] of pairs) {
          if (current[key] !== value) {
            changed.push(key);
            current[key] = value ?? "";
          }
        }
        const profile = this.profiles.get(personId);
        if (profile?.contact) {
          profile.contact.primary_email = current.primary_email;
          profile.contact.secondary_email = current.secondary_email;
          profile.contact.mobile_phone = current.mobile_phone;
          profile.contact.city = current.city;
          profile.contact.province = current.province;
          profile.contact.country = current.country;
        }
      }
    }
    return { changed };
  }

  async listLinkMailTargets(): Promise<LinkMailTarget[]> {
    const now = Date.now();
    return [...this.people.values()]
      .filter((person) => person.status === "PENDING" || person.status === "STARTED")
      .map((person) => {
        const submission = this.submissions.get(person.id);
        const email = this.outreachEmails.get(person.id) || submission?.contact.primary_email || null;
        const hasActiveToken = [...this.tokens.values()].some(
          (token) => token.person_id === person.id && !token.used_at && !token.revoked_at && new Date(token.expires_at).getTime() > now,
        );
        return {
          id: person.id,
          first_names: person.first_names,
          last_names: person.last_names,
          email,
          national_id_last2: person.national_id_last2,
          status: person.status,
          has_active_token: hasActiveToken,
        };
      });
  }

  async getUnibrokersRows(): Promise<UnibrokersSourceRow[]> {
    return [...this.people.values()].map((person) => {
      const submission = this.submissions.get(person.id);
      const profile = this.profiles.get(person.id);
      return {
        person_id: person.id,
        status: person.status,
        confirmation_code: person.confirmation_code,
        first_names: person.first_names,
        last_names: person.last_names,
        national_id_encrypted: person.national_id_encrypted,
        outreach_email: this.outreachEmails.get(person.id) ?? null,
        primary_email: submission?.contact.primary_email ?? profile?.contact?.primary_email ?? null,
        mobile_phone: submission?.contact.mobile_phone ?? profile?.contact?.mobile_phone ?? null,
        city: submission?.contact.city ?? profile?.contact?.city ?? null,
        province: submission?.contact.province ?? profile?.contact?.province ?? null,
        submitted_at: person.submitted_at,
      };
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

  private ensureGeneral(personId: string): GeneralAuthState {
    const current = this.generalAuth.get(personId);
    if (current) return current;
    const created: GeneralAuthState = {
      fingerprint_code_hash: null,
      fingerprint_claimed_at: null,
      totp_secret_encrypted: null,
      totp_enabled_at: null,
      failed_attempts: 0,
      locked_until: null,
      challenge_hash: null,
      challenge_expires_at: null,
      challenge_purpose: null,
    };
    this.generalAuth.set(personId, created);
    return created;
  }

  private generalAccessView(personId: string): PersonDetail["general_access"] {
    const auth = this.generalAuth.get(personId);
    const locked = Boolean(auth?.locked_until && new Date(auth.locked_until).getTime() > Date.now());
    return {
      fingerprint_set: Boolean(auth?.fingerprint_code_hash),
      totp_enabled: Boolean(auth?.totp_enabled_at),
      locked,
    };
  }

  private toGeneral(person: PersonRecord, auth: GeneralAuthState): GeneralAuthRecord {
    return {
      id: person.id,
      first_names: person.first_names,
      last_names: person.last_names,
      national_id_last2: person.national_id_last2,
      status: person.status,
      submitted_at: person.submitted_at,
      fingerprint_code_hash: auth.fingerprint_code_hash,
      totp_secret_encrypted: auth.totp_secret_encrypted,
      totp_enabled_at: auth.totp_enabled_at,
      general_failed_attempts: auth.failed_attempts,
      general_locked_until: auth.locked_until,
    };
  }

  async findGeneralAuthByNationalIdHash(hash: string): Promise<GeneralAuthRecord | null> {
    const person = [...this.people.values()].find((item) => item.national_id_hash === hash);
    if (!person) return null;
    return this.toGeneral(person, this.ensureGeneral(person.id));
  }

  async registerGeneralFailure(personId: string, threshold: number, lockMinutes: number) {
    if (!this.people.has(personId)) return { failed_attempts: 0, locked: false };
    const auth = this.ensureGeneral(personId);
    const now = Date.now();
    if (auth.locked_until && new Date(auth.locked_until).getTime() > now) {
      return { failed_attempts: auth.failed_attempts, locked: true };
    }
    if (auth.locked_until && new Date(auth.locked_until).getTime() <= now) {
      auth.failed_attempts = 0;
      auth.locked_until = null;
    }
    auth.failed_attempts += 1;
    const locked = auth.failed_attempts >= threshold;
    if (locked) auth.locked_until = new Date(now + lockMinutes * 60_000).toISOString();
    return { failed_attempts: auth.failed_attempts, locked };
  }

  async claimFingerprintCode(personId: string, codeHash: string): Promise<"claimed" | "matched" | "mismatch" | "missing"> {
    if (!this.people.has(personId)) return "missing";
    const auth = this.ensureGeneral(personId);
    if (!auth.fingerprint_code_hash) {
      auth.fingerprint_code_hash = codeHash;
      auth.fingerprint_claimed_at = new Date().toISOString();
      return "claimed";
    }
    return safeEqual(auth.fingerprint_code_hash, codeHash) ? "matched" : "mismatch";
  }

  async beginGeneralChallenge(personId: string, input: GeneralChallengeInput): Promise<boolean> {
    const person = this.people.get(personId);
    if (!person) return false;
    const auth = this.ensureGeneral(personId);
    if (input.purpose === "enroll") {
      if (auth.totp_enabled_at || !input.totpSecretEncrypted) return false;
      auth.totp_secret_encrypted = input.totpSecretEncrypted;
      auth.totp_enabled_at = null;
    } else if (!auth.totp_enabled_at || !auth.totp_secret_encrypted) {
      return false;
    }
    auth.challenge_hash = input.challengeHash;
    auth.challenge_expires_at = input.expiresAt;
    auth.challenge_purpose = input.purpose;
    return true;
  }

  async findGeneralChallenge(challengeHash: string): Promise<GeneralChallengeRecord | null> {
    for (const [personId, auth] of this.generalAuth) {
      if (!auth.challenge_hash || !safeEqual(auth.challenge_hash, challengeHash) || !auth.challenge_purpose || !auth.challenge_expires_at) continue;
      const person = this.people.get(personId);
      if (!person) return null;
      return {
        person_id: person.id,
        first_names: person.first_names,
        last_names: person.last_names,
        national_id_last2: person.national_id_last2,
        status: person.status,
        submitted_at: person.submitted_at,
        purpose: auth.challenge_purpose,
        expires_at: auth.challenge_expires_at,
        totp_secret_encrypted: auth.totp_secret_encrypted,
        totp_enabled_at: auth.totp_enabled_at,
        general_locked_until: auth.locked_until,
      };
    }
    return null;
  }

  async completeGeneralChallenge(personId: string, challengeHash: string, mode: "enroll" | "verify"): Promise<boolean> {
    const auth = this.generalAuth.get(personId);
    if (!auth?.challenge_hash || !safeEqual(auth.challenge_hash, challengeHash) || auth.challenge_purpose !== mode) return false;
    if (mode === "enroll") {
      if (!auth.totp_secret_encrypted) return false;
      auth.totp_enabled_at = new Date().toISOString();
    }
    auth.challenge_hash = null;
    auth.challenge_expires_at = null;
    auth.challenge_purpose = null;
    auth.failed_attempts = 0;
    auth.locked_until = null;
    return true;
  }

  async assignFingerprintHash(nationalIdHash: string, codeHash: string): Promise<FingerprintAssignResult> {
    const person = [...this.people.values()].find((item) => item.national_id_hash === nationalIdHash);
    if (!person) return "not_found";
    const auth = this.ensureGeneral(person.id);
    if (!auth.fingerprint_code_hash) {
      auth.fingerprint_code_hash = codeHash;
      return "updated";
    }
    return safeEqual(auth.fingerprint_code_hash, codeHash) ? "unchanged" : "conflict";
  }

  async resetGeneralAuth(personId: string): Promise<boolean> {
    if (!this.people.has(personId)) return false;
    this.generalAuth.set(personId, {
      fingerprint_code_hash: null,
      fingerprint_claimed_at: null,
      totp_secret_encrypted: null,
      totp_enabled_at: null,
      failed_attempts: 0,
      locked_until: null,
      challenge_hash: null,
      challenge_expires_at: null,
      challenge_purpose: null,
    });
    const now = new Date().toISOString();
    for (const session of this.sessions.values()) {
      if (session.person_id === personId && !session.revoked_at) session.revoked_at = now;
    }
    return true;
  }
}

interface GeneralAuthState {
  fingerprint_code_hash: string | null;
  fingerprint_claimed_at: string | null;
  totp_secret_encrypted: string | null;
  totp_enabled_at: string | null;
  failed_attempts: number;
  locked_until: string | null;
  challenge_hash: string | null;
  challenge_expires_at: string | null;
  challenge_purpose: "enroll" | "verify" | null;
}

export function isMemoryRepo(repo: Repo): repo is MemoryRepo {
  return (repo as Partial<MemoryRepo>).isMemoryRepo === true;
}
