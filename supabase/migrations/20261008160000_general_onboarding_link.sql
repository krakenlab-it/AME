-- Enlace general: código dactilar (solo hash), TOTP del titular (cifrado en la app) y sesión sin token personal.
-- Aplicar en prod ame-db después del merge. No guarda el código ni el secreto en claro.

alter table people add column if not exists fingerprint_code_hash text;
alter table people add column if not exists fingerprint_claimed_at timestamptz;
alter table people add column if not exists totp_secret_encrypted text;
alter table people add column if not exists totp_enabled_at timestamptz;
alter table people add column if not exists general_failed_attempts int not null default 0;
alter table people add column if not exists general_locked_until timestamptz;
alter table people add column if not exists general_challenge_hash text;
alter table people add column if not exists general_challenge_expires_at timestamptz;
alter table people add column if not exists general_challenge_purpose text;

alter table people drop constraint if exists people_general_challenge_purpose_check;
alter table people add constraint people_general_challenge_purpose_check
  check (general_challenge_purpose is null or general_challenge_purpose in ('enroll', 'verify'));

create unique index if not exists people_general_challenge_hash_idx
  on people (general_challenge_hash) where general_challenge_hash is not null;

alter table respondent_sessions add column if not exists entry_method text not null default 'token';
alter table respondent_sessions alter column access_token_id drop not null;
alter table respondent_sessions drop constraint if exists respondent_sessions_entry_method_check;
alter table respondent_sessions add constraint respondent_sessions_entry_method_check
  check (entry_method in ('token', 'general'));
alter table respondent_sessions drop constraint if exists respondent_sessions_entry_token_check;
alter table respondent_sessions add constraint respondent_sessions_entry_token_check
  check (
    (entry_method = 'token' and access_token_id is not null)
    or (entry_method = 'general' and access_token_id is null)
  );

alter table audit_logs drop constraint if exists audit_logs_action_check;
alter table audit_logs add constraint audit_logs_action_check check (action in (
  'RECORD_OPENED', 'IDENTITY_VERIFIED', 'IDENTITY_FAILED', 'DATA_UPDATED', 'NAMES_CORRECTED',
  'CONSENT_ACCEPTED', 'FORM_SUBMITTED', 'ADMIN_VIEWED', 'ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED',
  'ADMIN_LOGOUT', 'MFA_ENROLLED', 'EXPORT_CREATED', 'IMPORT_CREATED', 'LINK_CREATED',
  'LINK_REVOKED', 'LINK_EMAIL_SENT', 'RECORD_REVIEWED', 'NOTICE_PUBLISHED', 'RETENTION_APPLIED',
  'MANUAL_EDIT', 'UNIBROKERS_EXPORT_CREATED',
  'GENERAL_IDENTIFY_FAILED', 'FINGERPRINT_CLAIMED', 'FINGERPRINT_IMPORTED', 'FINGERPRINT_RESET',
  'TOTP_ENROLLED', 'TOTP_RESET'
));

-- Fallos del enlace general. El bloqueo dura p_lock_minutes y no se alarga mientras sigue vigente.
create or replace function register_general_failure(p_person_id uuid, p_threshold int, p_lock_minutes int)
returns table (failed_attempts int, locked boolean)
language plpgsql
set search_path = public
as $$
declare
  v_attempts int;
  v_locked_until timestamptz;
  v_now timestamptz := now();
begin
  select p.general_failed_attempts, p.general_locked_until
    into v_attempts, v_locked_until
  from people p
  where p.id = p_person_id
  for update;

  if not found then
    return query select 0, false;
    return;
  end if;

  if v_locked_until is not null and v_locked_until > v_now then
    return query select coalesce(v_attempts, 0), true;
    return;
  end if;

  if v_locked_until is not null and v_locked_until <= v_now then
    v_attempts := 0;
  end if;

  v_attempts := coalesce(v_attempts, 0) + 1;
  v_locked_until := case
    when v_attempts >= p_threshold then v_now + make_interval(mins => p_lock_minutes)
    else null
  end;

  update people
     set general_failed_attempts = v_attempts,
         general_locked_until = v_locked_until
   where id = p_person_id;

  return query select v_attempts, v_attempts >= p_threshold;
end $$;

create or replace function submit_person_data(p jsonb)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_person people%rowtype;
  v_person_id uuid := (p->>'person_id')::uuid;
  v_session_id uuid := (p->>'session_id')::uuid;
  v_token_id uuid := nullif(p->>'access_token_id', '')::uuid;
  v_names_changed boolean := coalesce((p->>'names_changed')::boolean, false);
  v_review_reasons text[] := coalesce(array(select jsonb_array_elements_text(p->'review_reasons')), '{}');
  v_status person_status;
  v_consent jsonb;
  v_entry text;
  v_session_token uuid;
