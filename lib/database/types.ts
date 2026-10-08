/**
 * Contratos de acceso a datos. Los servicios dependen de estas interfaces, no de Supabase,
 * para poder sustituir el proveedor (u otro PostgreSQL) y probar con un repositorio en memoria.
 */
import type { PersonStatus } from "@/lib/validation/constants";
import type { AdminRole } from "@/lib/security/rbac";

export type AuditAction =
  | "RECORD_OPENED" | "IDENTITY_VERIFIED" | "IDENTITY_FAILED" | "DATA_UPDATED" | "NAMES_CORRECTED"
  | "CONSENT_ACCEPTED" | "FORM_SUBMITTED" | "ADMIN_VIEWED" | "ADMIN_LOGIN" | "ADMIN_LOGIN_FAILED"
  | "ADMIN_LOGOUT" | "MFA_ENROLLED" | "EXPORT_CREATED" | "IMPORT_CREATED" | "LINK_CREATED"
  | "LINK_REVOKED" | "LINK_EMAIL_SENT" | "RECORD_REVIEWED" | "NOTICE_PUBLISHED" | "RETENTION_APPLIED"
  | "MANUAL_EDIT" | "UNIBROKERS_EXPORT_CREATED"
  | "GENERAL_IDENTIFY_FAILED" | "FINGERPRINT_CLAIMED" | "FINGERPRINT_IMPORTED" | "FINGERPRINT_RESET"
  | "TOTP_ENROLLED" | "TOTP_RESET";

export interface AuditEvent {
  person_id?: string | null;
  actor_type: "respondent" | "admin" | "system";
  actor_id?: string | null;
  action: AuditAction;
  /** Solo NOMBRES de campos, nunca valores. */
  changed_fields?: string[];
  metadata?: Record<string, unknown>;
}

export interface PersonRecord {
  id: string;
  first_names: string;
  last_names: string;
  national_id_encrypted: string | null;
  national_id_hash: string | null;
  national_id_last2: string | null;
  status: PersonStatus;
  confirmation_code: string | null;
  submitted_at: string | null;
}

export interface AccessTokenRecord {
  id: string;
  person_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  failed_attempts: number;
}

export type EntryMethod = "token" | "general";

export interface RespondentSessionRecord {
  id: string;
  session_hash: string;
  person_id: string;
  access_token_id: string | null;
  entry_method: EntryMethod;
  expires_at: string;
  submitted_at: string | null;
  revoked_at: string | null;
}

export interface SubmissionRecord {
  person_id: string;
  session_id: string;
  access_token_id: string | null;
  names_changed: boolean;
  first_names: string;
  last_names: string;
  contact: {
    primary_email: string;
    secondary_email: string;
    mobile_phone: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    province: string;
    country: string;
    postal_code: string;
  };
  bank: {
    bank_name: string;
    bank_other_name: string;
    account_type: string;
    account_number_encrypted: string;
    account_number_last4: string;
    account_holder_name: string;
    account_holder_national_id_encrypted: string;
    holder_is_titular: boolean;
    ownership_declared: boolean;
  };
  consents: { type: string; text_hash: string }[];
  notice_version: string;
  purpose: string;
  confirmation_code: string;
  retention_until: string;
  review_reasons: string[];
  changed_fields: string[];
}

export class RepoError extends Error {
  constructor(public code: "ALREADY_SUBMITTED" | "SESSION_INVALID" | "TOKEN_INVALID" | "PERSON_NOT_FOUND" | "DUPLICATE_CODE" | "UNKNOWN", message?: string) {
    super(message ?? code);
  }
}

