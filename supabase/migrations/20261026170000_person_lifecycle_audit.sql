-- Restablecer o eliminar una ficha desde el perfil admin.
-- Aplicar en prod ame-db a mano después del merge. No borra filas por sí solo.
--
-- audit_logs.person_id queda en null al borrar la persona (ON DELETE SET NULL).
-- recorded_person_id, masked_cedula y reason no tienen clave foránea: la fila sigue
-- diciendo quién era, qué documento enmascarado tenía y por qué.

alter table audit_logs add column if not exists recorded_person_id uuid;
alter table audit_logs add column if not exists masked_cedula text;
alter table audit_logs add column if not exists reason text;

alter table audit_logs drop constraint if exists audit_logs_action_check;
alter table audit_logs add constraint audit_logs_action_check check (action in (
  'RECORD_OPENED', 'IDENTITY_VERIFIED', 'IDENTITY_FAILED', 'DATA_UPDATED', 'NAMES_CORRECTED',
  'CONSENT_ACCEPTED', 'FORM_SUBMITTED', 'ADMIN_VIEWED', 'ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED',
  'ADMIN_LOGOUT', 'MFA_ENROLLED', 'EXPORT_CREATED', 'IMPORT_CREATED', 'LINK_CREATED',
  'LINK_REVOKED', 'LINK_EMAIL_SENT', 'RECORD_REVIEWED', 'NOTICE_PUBLISHED', 'RETENTION_APPLIED',
  'MANUAL_EDIT', 'UNIBROKERS_EXPORT_CREATED',
  'GENERAL_IDENTIFY_FAILED', 'FINGERPRINT_CLAIMED', 'FINGERPRINT_IMPORTED', 'FINGERPRINT_RESET',
  'TOTP_ENROLLED', 'TOTP_RESET',
  'EMAIL_CODE_SENT', 'EMAIL_VERIFIED',
  'ACCOUNT_CREATED', 'ACCOUNT_LINKED', 'ACCOUNT_LINK_REQUESTED',
  'IDENTITY_TERMS_ACCEPTED',
  'PERSON_RESET_TO_GUEST', 'PERSON_DELETED'
));