begin
  select * into v_person from people where id = v_person_id for update;
  if not found then raise exception 'PERSON_NOT_FOUND'; end if;
  if v_person.status in ('COMPLETED', 'NEEDS_REVIEW') and v_person.submitted_at is not null then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  select s.entry_method, s.access_token_id
    into v_entry, v_session_token
  from respondent_sessions s
  where s.id = v_session_id and s.person_id = v_person_id
    and s.revoked_at is null and s.submitted_at is null and s.expires_at > now();
  if not found then raise exception 'SESSION_INVALID'; end if;

  if v_entry = 'token' then
    if v_token_id is null or v_session_token is distinct from v_token_id then
      raise exception 'SESSION_INVALID';
    end if;
    perform 1 from access_tokens t
     where t.id = v_token_id and t.person_id = v_person_id
       and t.revoked_at is null and t.used_at is null and t.expires_at > now();
    if not found then raise exception 'TOKEN_INVALID'; end if;
  elsif v_entry = 'general' then
    if v_token_id is not null or v_session_token is not null then
      raise exception 'SESSION_INVALID';
    end if;
  else
    raise exception 'SESSION_INVALID';
  end if;

  if v_names_changed then
    insert into name_change_history (person_id, original_first_names, original_last_names, new_first_names, new_last_names, session_id)
    values (v_person_id, v_person.first_names, v_person.last_names, p->>'first_names', p->>'last_names', v_session_id);
    update people set first_names = p->>'first_names', last_names = p->>'last_names' where id = v_person_id;
  end if;

  insert into contact_information as c (person_id, primary_email, secondary_email, mobile_phone, address_line_1,
                                        address_line_2, city, province, country, postal_code)
  values (v_person_id, p->'contact'->>'primary_email', nullif(p->'contact'->>'secondary_email', ''),
          p->'contact'->>'mobile_phone', p->'contact'->>'address_line_1', nullif(p->'contact'->>'address_line_2', ''),
          p->'contact'->>'city', p->'contact'->>'province', p->'contact'->>'country', nullif(p->'contact'->>'postal_code', ''))
  on conflict (person_id) do update set
    primary_email = excluded.primary_email, secondary_email = excluded.secondary_email,
    mobile_phone = excluded.mobile_phone, address_line_1 = excluded.address_line_1,
    address_line_2 = excluded.address_line_2, city = excluded.city, province = excluded.province,
    country = excluded.country, postal_code = excluded.postal_code;

  insert into bank_information as b (person_id, bank_name, bank_other_name, account_type, account_number_encrypted,
                                     account_number_last4, account_holder_name, account_holder_national_id_encrypted,
                                     holder_is_titular, ownership_declared)
  values (v_person_id, p->'bank'->>'bank_name', nullif(p->'bank'->>'bank_other_name', ''),
          (p->'bank'->>'account_type')::account_type, p->'bank'->>'account_number_encrypted',
          p->'bank'->>'account_number_last4', p->'bank'->>'account_holder_name',
          p->'bank'->>'account_holder_national_id_encrypted', (p->'bank'->>'holder_is_titular')::boolean,
          (p->'bank'->>'ownership_declared')::boolean)
  on conflict (person_id) do update set
    bank_name = excluded.bank_name, bank_other_name = excluded.bank_other_name, account_type = excluded.account_type,
    account_number_encrypted = excluded.account_number_encrypted, account_number_last4 = excluded.account_number_last4,
    account_holder_name = excluded.account_holder_name,
    account_holder_national_id_encrypted = excluded.account_holder_national_id_encrypted,
    holder_is_titular = excluded.holder_is_titular, ownership_declared = excluded.ownership_declared;

  for v_consent in select * from jsonb_array_elements(p->'consents') loop
    insert into consents (person_id, privacy_notice_version, consent_type, consent_text_hash, purpose, accepted,
                          accepted_at, session_id)
    values (v_person_id, p->>'notice_version', v_consent->>'type', v_consent->>'text_hash', p->>'purpose',
            true, now(), v_session_id);
  end loop;

  v_status := case when array_length(v_review_reasons, 1) > 0 then 'NEEDS_REVIEW' else 'COMPLETED' end;

  update people set
    status = v_status,
    confirmation_code = p->>'confirmation_code',
    submitted_at = now(),
    review_reasons = v_review_reasons,
    retention_until = (p->>'retention_until')::timestamptz
  where id = v_person_id;

  if v_entry = 'token' then
    update access_tokens set used_at = now() where id = v_token_id;
  end if;
  update respondent_sessions set submitted_at = now() where id = v_session_id;

  if v_names_changed then
    insert into audit_logs (person_id, actor_type, actor_id, action, changed_fields)
    values (v_person_id, 'respondent', v_session_id, 'NAMES_CORRECTED', array['first_names', 'last_names']);
  end if;
  insert into audit_logs (person_id, actor_type, actor_id, action, changed_fields)
  values (v_person_id, 'respondent', v_session_id, 'DATA_UPDATED',
          coalesce(array(select jsonb_array_elements_text(p->'changed_fields')), '{}'));
  insert into audit_logs (person_id, actor_type, actor_id, action, metadata)
  values (v_person_id, 'respondent', v_session_id, 'CONSENT_ACCEPTED',
          jsonb_build_object('notice_version', p->>'notice_version',
                             'types', (select jsonb_agg(c->>'type') from jsonb_array_elements(p->'consents') c)));
  insert into audit_logs (person_id, actor_type, actor_id, action, metadata)
  values (v_person_id, 'respondent', v_session_id, 'FORM_SUBMITTED', jsonb_build_object('status', v_status));

  return p->>'confirmation_code';
end $$;

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

revoke all on function register_general_failure(uuid, int, int) from public, anon, authenticated;
grant execute on function register_general_failure(uuid, int, int) to service_role;
