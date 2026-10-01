# Contratos del portal

Fuente ejecutable: `lib/contracts/api.ts` y `lib/contracts/magic-link.ts`. Las rutas HTTP los aplican. Si se agrega una ruta en `app/api`, las pruebas fallan hasta registrarla aquí.

No hay alta pública. Un administrador entra solo si fue invitado (`scripts/create-admin.ts`) y completa contraseña y TOTP. La clave anónima de Supabase Auth no lee datos personales: las tablas siguen con RLS forzado y sin permisos para `anon` ni `authenticated`. El servidor usa `service_role` después de comprobar la sesión.

## Rutas HTTP

| Método y ruta | Quién puede llamarla | Qué responde |
|---|---|---|
| `GET /api/health` | Cualquiera | `{ "ok": true }` y nada más |
| `POST /api/admin/export` | Administrador con MFA (AAL2), permiso de exportar, y el mismo sitio | Archivo CSV o XLSX. Errores: `{ "error": "..." }` |
| `POST /api/admin/unibrokers` | El mismo permiso de exportar | Paquete de contacto (sin banco). Errores: `{ "error": "..." }` |
| `GET /api/cron/retention` | Vercel Cron, con `Authorization: Bearer <CRON_SECRET>` (16 caracteres o más) | `{ "ok": true, "anonymized": <número> }` |

### Exportación

Cuerpo JSON, sin campos extra:

```json
{ "profile": "RECLAMOS | REEMBOLSOS", "format": "xlsx | csv", "purpose": "texto" }
```

`purpose` se guarda en la auditoría y debe quedar, ya recortado, entre 10 y 300 caracteres. Un origen distinto al del portal responde 403. Quien no tiene permiso también responde 403 y queda un evento `EXPORT_DENIED`, sin datos personales.

La carga de Unibrokers usa el mismo origen y el mismo permiso. El cuerpo es `{ "format": "xlsx | csv", "purpose": "texto" }`. No pide perfil de reclamos ni de reembolsos. Si faltan `UNIBROKERS_API_URL` o `UNIBROKERS_API_KEY`, igual se descarga el archivo y la respuesta indica que el envío en vivo no se hizo.

## Acciones del titular y del panel

| Acción | Dónde | Requisito |
|---|---|---|
| Identificarse | `/verificar/[token]` | Enlace individual (256 bits) y cédula. No devuelve si la cédula existe cuando el enlace es inválido. |
| Consultar mi cuenta | `/mi-cuenta` y, si el enlace ya se usó, `/verificar/[token]/estado` | Cookie de la sesión del titular ligada a esa persona. Sin búsqueda por cédula. El enlace usado no reabre el formulario. |
| Confirmar enlace | `/admin/auth/confirm` | Invitación, restablecimiento o enlace mágico ya emitido. El destino se queda en `/admin`. |
| Adoptar sesión | El mismo enlace, si Supabase usa el fragmento `#access_token` | Mismos límites. No abre un registro nuevo. |

`/admin/registro` solo elige contraseña cuando la invitación ya creó la sesión. No es un formulario de registro abierto.

El paso 3 del panel (enviar el enlace por correo) no es un requisito del portal. Si `RESEND_API_KEY` no está configurada, la pantalla lo muestra («RESEND_API_KEY no está configurada») y no envía. Generar y descargar enlaces sigue igual.
