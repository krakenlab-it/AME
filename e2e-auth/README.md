# E2E de recuperación de acceso con Supabase Auth real

Prueba el flujo de invitación, restablecimiento de contraseña y TOTP del panel contra un GoTrue local de verdad (no mocks). No toca producción: usa solo el Supabase local de `supabase start` y claves desechables que se generan en cada corrida.

## Requisitos

- Docker en marcha y la CLI de Supabase.
- `supabase start` desde la raíz del repo (aplica `supabase/migrations` y las plantillas de `supabase/templates`).
- `npm run build` previo (el servidor de pruebas es `next start`).

## Correr

```bash
npm run build
npm run test:e2e:auth
```

La suite no corre en CI ni con `npm run test:e2e`: tiene su propia config (`playwright.auth.config.ts`). Si no hay Supabase local, falla con un mensaje claro al arrancar.

## Qué simula

- `ame.test` (apex) y `www.ame.test` apuntan a 127.0.0.1 solo dentro de Chromium; el apex se redirige con 308 a `www`, como en producción.
- `APP_BASE_URL` del servidor de pruebas es el apex a propósito: los correos tienen que salir con la base canónica `www`.
- Los correos se leen de Mailpit (`supabase status`). Los códigos TOTP se generan con `lib/security/totp.ts` a partir del secreto enrolado.
- Las ventanas de tope se envejecen con SQL local; no hay esperas reales de 15 minutos.

## Escenarios

- b. invitación de un admin nuevo (sin factor): contraseña sin código y luego enrolar TOTP.
- preparación: el admin A entra por invitación, enrola TOTP e ingresa.
- a. `/admin/recuperar` en `www`: enlace con base canónica, código obligatorio, error en español si falla, contraseñas conservadas en pantalla, guardado en AAL2, reingreso y contraseña vieja rechazada.
- c. enlace usado o vencido muestra el texto real y se puede pedir uno nuevo.
- d. tope de `/admin/recuperar` con mensaje claro, que se levanta al pasar la ventana.
- e. el enlace abre en otro navegador distinto del que lo pidió (requiere las plantillas con `token_hash`).
