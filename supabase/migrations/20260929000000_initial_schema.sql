-- ════════════════════════════════════════════════════════════════════════════
-- Portal de verificación y actualización de datos — AME / Unibrokers / AIG
-- Esquema inicial · PostgreSQL (Supabase)
--
-- Principios:
--  • RLS activado en TODAS las tablas, sin políticas para anon/authenticated
--    (DENY ALL). Solo el backend (service_role, en el servidor) accede.
--  • Datos de alto riesgo cifrados a nivel de aplicación (AES-256-GCM):
--    cédula, número de cuenta, cédula del titular, secretos MFA.
--  • Búsqueda exacta por cédula mediante HMAC (national_id_hash), nunca en claro.
--  • audit_logs sin valores personales: solo nombres de campos modificados.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ── Tipos ───────────────────────────────────────────────────────────────────
do $$ begin
  create type person_status as enum ('PENDING', 'STARTED', 'COMPLETED', 'NEEDS_REVIEW');
exception when duplicate_object then null; end $$;

do $$ begin
  create type admin_role as enum ('ADMIN', 'REVIEWER', 'EXPORTER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_type as enum ('Ahorros', 'Corriente');
exception when duplicate_object then null; end $$;

-- ── Utilidad updated_at ─────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Lotes de importación ────────────────────────────────────────────────────
create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  filename text not null,
  total_rows int not null default 0,
  imported_rows int not null default 0,
  rejected_rows int not null default 0,
  created_at timestamptz not null default now()
);

-- ── Personas ────────────────────────────────────────────────────────────────
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  first_names text not null,
  last_names text not null,
  national_id_encrypted text,                 -- AES-256-GCM (app)
  national_id_hash text unique,               -- HMAC-SHA256 con pepper (app)
  national_id_last2 char(2),                  -- solo para mostrar enmascarado
  status person_status not null default 'PENDING',
  confirmation_code text unique,              -- AIG-XXXXXXXX (nunca la cédula)
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_reasons text[] not null default '{}',
  retention_until timestamptz,
  anonymized_at timestamptz,
  import_batch_id uuid references import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists people_status_idx on people(status);
create index if not exists people_retention_idx on people(retention_until) where anonymized_at is null;
drop trigger if exists people_updated_at on people;
create trigger people_updated_at before update on people for each row execute function set_updated_at();

