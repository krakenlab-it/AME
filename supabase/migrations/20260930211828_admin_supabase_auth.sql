-- KAN-105: el panel usa Supabase Auth.
-- admin_users guarda rol, nombre y si la cuenta está activa, vinculada por auth_user_id.
-- La contraseña y el secreto TOTP dejan de guardarse aquí (viven en Auth).
-- No se crean políticas para anon ni authenticated. people, tokens y el resto de PII
-- siguen en DENY ALL; el servidor usa service_role después de comprobar la sesión.

alter table admin_users add column if not exists auth_user_id uuid;

create unique index if not exists admin_users_auth_user_id_key on admin_users (auth_user_id);

alter table admin_users drop constraint if exists admin_users_auth_user_id_fkey;
alter table admin_users
  add constraint admin_users_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users (id) on delete set null;

alter table admin_users drop column if exists password_hash;
alter table admin_users drop column if exists mfa_secret_encrypted;
alter table admin_users drop column if exists failed_logins;
alter table admin_users drop column if exists locked_until;

drop table if exists admin_sessions;

create or replace function purge_expired_sessions()
returns void
language sql as $$
  delete from respondent_sessions where expires_at < now() - interval '1 day';
  delete from rate_limits where window_start < now() - interval '1 day';
$$;

-- Reafirma que el rol authenticated de Auth no lee PII ni perfiles admin.
revoke all on table people from anon, authenticated;
revoke all on table access_tokens from anon, authenticated;
revoke all on table contact_information from anon, authenticated;
revoke all on table bank_information from anon, authenticated;
revoke all on table consents from anon, authenticated;
revoke all on table admin_users from anon, authenticated;
revoke all on table exports from anon, authenticated;
