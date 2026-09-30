# Comprobaciones automáticas

Cada pull request y cada push a `main` ejecutan `.github/workflows/ci.yml`:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

En local es el mismo conjunto:

```bash
npm run check
```

Requisito: Node.js 20.9 o superior (CI usa Node 22).

## Secretos

CI **no** usa secretos de GitHub ni de Vercel. No configura `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `HASH_PEPPER`, `CRON_SECRET` ni claves de correo. Esas variables viven en Vercel (Production y Preview, con valores distintos) y, en local, en `.env.local`, que no se sube al repositorio.

`DEMO_MODE` va en `false` dentro del workflow. Si en producción `DEMO_MODE=true` (junto con `VERCEL_ENV=production` o `APP_STAGE=production`), el servidor no arranca.

## Qué no cubre este workflow

El build no despliega ni abre la base. El visto bueno de humo en el preview de Vercel sigue siendo manual.
