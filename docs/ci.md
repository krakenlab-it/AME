# Comprobaciones automáticas

Cada pull request y cada push a `main` ejecutan `.github/workflows/ci.yml`, en este orden:

1. `npm ci`
2. Instala Chromium para Playwright
3. `npm run lint`
4. `npm run typecheck`
5. `npm test` (incluye el seed KAN-106 y la identificación en memoria)
6. `npm run build` con `DEMO_MODE=false`
7. `npm run test:e2e`

El paso del navegador arranca ese build con `DEMO_MODE=true`, `SEED_PRODUCT_USERS=true` y `APP_STAGE=development`. Carga las tres fichas sintéticas en memoria (los mismos datos que `lib/seed/product-personas.ts`) y recorre el enlace en curso, un enlace ya usado y el panel. No llama a `npm run seed:product-users -- --write`: ese comando necesita `SUPABASE_SERVICE_ROLE_KEY` y es para una base real, fuera de CI.

En local, el mismo camino:

```bash
npm ci
npx playwright install --with-deps chromium
npm run check
npm run test:e2e
```

`npm run check` es lint, tipos, pruebas y build. Node.js 20.9 o superior (CI usa Node 22).

## Secretos

CI **no** usa secretos de GitHub ni de Vercel. No configura `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` ni claves de correo. `ENCRYPTION_KEY` y `HASH_PEPPER` del navegador se generan al vuelo y solo cifran la memoria de esa prueba.

`DEMO_MODE` va en `false` durante el build. El navegador lo enciende después, y solo porque el entorno no es producción. Si en producción `DEMO_MODE=true` (junto con `VERCEL_ENV=production` o `APP_STAGE=production`), el servidor no arranca, aunque `SEED_PRODUCT_USERS` también esté en true.

## Qué no cubre este workflow

El build no despliega ni abre la base. El visto bueno de humo en el preview de Vercel sigue siendo manual.
