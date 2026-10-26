import { randomUUID } from "node:crypto";
import { encrypt, keyedHash, safeEqual } from "@/lib/encryption/crypto";
import {
  RepoError,
  type AccessTokenRecord,
  type AdminUserRecord,
  type AuditEvent,
  type AuditRow,
  type AutoLinkRow,
  type CedulaLinkInput,
  type CedulaLinkMatch,
  type CedulaLinkResult,
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
  type GeneralChallengePurpose,
  type GeneralEmailLink,
  type LinkAccountResult,
  type LinkRequest,
  type NewPreloadedContact,
  type PreloadedContact,
  type PersonDetail,
  type PersonRecord,
  type UnibrokersSourceRow,
  type Repo,
  type RespondentSessionRecord,
  type SubmissionRecord,
  type UnlinkedAccountRow,
} from "@/lib/database/types";
import type { PersonStatus } from "@/lib/validation/constants";

/**
 * Implementación en memoria que replica las reglas de la base (incluida submit_person_data).
 * Se usa en las pruebas y en el modo demostración local (DEMO_MODE=true, nunca en producción).
 */
export class MemoryRepo implements Repo {
  /** Marca estructural: `instanceof` falla si Next carga el módulo en dos bundles distintos. */
  readonly isMemoryRepo = true as const;
  people = new Map<string, PersonRecord & { review_reasons: string[]; retention_until: string | null; anonymized_at?: string | null }>();
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
  /** Celular importado (E.164), por persona. */
  outreachPhones = new Map<string, string>();
  /** Cédula escrita por una cuenta propia, pendiente de que un admin la apruebe. */
  linkRequests = new Map<string, LinkRequest & { requested_at: string }>();
  nameChanges = new Map<string, PersonDetail["nameChanges"]>();
  /** Código dactilar solo hasheado y TOTP solo cifrado. No se mezcla con la ficha visible. */
  generalAuth = new Map<string, GeneralAuthState>();
  preloadedContacts: PreloadedContact[] = [];

