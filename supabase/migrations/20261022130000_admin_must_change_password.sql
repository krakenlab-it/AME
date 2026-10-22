-- Recuperación del panel (ADMIN_BOOTSTRAP_EMAILS) y cambio de contraseña obligatorio.
-- must_change_password: después del TOTP (aal2) el panel no abre hasta elegir una contraseña nueva.
-- Lo pone el arranque con ADMIN_BOOTSTRAP_EMAILS; lo quita /admin/restablecer cuando Auth guardó la clave.
-- No cambia people, respondent_sessions ni nada del titular. El registro usa security_events
-- (event_type libre), así que audit_logs_action_check no se toca.

alter table admin_users add column if not exists must_change_password boolean not null default false;

revoke all on table admin_users from anon, authenticated;

-- Id de una cuenta de Auth por correo, para volver a vincular una fila sin acceso.
-- Solo service_role (el arranque del servidor). No devuelve nada más que el id.
create or replace function public.admin_bootstrap_auth_user_id(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function public.admin_bootstrap_auth_user_id(text) from public, anon, authenticated;
grant execute on function public.admin_bootstrap_auth_user_id(text) to service_role;
