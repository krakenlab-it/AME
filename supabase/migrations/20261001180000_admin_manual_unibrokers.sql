-- KAN-115: correo para el enlace personal y eventos de auditoría del panel.
-- outreach_email es el correo al que se envía el enlace. No sustituye el correo que declara el titular.
-- El secreto TOTP sigue en Supabase Auth. Esta migración no guarda códigos ni claves de Unibrokers.

alter table people add column if not exists outreach_email text;

alter table audit_logs drop constraint if exists audit_logs_action_check;

alter table audit_logs add constraint audit_logs_action_check check (action in (
  'RECORD_OPENED', 'IDENTITY_VERIFIED', 'IDENTITY_FAILED', 'DATA_UPDATED', 'NAMES_CORRECTED',
  'CONSENT_ACCEPTED', 'FORM_SUBMITTED', 'ADMIN_VIEWED', 'ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED',
  'ADMIN_LOGOUT', 'MFA_ENROLLED', 'EXPORT_CREATED', 'IMPORT_CREATED', 'LINK_CREATED',
  'LINK_REVOKED', 'LINK_EMAIL_SENT', 'RECORD_REVIEWED', 'NOTICE_PUBLISHED', 'RETENTION_APPLIED',
  'MANUAL_EDIT', 'UNIBROKERS_EXPORT_CREATED'
));
