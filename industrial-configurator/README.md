# CarStar industrial hall configurator

Next.js 16 + React Three Fiber configurator for steel/sandwich-panel halls. Prices and saved
configurations live in SQLite via Prisma 7.

## Setup (fresh clone)

Requires Node >= 20 (<27) and pnpm 12 (`corepack enable` picks the version from `packageManager`).

```bash
cd industrial-configurator
pnpm install                 # also runs `prisma generate` (postinstall)
cp .env.example .env
pnpm prisma migrate deploy   # creates prisma/dev.db from prisma/migrations
pnpm db:seed                 # default prices (optional: /api/prices self-seeds too)
pnpm dev                     # http://localhost:3000
```

Clean-install check: `rm -rf node_modules src/generated && pnpm install && pnpm build`.

## Scripts

| Script | What it does |
|--------|--------------|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm lint` | ESLint (generated code in `src/generated` is ignored) |
| `pnpm test` | Vitest (`vitest run --passWithNoTests`) |
| `pnpm db:seed` | Seed default prices |
| `pnpm prisma migrate dev --name <x>` | Create a new migration after editing `prisma/schema.prisma` |

CI (`.github/workflows/ci.yml`): install, `tsc --noEmit`, lint, test, build.

## Environment variables

See `.env.example`: `DATABASE_URL` (SQLite file), `RESEND_*` (contact email),
`ALLOWED_DEV_ORIGINS` (optional, comma-separated tunnel hosts for `next dev`).

## Layout

- `src/app` pages and API routes, `src/components/3d` R3F scene, `src/components/configurator` UI steps
- `src/stores` Zustand stores, `src/lib` helpers, `prisma/` schema, migrations, seed
- `public/models` shipping GLBs only. Blender sources (`*.blend`) are not in git; they live in
  `~/CarStar-assets/` and are rebuilt by `scripts/blender/*.py`.