export interface NoticeRecord {
  id: string;
  version: string;
  body: string;
  body_hash: string;
  effective_date: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Titular ──────────────────────────────────────────────────────────────────
export interface RespondentRepo {
  rateLimitHit(bucket: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; hits: number }>;
  logSecurityEvent(e: { event_type: string; ip_hash: string | null; detail?: Record<string, unknown> }): Promise<void>;
  audit(e: AuditEvent): Promise<void>;
  findAccessToken(tokenHash: string): Promise<AccessTokenRecord | null>;
  /** Persona importada con cédula exacta (HMAC). No crea registros. */
  findPersonByNationalIdHash(hash: string): Promise<PersonRecord | null>;
  /** Enlace activo para retomar el formulario (sin usar, no revocado, vigente). */
  findResumableAccessToken(personId: string): Promise<AccessTokenRecord | null>;
  registerTokenFailure(tokenId: string, threshold: number): Promise<{ failed_attempts: number; locked: boolean }>;
  getPerson(id: string): Promise<PersonRecord | null>;
  markStarted(personId: string): Promise<void>;
  createRespondentSession(s: { session_hash: string; person_id: string; access_token_id: string | null; entry_method: EntryMethod; expires_at: string; submitted_at?: string | null }): Promise<RespondentSessionRecord>;
  findRespondentSession(sessionHash: string): Promise<RespondentSessionRecord | null>;
  revokeRespondentSession(id: string): Promise<void>;
  submitPersonData(s: SubmissionRecord): Promise<{ confirmation_code: string }>;
  getActiveNotice(): Promise<NoticeRecord | null>;
  /** Resumen del propio titular. Sin cédula ni cuenta en claro. */
  getInsuredRecord(personId: string): Promise<InsuredRecord | null>;
  /** Cédula hasheada más el código dactilar (hash) y el TOTP cifrado. No va al navegador. */
  findGeneralAuthByNationalIdHash(hash: string): Promise<GeneralAuthRecord | null>;
  registerGeneralFailure(personId: string, threshold: number, lockMinutes: number): Promise<{ failed_attempts: number; locked: boolean }>;
  claimFingerprintCode(personId: string, codeHash: string): Promise<"claimed" | "matched" | "mismatch" | "missing">;
  beginGeneralChallenge(personId: string, input: GeneralChallengeInput): Promise<boolean>;
  findGeneralChallenge(challengeHash: string): Promise<GeneralChallengeRecord | null>;
  completeGeneralChallenge(personId: string, challengeHash: string, mode: "enroll" | "verify"): Promise<boolean>;
}

/** Lo que el titular puede ver de su propio registro. Nunca incluye cédula ni cuenta en claro. */
export interface InsuredRecord {
  person: PersonRecord & { review_reasons: string[] };
  contact: {
    primary_email: string | null;
    secondary_email: string | null;
    mobile_phone: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
  } | null;
  bank: {
    bank_name: string;
    bank_other_name: string | null;
    account_type: string;
    account_number_last4: string;
    holder_is_titular: boolean;
  } | null;
  notice_version: string | null;
}

// ── Administración ───────────────────────────────────────────────────────────
/**
 * Perfil del panel. La contraseña y el secreto TOTP viven en Supabase Auth,
 * no en esta fila. auth_user_id vincula el usuario de Auth con el rol.
 */
export interface AdminUserRecord {
  id: string;
  email: string;
  full_name: string;
  role: AdminRole;
  auth_user_id: string | null;
  mfa_enabled: boolean;
  active: boolean;
  last_login_at: string | null;
}

export interface PersonListRow {
  id: string;
  first_names: string;
  last_names: string;
  national_id_last2: string | null;
  status: PersonStatus;
  confirmation_code: string | null;
  submitted_at: string | null;
  updated_at: string;
}

export interface PersonDetail {
  person: PersonRecord & { created_at: string; updated_at: string; review_reasons: string[]; reviewed_at: string | null; anonymized_at: string | null; retention_until: string | null };
  contact: Record<string, string | null> | null;
  bank: {
    bank_name: string;
    bank_other_name: string | null;
    account_type: string;
    account_number_last4: string;
    account_holder_name: string;
    holder_is_titular: boolean;
    ownership_declared: boolean;
    updated_at: string;
  } | null;
  consents: { consent_type: string; privacy_notice_version: string; accepted_at: string | null; revoked_at: string | null; session_id: string | null; consent_text_hash: string }[];
  nameChanges: { original_first_names: string; original_last_names: string; new_first_names: string; new_last_names: string; created_at: string }[];
  tokens: { id: string; expires_at: string; used_at: string | null; revoked_at: string | null; revoked_reason: string | null; failed_attempts: number; created_at: string }[];
  audit: AuditRow[];
  /** Correo para enviar el enlace personal. No reemplaza el correo que declara el titular. */
  outreach_email: string | null;
  /** Solo indicadores. Nunca el código ni el secreto TOTP. */
  general_access: { fingerprint_set: boolean; totp_enabled: boolean; locked: boolean };
}

/** Datos del enlace general. El secreto TOTP va cifrado. El código dactilar solo como hash. */
export interface GeneralAuthRecord {
  id: string;
  first_names: string;
  last_names: string;
  national_id_last2: string | null;
  status: PersonStatus;
  submitted_at: string | null;
  fingerprint_code_hash: string | null;
  totp_secret_encrypted: string | null;
  totp_enabled_at: string | null;
  general_failed_attempts: number;
  general_locked_until: string | null;
}

export interface GeneralChallengeInput {
  purpose: "enroll" | "verify";
  challengeHash: string;
  expiresAt: string;
  /** Solo en el alta. Ya cifrado. */
  totpSecretEncrypted?: string;
}

export interface GeneralChallengeRecord {
  person_id: string;
  first_names: string;
  last_names: string;
  national_id_last2: string | null;
  status: PersonStatus;
  submitted_at: string | null;
  purpose: "enroll" | "verify";
  expires_at: string;
  totp_secret_encrypted: string | null;
  totp_enabled_at: string | null;
  general_locked_until: string | null;
}

export type FingerprintAssignResult = "updated" | "unchanged" | "not_found" | "conflict";

export interface AuditRow {
  id: number;
  person_id: string | null;
  actor_type: string;
  actor_id: string | null;
  action: string;
  changed_fields: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface NewPersonRow {
  first_names: string;
  last_names: string;
  national_id_encrypted: string;
  national_id_hash: string;
  national_id_last2: string;
  outreach_email?: string | null;
}

/** Corrección hecha por un administrador, después de confirmar el código TOTP. */
export interface ManualPersonPatch {
  first_names: string;
  last_names: string;
  outreach_email: string | null;
  contact: {
    primary_email: string;
    secondary_email: string | null;
    mobile_phone: string;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    province: string;
    country: string;
    postal_code: string | null;
  } | null;
}

export interface LinkMailTarget {
  id: string;
  first_names: string;
  last_names: string;
  email: string | null;
  national_id_last2: string | null;
  status: PersonStatus;
  has_active_token: boolean;
}

/** Carga de contacto para operaciones. Sin número de cuenta. */
export interface UnibrokersSourceRow {
  person_id: string;
  status: PersonStatus;
  confirmation_code: string | null;
  first_names: string;
  last_names: string;
  national_id_encrypted: string | null;
  outreach_email: string | null;
  primary_email: string | null;
  mobile_phone: string | null;
  city: string | null;
  province: string | null;
  submitted_at: string | null;
}

export interface ExportSourceRow {
  person_id: string;
  confirmation_code: string | null;
  first_names: string;
  last_names: string;
  national_id_encrypted: string | null;
  submitted_at: string | null;
  primary_email: string | null;
  secondary_email: string | null;
  mobile_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  postal_code: string | null;
  bank_name: string | null;
  bank_other_name: string | null;
  account_type: string | null;
  account_number_encrypted: string | null;
  account_holder_name: string | null;
  account_holder_national_id_encrypted: string | null;
  consent_accepted_at: string | null;
  privacy_notice_version: string | null;
}

export interface AdminRepo {
  audit(e: AuditEvent): Promise<void>;
  rateLimitHit(bucket: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; hits: number }>;
  logSecurityEvent(e: { event_type: string; ip_hash: string | null; detail?: Record<string, unknown> }): Promise<void>;
  // auth
  findAdminByEmail(email: string): Promise<AdminUserRecord | null>;
  findAdminByAuthUserId(authUserId: string): Promise<AdminUserRecord | null>;
  getAdmin(id: string): Promise<AdminUserRecord | null>;
  createAdmin(a: { email: string; full_name: string; role: AdminRole; auth_user_id: string | null }): Promise<AdminUserRecord>;
  updateAdmin(id: string, patch: Partial<Pick<AdminUserRecord, "mfa_enabled" | "active" | "auth_user_id" | "full_name" | "role">> & { last_login_at?: string | null }): Promise<void>;
  // people
  statusCounts(): Promise<Record<PersonStatus, number>>;
  listPeople(q: { status?: PersonStatus; search?: string; nationalIdHash?: string; page: number; pageSize: number }): Promise<{ rows: PersonListRow[]; total: number }>;
  getPersonDetail(id: string): Promise<PersonDetail | null>;
  markReviewed(personId: string, adminId: string): Promise<void>;
  existingNationalIdHashes(hashes: string[]): Promise<Set<string>>;
  createImportBatch(b: { admin_id: string; filename: string; total_rows: number; imported_rows: number; rejected_rows: number }): Promise<string>;
  insertPeople(rows: NewPersonRow[], batchId: string): Promise<{ id: string; national_id_hash: string }[]>;
  createAccessTokens(items: { person_id: string; token_hash: string; expires_at: string; created_by: string }[]): Promise<void>;
  revokeTokensForPerson(personId: string, reason: string): Promise<number>;
  listPersonIdsWithoutActiveToken(personIds?: string[]): Promise<string[]>;
  applyManualEdit(personId: string, patch: ManualPersonPatch): Promise<{ changed: string[] } | null>;
  listLinkMailTargets(): Promise<LinkMailTarget[]>;
  getUnibrokersRows(): Promise<UnibrokersSourceRow[]>;
  // export
  getExportRows(): Promise<ExportSourceRow[]>;
  recordExport(e: { admin_id: string; purpose: string; profile: string; record_count: number; fields: string[]; format: string }): Promise<void>;
  // notices & audit
  getActiveNotice(): Promise<NoticeRecord | null>;
  listNotices(): Promise<NoticeRecord[]>;
  publishNotice(n: { version: string; body: string; body_hash: string; effective_date: string | null; created_by: string }): Promise<NoticeRecord>;
  listAudit(q: { page: number; pageSize: number; action?: string }): Promise<{ rows: AuditRow[]; total: number }>;
  recentSecurityEvents(limit: number): Promise<{ event_type: string; created_at: string; detail: Record<string, unknown> }[]>;
  // retention
  anonymizeExpired(): Promise<number>;
  purgeExpiredSessions(): Promise<void>;
  assignFingerprintHash(nationalIdHash: string, codeHash: string): Promise<FingerprintAssignResult>;
  resetGeneralAuth(personId: string): Promise<boolean>;
}

export type Repo = RespondentRepo & AdminRepo;
