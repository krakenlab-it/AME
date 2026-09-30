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
  | "LINK_REVOKED" | "RECORD_REVIEWED" | "NOTICE_PUBLISHED" | "RETENTION_APPLIED";

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

export interface RespondentSessionRecord {
  id: string;
  session_hash: string;
  person_id: string;
  access_token_id: string;
  expires_at: string;
  submitted_at: string | null;
  revoked_at: string | null;
}

export interface SubmissionRecord {
  person_id: string;
  session_id: string;
  access_token_id: string;
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
  registerTokenFailure(tokenId: string, threshold: number): Promise<{ failed_attempts: number; locked: boolean }>;
  getPerson(id: string): Promise<PersonRecord | null>;
  markStarted(personId: string): Promise<void>;
  createRespondentSession(s: { session_hash: string; person_id: string; access_token_id: string; expires_at: string }): Promise<RespondentSessionRecord>;
  findRespondentSession(sessionHash: string): Promise<RespondentSessionRecord | null>;
  revokeRespondentSession(id: string): Promise<void>;
  submitPersonData(s: SubmissionRecord): Promise<{ confirmation_code: string }>;
  getActiveNotice(): Promise<NoticeRecord | null>;
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
}

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
}

export type Repo = RespondentRepo & AdminRepo;
