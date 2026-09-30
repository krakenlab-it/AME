# Contratos del portal

Fuente ejecutable: `lib/contracts/api.ts` y `lib/contracts/magic-link.ts`. Las rutas HTTP los aplican. Si se agrega una ruta en `app/api`, las pruebas fallan hasta registrarla aquí.

No hay alta pública. Un administrador entra solo si fue invitado (`scripts/create-admin.ts`) y completa contraseña y TOTP. La clave anónima de Supabase Auth no lee datos personales: las tablas siguen con RLS forzado y sin permisos para `anon` ni `authenticated`. El servidor usa `service_role` después de comprobar la sesión.

## Rutas HTTP

| Método y ruta | Quién puede llamarla | Qué responde |
|---|---|---|
| `GET /api/health` | Cualquiera | `{ "ok": true }` y nada más |
| `POST /api/admin/export` | Administrador con MFA (AAL2), permiso de exportar, y el mismo sitio | Archivo CSV o XLSX. Errores: `{ "error": "..." }` |
| `GET /api/cron/retention` | Vercel Cron, con `Authorization: Bearer <CRON_SECRET>` (16 caracteres o más) | `{ "ok": true, "anonymized": <número> }` |

### Exportación

Cuerpo JSON, sin campos extra:

```json
{ "profile": "RECLAMOS | REEMBOLSOS", "format": "xlsx | csv", "purpose": "texto" }
```

`purpose` se guarda en la auditoría y debe quedar, ya recortado, entre 10 y 300 caracteres. Un origen distinto al del portal responde 403. Quien no tiene permiso también responde 403 y queda un evento `EXPORT_DENIED`, sin datos personales.

## Acciones del titular y del panel

| Acción | Dónde | Requisito |
|---|---|---|
| Identificarse | `/verificar/[token]` | Enlace individual (256 bits) y cédula. No devuelve si la cédula existe cuando el enlace es inválido. |
| Confirmar enlace | `/admin/auth/confirm` | Invitación, restablecimiento o enlace mágico ya emitido. El destino se queda en `/admin`. |
| Adoptar sesión | El mismo enlace, si Supabase usa el fragmento `#access_token` | Mismos límites. No abre un registro nuevo. |

`/admin/registro` solo elige contraseña cuando la invitación ya creó la sesión. No es un formulario de registro abierto.
