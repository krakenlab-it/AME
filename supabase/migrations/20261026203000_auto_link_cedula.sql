-- Vinculación automática por cédula + código dactilar.
-- Aplicar en prod a mano. Este archivo no se ejecuta solo.
--
-- 1. Una persona que se registró sola puede quedar con la cédula que escribió
--    (antes el check lo prohibía: self_registered_at y national_id_hash no convivían).
-- 2. PERSON_AUTO_LINKED entra en la auditoría.
-- 3. commit_cedula_link guarda dactilar, correo y usuario de Auth, y borra
--    la cuenta propia vacía, en una sola transacción.

alter table people drop constraint if exists people_self_registered_no_id_check;

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
  'PERSON_RESET_TO_GUEST', 'PERSON_DELETED',
  'PERSON_AUTO_LINKED'
));

create or replace function commit_cedula_link(
  p_holder_id uuid,
  p_challenge_hash text,
  p_email text,
  p_auth_user_id uuid,
  p_national_id_encrypted text,
  p_national_id_hash text,
  p_national_id_last2 text,
  p_fingerprint_hash text,
  p_masked_cedula text,
  p_preload_first text,
  p_preload_last text,
  p_preload_phone text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_holder people%rowtype;
  v_target people%rowtype;
  v_match text;
  v_audit boolean;
  v_now timestamptz := now();
  v_other_email text;
begin
  select * into v_holder from people where id = p_holder_id for update;
  if not found
     or v_holder.anonymized_at is not null
     or v_holder.general_challenge_hash is distinct from p_challenge_hash
     or v_holder.general_challenge_purpose is distinct from 'cedula'
     or v_holder.general_challenge_email is distinct from p_email then
    return jsonb_build_object('status', 'missing');
  end if;

  if v_holder.national_id_hash is not null and v_holder.national_id_hash is distinct from p_national_id_hash then
    return jsonb_build_object('status', 'cedula_mismatch', 'person_id', v_holder.id);
  end if;

  if v_holder.national_id_hash is not null then
    v_target := v_holder;
  else
    select * into v_target from people
     where national_id_hash = p_national_id_hash and anonymized_at is null
     for update;
    if not found then
      v_target := v_holder;
    end if;
  end if;

  if v_target.general_locked_until is not null and v_target.general_locked_until > v_now then
    return jsonb_build_object('status', 'locked', 'person_id', v_target.id, 'locked_until', v_target.general_locked_until);
  end if;

  if v_target.auth_user_id is not null and v_target.auth_user_id is distinct from p_auth_user_id then
    return jsonb_build_object('status', 'auth_conflict', 'person_id', v_target.id, 'login_email', v_target.login_email);
  end if;
  if v_target.login_email is not null and lower(v_target.login_email) is distinct from lower(p_email) then
    return jsonb_build_object('status', 'auth_conflict', 'person_id', v_target.id, 'login_email', v_target.login_email);
  end if;
  if p_auth_user_id is not null and exists (
    select 1 from people where auth_user_id = p_auth_user_id and id <> v_target.id
  ) then
    select login_email into v_other_email from people where auth_user_id = p_auth_user_id and id <> v_target.id limit 1;
    return jsonb_build_object('status', 'auth_conflict', 'person_id', v_target.id, 'login_email', v_other_email);
  end if;

  if v_target.fingerprint_code_hash is not null and v_target.fingerprint_code_hash is distinct from p_fingerprint_hash then
    return jsonb_build_object('status', 'fingerprint_mismatch', 'person_id', v_target.id);
  end if;

  if v_target.id is distinct from v_holder.id or v_holder.national_id_hash is not null then
    v_match := case when v_target.fingerprint_code_hash is null then 'dactilar_first_use' else 'dactilar_match' end;
  elsif p_preload_first is not null then
    v_match := 'preload';
  else
    v_match := 'new';
  end if;
  v_audit := v_match in ('preload', 'new') or v_target.login_email is null or v_target.fingerprint_code_hash is null;

  begin
    if v_target.id is distinct from v_holder.id then
      update people set
        general_challenge_hash = null,
        general_challenge_purpose = null,
        general_challenge_expires_at = null,
        general_challenge_email = null,
        general_challenge_sent_at = null,
        general_challenge_auth_user_id = null
      where id = v_holder.id;
    end if;

    update people set
      national_id_encrypted = coalesce(national_id_encrypted, p_national_id_encrypted),
      national_id_hash = coalesce(national_id_hash, p_national_id_hash),
      national_id_last2 = coalesce(national_id_last2, p_national_id_last2),
      first_names = case when v_match = 'preload' then p_preload_first else first_names end,
      last_names = case when v_match = 'preload' then p_preload_last else last_names end,
      outreach_phone = case when v_match = 'preload' and p_preload_phone is not null then p_preload_phone else outreach_phone end,
      self_registered_at = case when v_match = 'preload' then null else self_registered_at end,
      fingerprint_code_hash = coalesce(fingerprint_code_hash, p_fingerprint_hash),
      fingerprint_claimed_at = case when fingerprint_code_hash is null then v_now else fingerprint_claimed_at end,
      login_email = p_email,
      login_email_verified_at = coalesce(login_email_verified_at, v_now),
      auth_user_id = coalesce(auth_user_id, p_auth_user_id),
      general_challenge_hash = null,
      general_challenge_purpose = null,
      general_challenge_expires_at = null,
      general_challenge_email = null,
      general_challenge_sent_at = null,
      general_challenge_auth_user_id = null,
      general_failed_attempts = 0,
      general_locked_until = null,
      link_request_national_id_hash = null,
      link_request_national_id_encrypted = null,
      link_request_national_id_last2 = null,
      link_requested_at = null
    where id = v_target.id;

    if v_target.id is distinct from v_holder.id then
      update audit_logs set person_id = v_target.id where person_id = v_holder.id;
      delete from access_tokens where person_id = v_holder.id;
      delete from respondent_sessions where person_id = v_holder.id;
      delete from people where id = v_holder.id and self_registered_at is not null and national_id_hash is null;
    end if;

    delete from people
     where id <> v_target.id
       and self_registered_at is not null
       and national_id_hash is null
       and (
         login_email = p_email
         or (p_auth_user_id is not null and auth_user_id = p_auth_user_id)
       );
  exception when unique_violation then
    return jsonb_build_object('status', 'duplicate');
  end;

  if v_audit then
    insert into audit_logs (person_id, actor_type, action, changed_fields, metadata, recorded_person_id, masked_cedula)
    values (
      v_target.id,
      'respondent',
      'PERSON_AUTO_LINKED',
      array['login_email', 'auth_user_id', 'fingerprint_code_hash'],
      jsonb_build_object('match', v_match, 'entry', 'general'),
      v_target.id,
      p_masked_cedula
    );
  end if;

  return jsonb_build_object('status', 'linked', 'person_id', v_target.id, 'match', v_match, 'audited', v_audit);
end $$;

revoke all on function commit_cedula_link(uuid, text, text, uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function commit_cedula_link(uuid, text, text, uuid, text, text, text, text, text, text, text, text) to service_role;
