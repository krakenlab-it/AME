-- Importación con teléfono + ingreso solo con correo (/ingresar).
-- Aplicar en prod ame-db después del merge (lo aplica Elon). No borra columnas ni datos.
--
-- 1. people.outreach_phone: celular del archivo importado (E.164). Nunca se usa como cédula.
-- 2. Cuentas creadas solo con correo: una fila de people sin cédula (national_id_hash null)
--    marcada con self_registered_at. El administrador la vincula después con una persona importada.
-- 3. Si la persona escribe una cédula sin código dactilar, queda como solicitud de vínculo
--    (cifrada y con HMAC, igual que la cédula). No se asigna sola: un admin la aprueba.

alter table people add column if not exists outreach_phone text;
alter table people add column if not exists self_registered_at timestamptz;
alter table people add column if not exists link_request_national_id_hash text;
alter table people add column if not exists link_request_national_id_encrypted text;
alter table people add column if not exists link_request_national_id_last2 char(2);
alter table people add column if not exists link_requested_at timestamptz;

-- Una cuenta propia nunca trae cédula: si tuviera, sería una persona importada.
alter table people drop constraint if exists people_self_registered_no_id_check;
alter table people add constraint people_self_registered_no_id_check
  check (self_registered_at is null or national_id_hash is null);

create index if not exists people_login_email_idx on people (login_email) where login_email is not null;
create index if not exists people_outreach_email_idx on people (lower(outreach_email)) where outreach_email is not null;
create index if not exists people_self_pending_email_idx on people (general_challenge_email)
  where self_registered_at is not null and login_email is null;

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
  'ACCOUNT_CREATED', 'ACCOUNT_LINKED', 'ACCOUNT_LINK_REQUESTED'
));

-- Las cuentas propias (sin cédula) no cuentan como invitados en el resumen.
create or replace function people_status_counts()
returns table (status person_status, total bigint)
language sql stable as $$
  select status, count(*) from people
   where anonymized_at is null and self_registered_at is null
   group by status;
$$;

-- Limpia también las cuentas que nunca confirmaron el código (más de un día).
create or replace function purge_expired_sessions()
returns void
language sql as $$
  delete from respondent_sessions where expires_at < now() - interval '1 day';
  delete from rate_limits where window_start < now() - interval '1 day';
  delete from people
   where self_registered_at is not null and self_registered_at < now() - interval '1 day'
     and login_email is null and national_id_hash is null;
$$;

/**
 * Vincula una cuenta propia (solo correo) con una persona importada.
 * Mueve el correo verificado y el usuario de Supabase Auth a la persona y borra la cuenta.
 * La persona no puede tener ya otro correo de ingreso (KAN-148): el admin la restablece primero.
 * Devuelve: linked | account_missing | person_missing | person_bound.
 */
create or replace function link_respondent_account(p_account_id uuid, p_person_id uuid, p_admin_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_account people%rowtype;
  v_person people%rowtype;
begin
  select * into v_account from people
   where id = p_account_id and self_registered_at is not null and national_id_hash is null
     and anonymized_at is null and login_email is not null
   for update;
  if not found then return 'account_missing'; end if;

  select * into v_person from people
   where id = p_person_id and self_registered_at is null and national_id_hash is not null and anonymized_at is null
   for update;
  if not found then return 'person_missing'; end if;
  if v_person.login_email is not null and v_person.login_email <> v_account.login_email then
    return 'person_bound';
  end if;

  -- La historia de la cuenta pasa a la persona.
  update audit_logs set person_id = p_person_id where person_id = p_account_id;
  update respondent_sessions set revoked_at = coalesce(revoked_at, now()) where person_id = p_account_id;
  delete from people where id = p_account_id;

  update people set
    login_email = v_account.login_email,
    login_email_verified_at = v_account.login_email_verified_at,
    auth_user_id = v_account.auth_user_id,
    general_failed_attempts = 0,
    general_locked_until = null
   where id = p_person_id;

  insert into audit_logs (person_id, actor_type, actor_id, action, changed_fields, metadata)
  values (p_person_id, 'admin', p_admin_id, 'ACCOUNT_LINKED', array['login_email', 'auth_user_id'], jsonb_build_object('entry', 'admin'));
  return 'linked';
end $$;

revoke all on function link_respondent_account(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function link_respondent_account(uuid, uuid, uuid) to service_role;
revoke all on function people_status_counts() from public, anon, authenticated;
grant execute on function people_status_counts() to service_role;
revoke all on function purge_expired_sessions() from public, anon, authenticated;
grant execute on function purge_expired_sessions() to service_role;

-- La retención también borra el teléfono importado y la solicitud de vínculo.
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
                      outreach_phone = null,
                      link_request_national_id_hash = null, link_request_national_id_encrypted = null,
                      link_request_national_id_last2 = null, link_requested_at = null,
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
