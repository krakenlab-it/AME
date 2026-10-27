# E2E con Supabase Auth real

Prueba el flujo de invitación, restablecimiento de contraseña y TOTP del panel, y el ingreso de pasaportes en `/ingresar`, contra un GoTrue local de verdad (no mocks). No toca producción: usa solo el Supabase local de `supabase start` y claves desechables que se generan en cada corrida.

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

## Ingreso con pasaporte (`passport-signin.spec.ts`)

Importa por el importador del panel (CSV `Nombres,Apellidos,Cédula`) dos pasaportes y una cédula, y recorre `/ingresar` con códigos reales de Mailpit hasta la confirmación. Usa un tercer admin de arranque (`admin-c@ame.test`) para no depender del resto de la suite.

- 1. importación de dos pasaportes y una cédula (se verifican hashes y últimos 2 caracteres en `people`).
- 2. y 3. ingreso con el pasaporte tal como se escribió y en minúsculas con espacios, onboarding completo.
- 4. reingreso: mismo dactilar entra, otro dactilar se rechaza.
- 5. otro correo no puede reclamar un pasaporte ya reclamado.
- 6. pasaporte desconocido: rechazo en español y sin cuenta nueva.
- 7. cédula de 10 dígitos: ingreso y onboarding sin cambios.
- 8. Resumen con documento enmascarado, alerta de vinculación enmascarada y archivo CSV para AIG con las tres personas.

Para recibir el código por correo, `supabase/config.toml` define plantillas `magic_link` y `confirmation` que muestran `{{ .Token }}`. Antes de cada corrida se vacían `people` y `rate_limits` locales (el pepper cambia en cada arranque).

## Interruptor del pasaporte (`passport-kill-switch.spec.ts`)

`AME_PASSPORT_SIGNIN=off` apaga el ingreso con pasaporte en `/ingresar` (se lee en cada petición del servidor). Este spec solo corre con el servidor arrancado así y se omite en la corrida normal:

```bash
AME_PASSPORT_SIGNIN=off npx playwright test -c playwright.auth.config.ts e2e-auth/passport-kill-switch.spec.ts
```

Con el interruptor apagado el pasaporte se rechaza con el mensaje de siempre, el texto vuelve a decir solo cédula y la cédula entra y completa igual.

