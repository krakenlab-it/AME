-- Ingreso general por correo: cédula + correo, código de 6 números enviado por Supabase Auth (signInWithOtp)
-- y verificado con verifyOtp(type 'email'). Reemplaza el paso de Google Authenticator (TOTP) en /ingresar.
-- Aplicar en prod ame-db después del merge. No borra columnas TOTP: AME_GENERAL_AUTH_METHOD=totp sigue funcionando.

alter table people add column if not exists login_email text;
alter table people add column if not exists login_email_verified_at timestamptz;
alter table people add column if not exists auth_user_id uuid;
alter table people add column if not exists general_challenge_email text;
alter table people add column if not exists general_challenge_sent_at timestamptz;

-- Un usuario de Supabase Auth queda vinculado a una sola cédula.
create unique index if not exists people_auth_user_id_idx on people (auth_user_id) where auth_user_id is not null;

alter table people drop constraint if exists people_general_challenge_purpose_check;
alter table people add constraint people_general_challenge_purpose_check
  check (general_challenge_purpose is null or general_challenge_purpose in ('enroll', 'verify', 'email'));

alter table audit_logs drop constraint if exists audit_logs_action_check;
alter table audit_logs add constraint audit_logs_action_check check (action in (
  'RECORD_OPENED', 'IDENTITY_VERIFIED', 'IDENTITY_FAILED', 'DATA_UPDATED', 'NAMES_CORRECTED',
  'CONSENT_ACCEPTED', 'FORM_SUBMITTED', 'ADMIN_VIEWED', 'ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED',
  'ADMIN_LOGOUT', 'MFA_ENROLLED', 'EXPORT_CREATED', 'IMPORT_CREATED', 'LINK_CREATED',
  'LINK_REVOKED', 'LINK_EMAIL_SENT', 'RECORD_REVIEWED', 'NOTICE_PUBLISHED', 'RETENTION_APPLIED',
  'MANUAL_EDIT', 'UNIBROKERS_EXPORT_CREATED',
  'GENERAL_IDENTIFY_FAILED', 'FINGERPRINT_CLAIMED', 'FINGERPRINT_IMPORTED', 'FINGERPRINT_RESET',
  'TOTP_ENROLLED', 'TOTP_RESET',
  'EMAIL_CODE_SENT', 'EMAIL_VERIFIED'
));

-- La retención también limpia el correo de ingreso y el vínculo con Supabase Auth.
create or replace function anonymize_expired_people()
returns int
language plpgsql
set search_path = public
as $$
declare v_count int;
begin
  with expired as (
    select id from people
     where retention_until is not null and retention_until < now() and anonymized_at is null
     for update skip locked
  ), del_bank as (
    delete from bank_information where person_id in (select id from expired)
  ), del_contact as (
    delete from contact_information where person_id in (select id from expired)
  ), del_names as (
    delete from name_change_history where person_id in (select id from expired)
  ), rev_tokens as (
    update access_tokens set revoked_at = coalesce(revoked_at, now()), revoked_reason = coalesce(revoked_reason, 'RETENTION')
     where person_id in (select id from expired)
  ), upd as (
    update people set first_names = 'ANONIMIZADO', last_names = 'ANONIMIZADO',
                      national_id_encrypted = null, national_id_hash = null, national_id_last2 = null,
                      fingerprint_code_hash = null, fingerprint_claimed_at = null,
                      totp_secret_encrypted = null, totp_enabled_at = null,
                      general_failed_attempts = 0, general_locked_until = null,
                      general_challenge_hash = null, general_challenge_expires_at = null, general_challenge_purpose = null,
                      general_challenge_email = null, general_challenge_sent_at = null,
                      login_email = null, login_email_verified_at = null, auth_user_id = null,
                      anonymized_at = now()
     where id in (select id from expired)
    returning id
  )
  select count(*) into v_count from upd;

  if v_count > 0 then
    insert into audit_logs (actor_type, action, metadata)
    values ('system', 'RETENTION_APPLIED', jsonb_build_object('records', v_count));
  end if;
  return v_count;
end $$;
