# Portal de verificación y actualización de información

Portal privado para que cada asegurado de la **Agrupación Marista Ecuatoriana** verifique y complete sus datos personales, de contacto y bancarios. Los datos se usan para facilitar reclamos y reembolsos con AIG. El seguro lo gestiona Unibrokers Seguros y la plataforma tecnológica es de Kraken Lab.

> ⚠️ **LEGAL_REVIEW_REQUIRED** — Antes de producción hay que completar los datos legales y aprobar los textos. Ver [Revisión legal](#aspectos-que-requieren-revisión-legal-antes-de-producción).

---

## Qué hace el sistema

1. El administrador carga la base inicial (nombres, apellidos, cédula) desde CSV o XLSX.
2. El sistema genera un **enlace individual** por persona: `https://dominio/verificar/<token>`. El token tiene 256 bits aleatorios, no contiene cédula ni nombre, vence y puede revocarse. En la base solo se guarda su hash.
3. El administrador descarga los enlaces en CSV y los envía por correo o WhatsApp.
4. El titular abre su enlace y confirma su cédula, que funciona como segunda capa de verificación. Luego recorre 7 pasos:
   - Identificación
   - Verificación de nombres, con opción de corregirlos
   - Contacto y dirección
   - Información bancaria
   - Privacidad y consentimientos
   - Revisión
   - Confirmación con número `AIG-XXXXXXXX`
5. El envío es definitivo. El enlace queda usado, se registra la evidencia del consentimiento y se envía un correo sin datos sensibles.
6. El panel `/admin` entra con Supabase Auth (invitación, contraseña y TOTP en el teléfono) y tres roles (ADMIN, REVIEWER, EXPORTER). Desde ahí se ven los estados, se revisan los casos marcados y se genera el archivo para AIG, con registro de cada exportación.

No existe búsqueda pública. Ninguna ruta devuelve datos personales sin enlace y cédula válidos.

## Arquitectura

```
Navegador ──HTTPS──> Next.js en Vercel (Server Components + Server Actions + API Routes)
                          │   · validación Zod en servidor
                          │   · cifrado AES-256-GCM de cédula, cuenta y cédula del titular
                          │   · HMAC (pepper) para buscar por cédula sin guardarla en claro
                          │   · rate limiting, bloqueo de enlace, CAPTCHA adaptativo
                          ▼
                 Supabase PostgreSQL (RLS activado, DENY ALL; solo service_role desde el servidor)
```

| Carpeta | Contenido |
|---|---|
| `app/` | Páginas: `/`, `/verificar/[token]`, `/verificar/formulario`, `/confirmacion`, `/mi-cuenta`, `/privacidad`, `/admin/*`, `/api/*` |
| `components/` | UI (`ui/`), formularios (`forms/`), portal (`portal/`), panel (`admin/`), marca (`brand/`) |
| `config/privacy.ts` | Datos legales configurables (placeholders hasta completarlos) |
| `lib/database/` | Interfaces del repositorio, implementación Supabase, repositorio en memoria (pruebas y demo) |
| `lib/services/` | Lógica: identificación, envío, importación, enlaces, exportación, autenticación admin, correo |
| `lib/security/` | Cookies del titular, RBAC, TOTP de demostración, contraseñas (scrypt, solo demo), enmascarado, CAPTCHA |
| `lib/validation/` | Cédula, teléfono, esquemas Zod, sanitización |
| `lib/privacy/` | Aviso, consentimientos, detector de placeholders, bloqueo de producción |
| `supabase/migrations/` | Esquema SQL, RLS y funciones |
| `tests/` | Pruebas (Vitest) |

Los servicios dependen de interfaces (`lib/database/types.ts`), no de Supabase. Para cambiar de proveedor de PostgreSQL basta con implementar `Repo`.

## Configuración local

Requisitos: Node.js 20.9 o superior y npm.

```bash
npm install
cp .env.example .env.local
npm run keys:generate      # pega ENCRYPTION_KEY, HASH_PEPPER y CRON_SECRET en .env.local
npm run dev
```

**Probar sin Supabase (modo demostración).** Agrega `DEMO_MODE=true` en `.env.local` y abre `http://localhost:3000`. En el inicio y en el ingreso aparece un recuadro con tres botones: **entrar como administrador** (el panel completo), **entrar como usuario** (la persona que actualiza sus datos) y **entrar a mi cuenta** (un registro ya enviado, en `/mi-cuenta`). Revisor de fichas y exportación a AIG no son pantallas distintas: son el mismo panel con menos opciones (`revisor@demo.local` y `exportador@demo.local`, contraseña `Demo-portal-2026`). La consola también muestra enlaces de prueba, el usuario `admin@demo.local` y el secreto TOTP. Ese ingreso no usa Supabase Auth: vive en memoria y se pierde al reiniciar. **Nunca** actives `DEMO_MODE` en producción: la aplicación se niega a arrancar así.

## Mi cuenta del asegurado (`/mi-cuenta`)

Después de confirmar la cédula en el enlace personal, la misma sesión del titular (`respondent_sessions`, cookie httpOnly) abre **Mi cuenta**. No hay un segundo usuario de Supabase Auth: el panel `/admin` sigue siendo solo por invitación (KAN-105).

1. Enlace vigente: la cédula abre el formulario. Desde ahí, **Ver el estado de mi actualización** lleva a `/mi-cuenta` (avisos y, si todavía no hay envío, un estado vacío con el botón para continuar).
2. Enlace ya usado: la página del enlace sigue diciendo que no abre el formulario. El texto **Consultar el estado de mi registro** pide otra vez la cédula y abre `/mi-cuenta` en lectura (número `AIG-…`, fecha, estado y un resumen enmascarado).
3. Al terminar el formulario, la confirmación también enlaza a `/mi-cuenta` antes de cerrar la sesión.

Los avisos salen del estado de la persona y del aviso de privacidad vigente (`privacy_notices` o el texto del código si aún no hay uno publicado). No hay tabla nueva ni envío por correo o WhatsApp. No existe búsqueda por cédula: sin la cookie de esa persona, `/mi-cuenta` no muestra datos.

## Supabase: configuración

1. Crea un proyecto en [supabase.com](https://supabase.com). Se recomienda la región **São Paulo (sa-east-1)**, cerca de Ecuador; `vercel.json` usa la región `gru1`, que está en la misma zona.
2. En **SQL Editor**, pega y ejecuta `supabase/migrations/20260929000000_initial_schema.sql` y después `supabase/migrations/20260930164720_admin_supabase_auth.sql`. Si usas la CLI de Supabase, ejecuta `supabase db push`.
3. En **Project Settings → API**, copia la **Project URL** en `SUPABASE_URL` y en `NEXT_PUBLIC_SUPABASE_URL`. Copia la clave **service_role** en `SUPABASE_SERVICE_ROLE_KEY` y la clave **anon** (o publishable) en `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - La clave `service_role` solo va en variables de servidor. Nunca uses el prefijo `NEXT_PUBLIC_` con ella.
   - La clave anon solo inicia la sesión de Supabase Auth del panel. Todas las tablas de datos personales tienen RLS forzado, sin políticas, y se revocan los permisos de `anon` y `authenticated`. El navegador no puede leer `people` ni `access_tokens` aunque alguien obtenga esa clave. Después de comprobar la sesión y el segundo factor, el servidor sigue leyendo con `service_role`.
4. En **Authentication**:
   - Desactiva el registro público (Allow new users to sign up = off). El alta es solo por invitación.
   - Activa **MFA → TOTP** (App Authenticator).
   - **URL Configuration**: Site URL = `APP_BASE_URL`. En Redirect URLs agrega `https://tu-dominio/admin/auth/confirm` (y el equivalente de preview).
   - Plantillas de correo **Invite user** y **Reset password**: el enlace tiene que llegar al servidor, no solo como fragmento `#access_token`. Usa una URL así:
     `{{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&type={{ .EmailActionType }}`
     Con `type=invite` la persona crea su contraseña; con `type=recovery` la restablece. Si dejas la plantilla por defecto, la página de confirmación también acepta el regreso con `?code=` o el fragmento `#access_token`.
5. En **Database → Network Restrictions**, limita el acceso directo a la base.

## Variables de entorno

Todas están documentadas en `.env.example`.

**Obligatorias**

| Variable | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Conexión a la base (solo servidor), después de comprobar Auth |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sesión de Supabase Auth del panel. No leen datos personales |
| `ENCRYPTION_KEY` | 32 bytes en base64 para AES-256-GCM. **Si se pierde, los datos cifrados no se recuperan.** Guárdala en un gestor de secretos. |
| `HASH_PEPPER` | Pepper del HMAC de cédulas e IP. No lo cambies después de importar la base. |
| `APP_BASE_URL` | Dominio público con el que se construyen los enlaces, por ejemplo `https://actualizacion.dominio.com` |
| `CRON_SECRET` | Protege el cron de retención |
| `SUPPORT_CONTACT` | Contacto de soporte que ve el titular |
| `PRIVACY_*`, `DATA_RETENTION_POLICY`, `LEGAL_REVIEW_APPROVED` | Datos legales (ver más abajo) |

**Opcionales**

| Variable | Uso |
|---|---|
| `TOKEN_TTL_DAYS` | Vigencia de los enlaces. Por defecto 30 días; rango 1–180. |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | CAPTCHA adaptativo de Cloudflare |
| `RESEND_API_KEY`, `EMAIL_FROM` | Opcional. Si `RESEND_API_KEY` no está, el paso 3 muestra «RESEND_API_KEY no está configurada» y no envía correos. Importar y generar enlaces no dependen de eso. |
| `ENCRYPTION_KEY_PREVIOUS` | Solo durante una rotación de llave |

**Rotación de la llave de cifrado.** Mueve la llave actual a `ENCRYPTION_KEY_PREVIOUS` y pon una nueva en `ENCRYPTION_KEY`. Los datos nuevos se cifran con la nueva y los antiguos se siguen leyendo con la anterior.

## Migraciones

Están en `supabase/migrations/`, con nombres por fecha. Cada cambio de esquema debe ir en un archivo nuevo; no se edita uno ya aplicado. La migración inicial crea:

- Tablas: `people`, `contact_information`, `bank_information`, `consents`, `access_tokens`, `audit_logs`, `name_change_history`, `privacy_notices`, `respondent_sessions`, `admin_users`, `exports`, `import_batches`, `security_events`, `rate_limits`.
- `admin_sessions` se elimina en `20260930164720_admin_supabase_auth.sql`. La sesión del panel es la de Supabase Auth.
- RLS forzado en todas. Esa migración no abre `people` ni `access_tokens` a `authenticated`.
- Funciones transaccionales: `submit_person_data`, `rate_limit_hit`, `register_token_failure`, `anonymize_expired_people`, `purge_expired_sessions`, `people_status_counts`. Solo `service_role` puede ejecutarlas.

## Crear un administrador

Con `.env.local` (o `.env`) apuntando a Supabase, y con la migración de Auth ya aplicada:

```bash
npm run admin:create -- --email persona@unibrokers.com.ec --name "Nombre Apellido" --role ADMIN
```

- No pide contraseña. Supabase envía un correo de invitación. La persona abre el enlace, elige su contraseña en `/admin/registro` y configura el TOTP en el teléfono antes de entrar al panel.
- Roles disponibles: `ADMIN` (todo), `REVIEWER` (ver y revisar registros), `EXPORTER` (resumen y exportación).
- Sin el segundo factor (AAL2) no se entra al panel.
- Si el correo ya estaba en `admin_users` pero sin `auth_user_id` (los administradores creados antes de este cambio), el mismo comando lo invita y vincula la fila. Hay que volver a configurar el TOTP: el secreto anterior se borra con la migración y no se puede reutilizar.
- Quien olvide la contraseña usa **Olvidé mi contraseña** en `/admin/login`.

## Semilla de visualización (tres recorridos sintéticos)

El panel necesita fichas que ya recorrieron el producto: enlace, cédula, confirmación de nombres, contacto, banco y consentimientos. Estas tres **no son personas reales**. Sirven para ver el flujo en el panel y, en un caso, para abrir un enlace todavía vigente.

| Nombre | Cédula | Estado | Confirmación |
|---|---|---|---|
| Camila Fernanda Viteri Naranjo | 1700000019 | Completado | AIG-K2N6CMP2 |
| Andrés Mateo Cueva Salazar | 0900000027 | Requiere revisión (corrigió el apellido y la cuenta es de un tercero) | AIG-K2N6RVW3 |
| Lucía Isabel Romero Calle | 0100000033 | Iniciado (ya verificó la cédula; no envió el formulario) | — |

No van en una migración SQL: la cédula y la cuenta se cifran con `ENCRYPTION_KEY` y el HMAC usa `HASH_PEPPER`. Esos valores cambian por entorno y no se guardan en el repositorio.

Con `.env.local` apuntando al proyecto de Supabase (clave **service_role**, solo en el servidor):

```bash
npm run seed:product-users                 # muestra las fichas, no escribe
npm run seed:product-users -- --write      # inserta o actualiza solo estas tres
```

- Puedes correrlo sobre una base vacía o sobre la base de prueba. La segunda vez reemplaza únicamente estas fichas (tienen un id fijo) y no toca el resto.
- Si una de estas cédulas ya pertenece a otra persona, el script se detiene y no la pisa.
- RLS sigue en denegar todo para el navegador. El script usa `service_role`.
- Al escribir, la consola muestra el enlace de cada ficha. En la base solo queda el hash. El de Lucía sigue vigente 30 días; los otros dos figuran como usados.
- Los textos legales no se modifican. Si no hay un aviso activo, se crea una versión provisional y se deja constancia de que sigue pendiente de revisión.
- En la base compartida del portal estas tres fichas ya se pueden ver en el panel (lista, ficha, contacto, banco, consentimientos y auditoría). La cédula y el número de cuenta se cifran recién cuando alguien con la clave del proyecto corre `--write`. Hasta ese momento el detalle no muestra la cédula en claro y la búsqueda por cédula no encuentra la ficha. El enlace de Lucía también queda vigente solo después de ese comando.

## Carga de la base inicial y generación de links

1. Descarga la plantilla `templates/initial_people.csv` (también disponible en el panel). Las columnas recomendadas son **Nombres**, **Apellidos** y **Cédula**. El mismo archivo también se acepta si los títulos vienen como `first_names`, `last_names` y `national_id` (la cédula). Lo único que no puede faltar es la cédula de 10 dígitos.
2. Ve a **/admin → Importar y enlaces** y sube el archivo CSV o XLSX (máximo 5 MB y 20.000 filas). Si el archivo trae el nombre completo en una sola columna y la cédula en otra, aunque los títulos no coincidan con la plantilla, también se lee. Una columna de apellidos que solo tiene números (la cédula repetida) no se usa como apellido.
3. El sistema valida cada fila:
   - formato de nombres;
   - cédula (10 dígitos, provincia y dígito verificador);
   - duplicados dentro del archivo;
   - cédulas que ya existen en la base.
   Si Excel quitó el 0 inicial de una cédula de 9 dígitos, se corrige automáticamente.
4. **Nada se importa en silencio.** Al terminar ves una nota de novedades: carga exitosa, o el detalle de las filas que no entraron. Si hay errores y no marcas "importar solo las válidas", no se importa ningún registro. La cédula aparece enmascarada en el reporte.
5. Al importar, descarga el **CSV de enlaces** en ese mismo momento. Por seguridad, los enlaces no se vuelven a mostrar, porque en la base solo existe su hash.
6. Para reenviar enlaces:
   - **Generar enlaces faltantes** crea enlaces nuevos para quienes siguen pendientes y tienen el enlace vencido o revocado.
   - **Enviar enlaces por correo** escribe solo a quien tiene correo y todavía no tiene un enlace vigente. No anula un enlace ya entregado, porque el enlace en claro no se guarda. Si `RESEND_API_KEY` no está configurada, el panel lo dice y no envía; **Generar enlaces faltantes** sigue disponible.
   - En la ficha de cada persona, **Generar nuevo enlace** revoca el anterior y crea uno nuevo.
   - Un **cambio manual** en la ficha pide de nuevo el código de la aplicación autenticadora. La auditoría guarda quién cambió qué campos, no los valores nuevos.

## Carga de contacto para Unibrokers

En **/admin → Archivo para AIG**, debajo del archivo de reclamos o reembolsos, está **Descargar carga para Unibrokers**. Lleva nombres, cédula, correo, celular y estado. No lleva datos bancarios.

El envío directo a su sistema queda en espera: faltan `UNIBROKERS_API_URL`, `UNIBROKERS_API_KEY` y la confirmación del formato que ellos aceptan. Hasta entonces el paquete se descarga y se entrega a operaciones. Si algún día esas dos variables existen, el portal intenta un POST JSON y, de todos modos, deja el archivo.

El archivo de enlaces da acceso a los formularios. Compártelo solo con quien hará los envíos y bórralo después.

## Despliegue en Vercel

1. Sube el repositorio a GitHub (privado) e impórtalo en Vercel. El framework se detecta solo: Next.js.
2. En **Settings → Environment Variables**, carga todas las variables de `.env.example`, tanto para Production como para Preview. Usa llaves distintas en Preview y en Production.
3. Configura el dominio definitivo y pon el mismo valor en `APP_BASE_URL`.
4. Ejecuta el deploy. El cron diario de retención (`/api/cron/retention`, 06:00 UTC) ya está en `vercel.json`. Vercel envía `CRON_SECRET` automáticamente.
5. Comprueba que funciona: `/api/health` debe responder `{"ok":true}`. Luego haz una prueba completa con un registro ficticio en Preview.

**Comportamiento según entorno**

- **Preview o desarrollo.** Aparece una franja "Entorno de prueba" mientras haya textos pendientes de revisión legal.
- **Producción.** Si queda algún placeholder o `LEGAL_REVIEW_APPROVED` no es `true`, el portal muestra "Portal en preparación" y no acepta datos.

## Política de backups

- **Supabase.** En plan Pro o superior hay backups diarios automáticos, cifrados en reposo (AES-256). Se recomienda activar **Point-in-Time Recovery** mientras dure la campaña de actualización.
- **Datos cifrados en la app.** Los backups contienen la cédula, la cuenta y la cédula del titular cifradas. Sin `ENCRYPTION_KEY` no se pueden leer. Guarda la llave en un gestor de secretos, **separada** de los backups y con acceso restringido.
- **Prueba de restauración.** Haz una trimestral en un proyecto aislado. Registra quién la hizo y el resultado.
- **Retención.** Los backups deben seguir el mismo plazo de conservación: cuando un registro se anonimiza, los backups antiguos que lo contienen vencen según la rotación del proveedor.
- **Nunca** descargues volcados de la base a equipos personales.

## Medidas de seguridad

**Acceso y anti-enumeración**
- Enlaces individuales de 256 bits más la cédula como segunda capa.
- El enlace se bloquea tras 5 intentos fallidos.
- Rate limiting distribuido en PostgreSQL: 10 intentos cada 15 minutos por IP.
- CAPTCHA (Turnstile) a partir del 4.º intento.
- Los errores son genéricos: no revelan si una cédula existe.
- No hay búsqueda pública.

**IDOR y mass assignment**
- La persona se resuelve siempre desde la sesión del servidor, nunca desde un ID enviado por el navegador.
- Los esquemas Zod son `strict`: rechazan campos extra.
- Los nombres "confirmados" no se pueden alterar en el envío.

**Sesiones**
- El titular sigue con cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, 30 minutos.
- El panel usa la cookie de Supabase Auth (`@supabase/ssr`): `HttpOnly`, `Secure` fuera de desarrollo y `SameSite=Lax`, para que el enlace del correo pueda completar el ingreso. El middleware exige sesión verificada en `/admin` y AAL2 (TOTP) antes del panel.

**Inyecciones**
- Consultas parametrizadas: sin SQL dinámico con datos de usuario.
- React escapa todo el contenido y los inputs se sanitizan.
- CSP con nonce, sin `unsafe-inline` en scripts.
- Neutralización de fórmulas en los archivos Excel y CSV.

**CSRF**
- Las Server Actions de Next validan el origen.
- La ruta de exportación verifica `Origin`, y las cookies son `SameSite=Strict`.

**Cabeceras**
- HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` (evita que el token se filtre por la cabecera Referer), `Permissions-Policy` y `noindex`.
- Las páginas con datos personales llevan `Cache-Control: no-store`.

**Datos en reposo**
- Supabase cifra la base.
- La app cifra además con AES-256-GCM la cédula, la cuenta y la cédula del titular.
- Solo se muestran enmascaradas: `17******45` y `••••••••4821`.

**Logs y analítica**
- `audit_logs` guarda solo nombres de campos, nunca valores. Las IP se guardan como HMAC.
- No hay Google Analytics, Meta Pixel ni ningún otro tracker.
- Los datos bancarios nunca pasan por URLs ni query strings.

**Cambios que pasan a revisión (NEEDS_REVIEW)**
- Nombres corregidos por el titular.
- Cuentas bancarias de terceros.

## Proceso de exportación para AIG

Se hace en **/admin → Generar archivo para AIG** y solo pueden usarlo los roles ADMIN y EXPORTER.

1. Elige el perfil según la finalidad:
   - **Gestión de reclamos**: contacto, sin datos bancarios.
   - **Pago de reembolsos**: incluye la cuenta completa.
2. Escribe el motivo o la solicitud que justifica la exportación. Es obligatorio y queda registrado en la auditoría.
3. Elige XLSX o CSV. El archivo se genera en memoria y se descarga directamente: no se guarda en el servidor ni se crea ningún enlace público.
4. Qué incluye el archivo:
   - Solo registros **COMPLETED**, es decir, completados o ya revisados, con consentimiento vigente para comunicar datos a AIG.
   - Todas las celdas en formato texto, lo que conserva los ceros iniciales de cédulas y cuentas.
5. Qué queda registrado: quién exportó, cuándo, cuántos registros, qué campos y con qué finalidad (tablas `exports` y `audit_logs`).
6. Envía el archivo a AIG por un canal cifrado y elimínalo de tu equipo al terminar.

Hay un límite de 20 exportaciones por hora por usuario.

## Conservación de datos

- El plazo se define en `DATA_RETENTION_POLICY` con los meses, el motivo y una fecha de expiración opcional.
- Cada envío guarda su `retention_until`.
- El cron diario anonimiza los registros vencidos:
  - borra contacto, datos bancarios e historial de nombres;
  - reemplaza nombres y cédula;
  - revoca los enlaces.
- Se conserva la evidencia del consentimiento, sin datos identificativos.

## Pruebas

```bash
npm run check
```

Ese comando es lint, tipos, pruebas y build. GitHub Actions hace lo mismo y después corre el navegador con las tres fichas sintéticas en memoria (`npm run test:e2e`). No hace falta ninguna clave real. `DEMO_MODE` no se activa en el build, y en producción la aplicación se niega a arrancar así. Detalle: [docs/api-contracts.md](docs/api-contracts.md) y [docs/ci.md](docs/ci.md).

Las pruebas cubren:

- **Validaciones:** cédula; correos y cuentas que no coinciden; campos obligatorios; mass assignment.
- **Identificación y enlaces:** identificación; token vencido, revocado y usado; intento de abrir el registro de otra persona; bloqueo tras 5 intentos; rate limiting contra búsquedas masivas; CAPTCHA.
- **Envío:** actualización de datos; consentimiento obligatorio; nombres corregidos y cuenta de tercero, que pasan a revisión; ausencia de datos personales en la auditoría.
- **Panel:** RBAC; exportador sin permiso; perfiles de exportación; fórmulas; importación sin descarte silencioso; el panel exige sesión de Auth vinculada y TOTP (AAL2); el modo demostración conserva contraseña, TOTP y bloqueo.
- **Cifrado y rotación de llave.**
- **Placeholders legales y bloqueo en producción.**

La migración SQL también se probó sobre PostgreSQL 16:

- flujo de envío transaccional;
- rechazo del segundo envío;
- anonimización;
- acceso denegado al rol `anon`.

## Aspectos que requieren revisión legal antes de producción

Estos datos **no se inventaron**. Deben completarse con información validada por el área legal:

| Variable | Qué completar |
|---|---|
| `PRIVACY_RESPONSIBLE_LEGAL_NAME`, `PRIVACY_RESPONSIBLE_RUC`, `PRIVACY_RESPONSIBLE_ADDRESS` | Responsable del tratamiento. Definir si es la Agrupación Marista, Unibrokers o ambos como corresponsables. |
| `PRIVACY_EMAIL`, `PRIVACY_PHONE` | Canal para el ejercicio de derechos |
| `PRIVACY_DPO` | Delegado de Protección de Datos, si corresponde |
| `PRIVACY_RECIPIENT_LEGAL_NAME` | Razón social exacta de la aseguradora AIG en Ecuador |
| `DATA_RETENTION_POLICY` | Plazo de conservación y su base legal o contractual |
| `PRIVACY_NOTICE_EFFECTIVE_DATE` | Fecha de vigencia del aviso |

Además, el área legal debe revisar:

- el texto del aviso (`lib/privacy/notice.ts`) y los 4 textos de consentimiento;
- la página `/privacidad`, que menciona la LOPDP (RO 459, 26-may-2021) y su Reglamento (Decreto Ejecutivo 904);
- el acuerdo de encargo de tratamiento con Kraken Lab y con el proveedor de hosting;
- la transferencia internacional de datos: Vercel y Supabase alojan fuera de Ecuador, así que corresponde evaluar las garantías adecuadas conforme a la LOPDP;
- la base de legitimación para comunicar los datos a AIG.

Cuando el área legal apruebe, define `LEGAL_REVIEW_APPROVED=true`. El aviso también puede actualizarse desde **/admin → Aviso de privacidad**: cada versión queda registrada, y cada consentimiento guarda la versión y el hash del texto aceptado.