  // ── helpers de prueba ──
  addPerson(firstNames: string, lastNames: string, cedula: string, status: PersonStatus = "PENDING") {
    const nationalIdHash = keyedHash(cedula, "national_id");
    this.assertNationalIdAvailable(nationalIdHash);
    const id = randomUUID();
    this.people.set(id, {
      id, first_names: firstNames, last_names: lastNames, national_id_encrypted: encrypt(cedula),
      national_id_hash: nationalIdHash, national_id_last2: cedula.slice(-2), status,
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
  async createAdmin(a: { email: string; full_name: string; role: AdminUserRecord["role"]; auth_user_id: string | null; must_change_password?: boolean }) {
    return this.createAdminSync(a);
  }
  createAdminSync(a: { email: string; full_name: string; role: AdminUserRecord["role"]; auth_user_id: string | null; must_change_password?: boolean }) {
    const rec: AdminUserRecord = {
      id: randomUUID(),
      email: a.email.toLowerCase(),
      full_name: a.full_name,
      role: a.role,
      auth_user_id: a.auth_user_id,
      mfa_enabled: false,
      active: true,
      last_login_at: null,
      must_change_password: a.must_change_password === true,
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
    for (const p of this.people.values()) if (!p.self_registered_at) c[p.status]++;
    return c;
  }
  async listAutoLinksSince(sinceIso: string): Promise<AutoLinkRow[]> {
    const since = new Date(sinceIso).getTime();
    return this.auditLog
      .filter((entry) => entry.action === "PERSON_AUTO_LINKED" && new Date(entry.created_at ?? 0).getTime() >= since)
      .slice(-30)
      .reverse()
      .map((entry) => ({
        personId: entry.person_id ?? null,
        maskedCedula: entry.masked_cedula ?? null,
        match: typeof entry.metadata?.match === "string" ? entry.metadata.match : "",
        createdAt: entry.created_at ?? new Date(0).toISOString(),
      }));
  }
  async pendingEmailInvites() {
    const linked = new Set<string>();
    for (const person of this.people.values()) {
      const login = person.login_email?.trim().toLowerCase();
      const outreach = this.outreachEmails.get(person.id)?.trim().toLowerCase();
      if (login) linked.add(login);
      if (outreach) linked.add(outreach);
    }
    return this.preloadedContacts.filter((contact) => {
      const email = contact.email?.trim().toLowerCase() ?? "";
      if (!email) return true;
      return !linked.has(email);
    }).length;
  }
  async existingPreloadedEmails(emails: string[]) {
    const wanted = new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean));
    return new Set(this.preloadedContacts.flatMap((contact) => (contact.email && wanted.has(contact.email) ? [contact.email] : [])));
  }
  async listPeople(q: { status?: PersonStatus; search?: string; nationalIdHash?: string; page: number; pageSize: number }) {
    const term = q.search?.toLowerCase();
    const all = [...this.people.values()].filter((p) =>
      !p.self_registered_at &&
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
      person: { ...p, created_at: now, updated_at: now, reviewed_at: null, anonymized_at: p.anonymized_at ?? null },
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
  async insertPeople(rows: { first_names: string; last_names: string; national_id_encrypted: string; national_id_hash: string; national_id_last2: string; outreach_email?: string | null; outreach_phone?: string | null }[]) {
    const seen = new Set([...this.people.values()].map((person) => person.national_id_hash).filter((hash): hash is string => Boolean(hash)));
    return rows.map((r) => {
      if (seen.has(r.national_id_hash)) throw new RepoError("UNKNOWN", "Error de base de datos (insertPeople)", "23505");
      seen.add(r.national_id_hash);
      const id = randomUUID();
      const { outreach_email: outreach, outreach_phone: phone, ...person } = r;
      this.people.set(id, { id, ...person, status: "PENDING", confirmation_code: null, submitted_at: null, review_reasons: [], retention_until: null });
      if (outreach) this.outreachEmails.set(id, outreach);
      if (phone) this.outreachPhones.set(id, phone);
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
      .filter((person) => !person.self_registered_at && (person.status === "PENDING" || person.status === "STARTED"))
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
    return [...this.people.values()].filter((person) => !person.self_registered_at).map((person) => {
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
      .filter((p) => !p.self_registered_at && (p.status === "PENDING" || p.status === "STARTED") && ![...this.tokens.values()].some((t) => t.person_id === p.id && !t.used_at && !t.revoked_at && new Date(t.expires_at).getTime() > now))
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
      challenge_email: null,
      challenge_sent_at: null,
      challenge_auth_user_id: null,
      auth_user_id: null,
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
      email_verified: Boolean(this.people.get(personId)?.login_email),
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
      login_email: person.login_email ?? null,
      outreach_email: this.outreachEmails.get(person.id) ?? null,
      self_registered_at: person.self_registered_at ?? null,
    };
  }

  async findGeneralAuthByLoginEmail(email: string): Promise<GeneralAuthRecord | null> {
    const matches = [...this.people.values()].filter((item) => item.login_email === email);
    const person = matches.find((item) => !item.self_registered_at) ?? matches[0];
    return person ? this.toGeneral(person, this.ensureGeneral(person.id)) : null;
  }

  async findUnboundByOutreachEmail(email: string): Promise<GeneralAuthRecord[]> {
    const wanted = email.toLowerCase();
    return [...this.people.values()]
      .filter((item) => !item.self_registered_at && item.national_id_hash && !item.login_email && this.outreachEmails.get(item.id)?.toLowerCase() === wanted)
      .slice(0, 3)
      .map((item) => this.toGeneral(item, this.ensureGeneral(item.id)));
  }

  async ensurePendingSelfAccount(email: string): Promise<GeneralAuthRecord | null> {
    for (const item of this.people.values()) {
      if (item.self_registered_at && !item.login_email && this.generalAuth.get(item.id)?.challenge_email === email) {
        return this.toGeneral(item, this.ensureGeneral(item.id));
      }
    }
    const id = randomUUID();
    const person = {
      id, first_names: "Sin nombre", last_names: "Registrado", national_id_encrypted: null, national_id_hash: null, national_id_last2: null,
      status: "PENDING" as const, confirmation_code: null, submitted_at: null, review_reasons: [], retention_until: null,
      login_email: null, self_registered_at: new Date().toISOString(),
    };
    this.people.set(id, person);
    this.ensureGeneral(id).challenge_email = email;
    return this.toGeneral(person, this.ensureGeneral(id));
  }

  async setLinkRequest(personId: string, request: LinkRequest | null) {
    if (!this.people.get(personId)?.self_registered_at) return;
    if (!request) {
      this.linkRequests.delete(personId);
      return;
    }
    this.linkRequests.set(personId, { ...request, requested_at: new Date().toISOString() });
  }

  async releaseSelfAccount(email: string, authUserId: string | null, keepPersonId: string) {
    for (const item of [...this.people.values()]) {
      if (item.id === keepPersonId || !item.self_registered_at || item.national_id_hash) continue;
      const auth = this.generalAuth.get(item.id);
      if (item.login_email === email || (authUserId && auth?.auth_user_id === authUserId)) this.removeSelfAccount(item.id);
    }
  }

  private removeSelfAccount(id: string) {
    this.people.delete(id);
    this.generalAuth.delete(id);
    this.linkRequests.delete(id);
    for (const [sessionId, session] of this.sessions) if (session.person_id === id) this.sessions.delete(sessionId);
  }

  async listUnlinkedAccounts(limit: number): Promise<UnlinkedAccountRow[]> {
    return [...this.people.values()]
      .filter((item) => item.self_registered_at && item.login_email)
      .sort((a, b) => (b.self_registered_at ?? "").localeCompare(a.self_registered_at ?? ""))
      .slice(0, limit)
      .map((item) => {
        const request = this.linkRequests.get(item.id);
        return {
          id: item.id,
          login_email: item.login_email!,
          login_email_verified_at: item.self_registered_at ?? null,
          created_at: item.self_registered_at!,
          link_request_national_id_hash: request?.national_id_hash ?? null,
          link_request_national_id_last2: request?.national_id_last2 ?? null,
        };
      });
  }

  async linkSelfAccount(accountId: string, personId: string, adminId: string): Promise<LinkAccountResult> {
    const account = this.people.get(accountId);
    if (!account?.self_registered_at || account.national_id_hash || !account.login_email) return "account_missing";
    const person = this.people.get(personId);
    if (!person || person.self_registered_at || !person.national_id_hash) return "person_missing";
    if (person.login_email && person.login_email !== account.login_email) return "person_bound";
    const authUserId = this.generalAuth.get(accountId)?.auth_user_id ?? null;
    for (const entry of this.auditLog) if (entry.person_id === accountId) entry.person_id = personId;
    const email = account.login_email;
    this.deletePerson(accountId);
    person.login_email = email;
    const auth = this.ensureGeneral(personId);
    if (authUserId) auth.auth_user_id = authUserId;
    auth.failed_attempts = 0;
    auth.locked_until = null;
    await this.audit({ person_id: personId, actor_type: "admin", actor_id: adminId, action: "ACCOUNT_LINKED", changed_fields: ["login_email", "auth_user_id"], metadata: { entry: "admin" } });
    return "linked";
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
    if (input.purpose === "email") {
      if (!input.email) return false;
      auth.challenge_email = input.email;
      auth.challenge_sent_at = input.sentAt ?? new Date().toISOString();
    } else if (input.purpose === "enroll") {
      if (auth.totp_enabled_at || !input.totpSecretEncrypted) return false;
      auth.totp_secret_encrypted = input.totpSecretEncrypted;
      auth.totp_enabled_at = null;
    } else if (input.purpose === "verify") {
      if (!auth.totp_enabled_at || !auth.totp_secret_encrypted) return false;
    } else if (input.purpose === "cedula") {
      return false;
    } else {
      const unexpected: never = input.purpose;
      return unexpected;
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
        pending_email: auth.challenge_email ?? null,
        sent_at: auth.challenge_sent_at ?? null,
        auth_user_id: auth.challenge_auth_user_id ?? null,
      };
    }
    return null;
  }

  async touchGeneralChallengeSent(personId: string, challengeHash: string, sentAt: string): Promise<boolean> {
    const auth = this.generalAuth.get(personId);
    if (!auth?.challenge_hash || !safeEqual(auth.challenge_hash, challengeHash) || auth.challenge_purpose !== "email") return false;
    auth.challenge_sent_at = sentAt;
    return true;
  }

  async markEmailCodeVerified(personId: string, challengeHash: string, authUserId: string | null): Promise<boolean> {
    const auth = this.generalAuth.get(personId);
    if (!auth?.challenge_hash || !safeEqual(auth.challenge_hash, challengeHash) || auth.challenge_purpose !== "email") return false;
    auth.challenge_purpose = "cedula";
    auth.challenge_auth_user_id = authUserId;
    return true;
  }

  async promoteEmailChallenge(fromPersonId: string, toPersonId: string, challengeHash: string): Promise<boolean> {
    if (fromPersonId === toPersonId) return false;
    const from = this.people.get(fromPersonId);
    const to = this.people.get(toPersonId);
    const auth = this.generalAuth.get(fromPersonId);
    if (!from?.self_registered_at || from.national_id_hash || !to || to.self_registered_at || !to.national_id_hash) return false;
    if (!auth?.challenge_hash || !safeEqual(auth.challenge_hash, challengeHash) || auth.challenge_purpose !== "cedula" || !auth.challenge_email) return false;
    if (to.login_email && to.login_email !== auth.challenge_email) return false;
    const target = this.ensureGeneral(toPersonId);
    target.challenge_hash = auth.challenge_hash;
    target.challenge_expires_at = auth.challenge_expires_at;
    target.challenge_purpose = "cedula";
    target.challenge_email = auth.challenge_email;
    target.challenge_sent_at = auth.challenge_sent_at ?? null;
    target.challenge_auth_user_id = auth.challenge_auth_user_id ?? null;
    for (const entry of this.auditLog) if (entry.person_id === fromPersonId) entry.person_id = toPersonId;
    this.deletePerson(fromPersonId);
    return true;
  }

  async completeGeneralChallenge(personId: string, challengeHash: string, mode: GeneralChallengePurpose, link?: GeneralEmailLink): Promise<boolean> {
    const auth = this.generalAuth.get(personId);
    if (!auth?.challenge_hash || !safeEqual(auth.challenge_hash, challengeHash) || auth.challenge_purpose !== mode) return false;
    if (mode === "email" || mode === "cedula") {
      if (!link?.email) return false;
      const bound = this.people.get(personId)?.login_email;
      if (bound && bound !== link.email) return false;
      if (link.authUserId) {
        for (const [otherId, other] of this.generalAuth) {
          if (otherId !== personId && other.auth_user_id === link.authUserId) return false;
        }
        auth.auth_user_id = link.authUserId;
      }
      const person = this.people.get(personId);
      if (person) person.login_email = link.email;
      auth.challenge_email = null;
      auth.challenge_sent_at = null;
      auth.challenge_auth_user_id = null;
    } else if (mode === "enroll") {
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
      challenge_email: null,
      challenge_sent_at: null,
      challenge_auth_user_id: null,
      auth_user_id: null,
    });
    const reset = this.people.get(personId);
    if (reset) reset.login_email = null;
    const now = new Date().toISOString();
    for (const session of this.sessions.values()) {
      if (session.person_id === personId && !session.revoked_at) session.revoked_at = now;
    }
    return true;
  }

  async insertPreloadedContacts(rows: NewPreloadedContact[], batchId: string, adminId: string): Promise<number> {
    void batchId;
    void adminId;
    for (const row of rows) {
      const email = row.email?.trim().toLowerCase() || null;
      if (email && this.preloadedContacts.some((item) => item.email === email)) {
        throw new RepoError("UNKNOWN", "Error de base de datos (insertPreloadedContacts)", "23505");
      }
      this.preloadedContacts.push({
        email,
        phone: row.phone,
        firstNames: row.firstNames || "Sin nombre",
        lastNames: row.lastNames || "Registrado",
        comunidad: row.comunidad,
      });
    }
    return rows.length;
  }

  async findPreloadedContactByEmail(email: string): Promise<PreloadedContact | null> {
    const wanted = email.trim().toLowerCase();
    return this.preloadedContacts.find((item) => item.email === wanted) ?? null;
  }

  async bindAllowlistedIdentity(personId: string, identity: { nationalIdEncrypted: string; nationalIdHash: string; nationalIdLast2: string; firstNames: string; lastNames: string; phone: string | null }): Promise<boolean> {
    const person = this.people.get(personId);
    if (!person) return false;
    this.assertNationalIdAvailable(identity.nationalIdHash, personId);
    person.national_id_encrypted = identity.nationalIdEncrypted;
    person.national_id_hash = identity.nationalIdHash;
    person.national_id_last2 = identity.nationalIdLast2;
    person.first_names = identity.firstNames;
    person.last_names = identity.lastNames;
    person.self_registered_at = null;
    if (identity.phone) {
      person.outreach_phone = identity.phone;
      this.outreachPhones.set(personId, identity.phone);
    }
    return true;
  }

  async commitCedulaLink(input: CedulaLinkInput): Promise<CedulaLinkResult> {
    const holder = this.people.get(input.holderId);
    const holderAuth = holder ? this.generalAuth.get(holder.id) : undefined;
    if (!holder || holder.anonymized_at || !holderAuth?.challenge_hash || holderAuth.challenge_purpose !== "cedula" || holderAuth.challenge_email !== input.email) {
      return { status: "missing" };
    }
    if (!safeEqual(holderAuth.challenge_hash, input.challengeHash)) return { status: "missing" };
    if (holder.national_id_hash && !safeEqual(holder.national_id_hash, input.nationalIdHash)) {
      return { status: "cedula_mismatch", personId: holder.id };
    }

    const existing = [...this.people.values()].find((person) => person.national_id_hash && safeEqual(person.national_id_hash, input.nationalIdHash) && !person.anonymized_at);
    const target = holder.national_id_hash ? holder : existing ?? holder;
    const targetAuth = this.ensureGeneral(target.id);
    if (targetAuth.locked_until && new Date(targetAuth.locked_until).getTime() > Date.now()) {
      return { status: "locked", personId: target.id, lockedUntil: targetAuth.locked_until };
    }
    const boundEmail = target.login_email?.trim().toLowerCase() ?? null;
    if ((targetAuth.auth_user_id && targetAuth.auth_user_id !== input.authUserId) || (boundEmail && boundEmail !== input.email)) {
      return { status: "auth_conflict", personId: target.id, loginEmail: target.login_email ?? null };
    }
    if (targetAuth.fingerprint_code_hash && !safeEqual(targetAuth.fingerprint_code_hash, input.fingerprintHash)) {
      return { status: "fingerprint_mismatch", personId: target.id };
    }
    if (input.authUserId) {
      for (const [otherId, other] of this.generalAuth) {
        if (otherId !== target.id && other.auth_user_id === input.authUserId) {
          return { status: "auth_conflict", personId: otherId, loginEmail: this.people.get(otherId)?.login_email ?? null };
        }
      }
    }

    const linkingExisting = target.id !== holder.id || Boolean(holder.national_id_hash);
    const match: CedulaLinkMatch = linkingExisting
      ? (targetAuth.fingerprint_code_hash ? "dactilar_match" : "dactilar_first_use")
      : (input.preload ? "preload" : "new");
    const audited = match === "preload" || match === "new" || !target.login_email || !targetAuth.fingerprint_code_hash;

    if (!target.national_id_hash) {
      if (this.nationalIdTaken(input.nationalIdHash, target.id)) return { status: "duplicate" };
      target.national_id_encrypted = input.nationalIdEncrypted;
      target.national_id_hash = input.nationalIdHash;
      target.national_id_last2 = input.nationalIdLast2;
    }
    if (match === "preload" && input.preload) {
      target.first_names = input.preload.firstNames;
      target.last_names = input.preload.lastNames;
      target.self_registered_at = null;
      if (input.preload.phone) {
        target.outreach_phone = input.preload.phone;
        this.outreachPhones.set(target.id, input.preload.phone);
      }
    }
    if (!targetAuth.fingerprint_code_hash) {
      targetAuth.fingerprint_code_hash = input.fingerprintHash;
      targetAuth.fingerprint_claimed_at = new Date().toISOString();
    }
    if (holder.id !== target.id) {
      targetAuth.challenge_hash = holderAuth.challenge_hash;
      targetAuth.challenge_expires_at = holderAuth.challenge_expires_at;
      targetAuth.challenge_purpose = "cedula";
      targetAuth.challenge_email = holderAuth.challenge_email;
      targetAuth.challenge_sent_at = holderAuth.challenge_sent_at ?? null;
      targetAuth.challenge_auth_user_id = holderAuth.challenge_auth_user_id ?? null;
      for (const entry of this.auditLog) if (entry.person_id === holder.id) entry.person_id = target.id;
      this.deletePerson(holder.id);
    }
    target.login_email = input.email;
    if (input.authUserId) targetAuth.auth_user_id = input.authUserId;
    targetAuth.challenge_hash = null;
    targetAuth.challenge_expires_at = null;
    targetAuth.challenge_purpose = null;
    targetAuth.challenge_email = null;
    targetAuth.challenge_sent_at = null;
    targetAuth.challenge_auth_user_id = null;
    targetAuth.failed_attempts = 0;
    targetAuth.locked_until = null;
    this.linkRequests.delete(target.id);
    this.releaseSelfAccount(input.email, input.authUserId, target.id);
    if (audited) {
      await this.audit({
        person_id: target.id,
        actor_type: "respondent",
        action: "PERSON_AUTO_LINKED",
        changed_fields: ["login_email", "auth_user_id", "fingerprint_code_hash"],
        metadata: { match, entry: "general" },
        recorded_person_id: target.id,
        masked_cedula: input.maskedCedula,
      });
    }
    return { status: "linked", personId: target.id, match, audited };
  }

  private nationalIdTaken(hash: string, exceptId?: string): boolean {
    return [...this.people.values()].some((person) => person.id !== exceptId && person.national_id_hash === hash);
  }

  private assertNationalIdAvailable(hash: string, exceptId?: string) {
    if (this.nationalIdTaken(hash, exceptId)) throw new RepoError("UNKNOWN", "Error de base de datos (national_id_hash)", "23505");
  }

  async getPersonLifecycle(personId: string) {
    const person = this.people.get(personId);
    if (!person) return null;
    return {
      id: person.id,
      authUserId: this.generalAuth.get(personId)?.auth_user_id ?? null,
      nationalIdEncrypted: person.national_id_encrypted,
      nationalIdLast2: person.national_id_last2,
      outreachEmail: this.outreachEmails.get(personId) ?? null,
      submittedAt: person.submitted_at,
      anonymizedAt: person.anonymized_at ?? null,
    };
  }

  async resetPersonToGuest(personId: string, keepAuthUser: boolean): Promise<boolean> {
    const person = this.people.get(personId);
    if (!person) return false;
    const keptAuth = keepAuthUser ? this.generalAuth.get(personId)?.auth_user_id ?? null : null;
    const keptLogin = keepAuthUser ? person.login_email ?? null : null;
    this.submissions.delete(personId);
    this.profiles.delete(personId);
    this.nameChanges.delete(personId);
    this.linkRequests.delete(personId);
    for (const [id, token] of this.tokens) if (token.person_id === personId) this.tokens.delete(id);
    for (const [id, session] of this.sessions) if (session.person_id === personId) this.sessions.delete(id);
    person.status = "PENDING";
    person.confirmation_code = null;
    person.submitted_at = null;
    person.review_reasons = [];
    person.retention_until = null;
    person.login_email = keptLogin;
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
      challenge_email: null,
      challenge_sent_at: null,
      challenge_auth_user_id: null,
      auth_user_id: keptAuth,
    });
    return true;
  }

  async deletePerson(personId: string): Promise<boolean> {
    if (!this.people.has(personId)) return false;
    this.people.delete(personId);
    this.submissions.delete(personId);
    this.profiles.delete(personId);
    this.nameChanges.delete(personId);
    this.linkRequests.delete(personId);
    this.outreachEmails.delete(personId);
    this.outreachPhones.delete(personId);
    this.generalAuth.delete(personId);
    for (const [id, token] of this.tokens) if (token.person_id === personId) this.tokens.delete(id);
    for (const [id, session] of this.sessions) if (session.person_id === personId) this.sessions.delete(id);
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
  challenge_purpose: GeneralChallengePurpose | null;
  challenge_email?: string | null;
  challenge_sent_at?: string | null;
  challenge_auth_user_id?: string | null;
  auth_user_id?: string | null;
}

export function isMemoryRepo(repo: Repo): repo is MemoryRepo {
  return (repo as Partial<MemoryRepo>).isMemoryRepo === true;
}
