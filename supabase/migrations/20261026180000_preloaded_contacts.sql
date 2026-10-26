-- Lista de correos y teléfonos sin cédula. La persona entra con ese correo,
-- escribe su cédula y su código dactilar, y no espera la aprobación de un administrador.
-- Aplicar en prod ame-db a mano ANTES de merge. No borra filas.

create table if not exists ame_preloaded_contacts (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  name text not null default '',
  comunidad text,
  import_batch_id uuid references import_batches(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint ame_preloaded_contacts_has_contact check (email is not null or phone is not null)
);

create unique index if not exists ame_preloaded_contacts_email_key
  on ame_preloaded_contacts (email) where email is not null;

alter table ame_preloaded_contacts enable row level security;
alter table ame_preloaded_contacts force row level security;
revoke all on table ame_preloaded_contacts from anon, authenticated;