-- Historial de corrección de nombres (valor original y nuevo — nunca se borra el original)
create table if not exists name_change_history (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  original_first_names text not null,
  original_last_names text not null,
  new_first_names text not null,
  new_last_names text not null,
  session_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists name_change_person_idx on name_change_history(person_id);

-- ── Contacto ────────────────────────────────────────────────────────────────
create table if not exists contact_information (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references people(id) on delete cascade,
  primary_email text not null,
  secondary_email text,
  mobile_phone text not null,                 -- E.164
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  province text not null,
  country text not null default 'Ecuador',
  postal_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists contact_updated_at on contact_information;
create trigger contact_updated_at before update on contact_information for each row execute function set_updated_at();

-- ── Información bancaria ────────────────────────────────────────────────────
create table if not exists bank_information (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references people(id) on delete cascade,
  bank_name text not null,
  bank_other_name text,
  account_type account_type not null,
  account_number_encrypted text not null,     -- AES-256-GCM (app)
  account_number_last4 char(4) not null,
  account_holder_name text not null,
  account_holder_national_id_encrypted text not null,
  holder_is_titular boolean not null default true,
  ownership_declared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists bank_updated_at on bank_information;
create trigger bank_updated_at before update on bank_information for each row execute function set_updated_at();

-- ── Avisos de privacidad (versionados) ──────────────────────────────────────
create table if not exists privacy_notices (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  body text not null,
  body_hash text not null,
  effective_date date,
  is_active boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists privacy_notices_one_active on privacy_notices(is_active) where is_active;

-- ── Consentimientos (evidencia) ─────────────────────────────────────────────
create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  privacy_notice_version text not null,
  consent_type text not null check (consent_type in
    ('PRIVACY_NOTICE', 'DATA_SHARING_AIG', 'ACCURACY_DECLARATION', 'BANK_ACCOUNT_AUTHORIZATION')),
  consent_text_hash text not null,            -- SHA-256 del texto exacto mostrado
  purpose text not null,
  accepted boolean not null,
  accepted_at timestamptz,                    -- UTC
  mechanism text not null default 'web_checkbox_unchecked_by_default',
  session_id uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists consents_person_idx on consents(person_id);

-- ── Tokens de acceso (enlaces individuales) ─────────────────────────────────
create table if not exists access_tokens (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  token_hash text not null unique,            -- SHA-256 del token; el token nunca se guarda
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  failed_attempts int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists access_tokens_person_idx on access_tokens(person_id);

-- ── Sesiones del titular ────────────────────────────────────────────────────
create table if not exists respondent_sessions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique,
  person_id uuid not null references people(id) on delete cascade,
  access_token_id uuid not null references access_tokens(id) on delete cascade,
  expires_at timestamptz not null,
  submitted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Auditoría (sin valores personales) ──────────────────────────────────────
create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  person_id uuid references people(id) on delete set null,
  actor_type text not null check (actor_type in ('respondent', 'admin', 'system')),
  actor_id uuid,
  action text not null check (action in (
    'RECORD_OPENED', 'IDENTITY_VERIFIED', 'IDENTITY_FAILED', 'DATA_UPDATED', 'NAMES_CORRECTED',
    'CONSENT_ACCEPTED', 'FORM_SUBMITTED', 'ADMIN_VIEWED', 'ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED',
    'ADMIN_LOGOUT', 'MFA_ENROLLED', 'EXPORT_CREATED', 'IMPORT_CREATED', 'LINK_CREATED',
    'LINK_REVOKED', 'RECORD_REVIEWED', 'NOTICE_PUBLISHED', 'RETENTION_APPLIED')),
  changed_fields text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_person_idx on audit_logs(person_id);
create index if not exists audit_created_idx on audit_logs(created_at desc);

-- Eventos de seguridad (intentos sospechosos). IP solo como HMAC.
create table if not exists security_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  ip_hash text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_events_created_idx on security_events(created_at desc);

-- Rate limiting distribuido (funciona entre instancias serverless de Vercel)
create table if not exists rate_limits (
  bucket text primary key,
  window_start timestamptz not null,
  hits int not null
);

-- ── Administradores ─────────────────────────────────────────────────────────
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  full_name text not null,
  role admin_role not null,
  password_hash text not null,
  mfa_secret_encrypted text,
  mfa_enabled boolean not null default false,
  active boolean not null default true,
  failed_logins int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique,
  admin_id uuid not null references admin_users(id) on delete cascade,
  mfa_verified boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

-- ── Exportaciones ───────────────────────────────────────────────────────────
create table if not exists exports (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admin_users(id),
  purpose text not null,
  profile text not null,
  record_count int not null,
  fields text[] not null,
  format text not null,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY: DENY ALL por defecto
-- No se crean políticas para anon ni authenticated → el navegador no puede leer
-- ni escribir ninguna tabla. Solo service_role (servidor) accede.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'import_batches', 'people', 'name_change_history', 'contact_information', 'bank_information',
    'privacy_notices', 'consents', 'access_tokens', 'respondent_sessions', 'audit_logs',
    'security_events', 'rate_limits', 'admin_users', 'admin_sessions', 'exports'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Funciones (solo ejecutables por service_role)
-- ════════════════════════════════════════════════════════════════════════════

-- Rate limit atómico por ventana fija
create or replace function rate_limit_hit(p_bucket text, p_limit int, p_window_seconds int)
returns table (allowed boolean, hits int)
language plpgsql as $$
declare v_hits int;
begin
  insert into rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning r.hits into v_hits;
  return query select v_hits <= p_limit, v_hits;
end $$;

-- Registra un intento fallido sobre un token y lo bloquea al llegar al umbral
create or replace function register_token_failure(p_token_id uuid, p_threshold int)
returns table (failed_attempts int, locked boolean)
language plpgsql as $$
declare v_attempts int;
begin
  update access_tokens t
     set failed_attempts = t.failed_attempts + 1,
         revoked_at = case when t.failed_attempts + 1 >= p_threshold and t.revoked_at is null then now() else t.revoked_at end,
         revoked_reason = case when t.failed_attempts + 1 >= p_threshold and t.revoked_at is null then 'TOO_MANY_ATTEMPTS' else t.revoked_reason end
   where t.id = p_token_id
  returning t.failed_attempts into v_attempts;
  return query select coalesce(v_attempts, 0), coalesce(v_attempts, 0) >= p_threshold;
end $$;

-- Conteo por estado para el panel
create or replace function people_status_counts()
returns table (status person_status, total bigint)
language sql stable as $$
  select status, count(*) from people where anonymized_at is null group by status;
$$;

-- Envío definitivo: todo en una sola transacción
create or replace function submit_person_data(p jsonb)
returns text
language plpgsql as $$
declare
  v_person people%rowtype;
  v_person_id uuid := (p->>'person_id')::uuid;
  v_session_id uuid := (p->>'session_id')::uuid;
  v_token_id uuid := (p->>'access_token_id')::uuid;
  v_names_changed boolean := coalesce((p->>'names_changed')::boolean, false);
  v_review_reasons text[] := coalesce(array(select jsonb_array_elements_text(p->'review_reasons')), '{}');
  v_status person_status;
  v_consent jsonb;
begin
  select * into v_person from people where id = v_person_id for update;
  if not found then raise exception 'PERSON_NOT_FOUND'; end if;
  if v_person.status in ('COMPLETED', 'NEEDS_REVIEW') and v_person.submitted_at is not null then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  -- La sesión y el token deben seguir vigentes y pertenecer a esta persona
  perform 1 from respondent_sessions s
   where s.id = v_session_id and s.person_id = v_person_id and s.access_token_id = v_token_id
     and s.revoked_at is null and s.submitted_at is null and s.expires_at > now();
  if not found then raise exception 'SESSION_INVALID'; end if;

  perform 1 from access_tokens t
   where t.id = v_token_id and t.person_id = v_person_id
     and t.revoked_at is null and t.used_at is null and t.expires_at > now();
  if not found then raise exception 'TOKEN_INVALID'; end if;

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

  update access_tokens set used_at = now() where id = v_token_id;
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

-- Retención: anonimiza registros cuyo plazo terminó
create or replace function anonymize_expired_people()
returns int
language plpgsql as $$
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

-- Limpieza de sesiones y ventanas de rate limit vencidas
create or replace function purge_expired_sessions()
returns void
language sql as $$
  delete from respondent_sessions where expires_at < now() - interval '1 day';
  delete from admin_sessions where expires_at < now() - interval '1 day';
  delete from rate_limits where window_start < now() - interval '1 day';
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'rate_limit_hit(text,int,int)', 'register_token_failure(uuid,int)', 'people_status_counts()',
    'submit_person_data(jsonb)', 'anonymize_expired_people()', 'purge_expired_sessions()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
