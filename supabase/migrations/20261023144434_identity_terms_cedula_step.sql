-- Segundo factor después del código de correo, y aceptación de términos.
-- Aplicar en prod ame-db a mano después del merge. No borra columnas, filas ni enlaces.
--
-- 1. people.general_challenge_purpose acepta 'cedula': el código de correo ya se
--    comprobó y el reto sigue abierto hasta la cédula. No reemplaza 'email'.
-- 2. people.general_challenge_auth_user_id guarda el usuario de Supabase Auth
--    entre el código y la cédula. Se limpia al cerrar el reto. No es el correo.
-- 3. audit_logs acepta IDENTITY_TERMS_ACCEPTED (momento en que aceptó el mecanismo).

alter table people add column if not exists general_challenge_auth_user_id uuid;

alter table people drop constraint if exists people_general_challenge_purpose_check;
alter table people add constraint people_general_challenge_purpose_check
  check (general_challenge_purpose is null or general_challenge_purpose in ('enroll', 'verify', 'email', 'cedula'));

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
  'IDENTITY_TERMS_ACCEPTED'
));
