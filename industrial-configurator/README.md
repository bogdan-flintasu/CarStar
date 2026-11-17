# CarStar industrial hall configurator

Next.js 16 + React Three Fiber configurator for steel/sandwich-panel halls. Prices and saved
configurations live in SQLite via Prisma 7.

## Setup (fresh clone)

Requires Node >= 20 (<27) and pnpm 12 (`corepack enable` picks the version from `packageManager`).

```bash
cd industrial-configurator
pnpm install                 # also runs `prisma generate` (postinstall)
cp .env.example .env         # then set AUTH_SECRET, ADMIN_PASSWORD_HASH, APP_BASE_URL (see Environment variables)
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
`AUTH_SECRET` (>= 32 random chars), `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`
(bcrypt, each `$` escaped as `\$` in `.env`; generate with
`node -e "console.log(require('bcryptjs').hashSync(process.argv[1],12))" '<password>'`), `APP_BASE_URL`
(public origin, used to validate email links and in the PDF quote's link and QR code), `ALLOWED_DEV_ORIGINS` (optional, comma-separated tunnel hosts for `next dev`),
`BRAND_*` (company name, logo, colours and contact shown in the PDF quote and lead email, `src/lib/branding.ts`),
`QUOTE_VAT_RATE` / `QUOTE_PRICES_INCLUDE_VAT` (how the quote presents VAT, `src/lib/quote/settings.ts`).

## Renders and PDF quote

- **Renders** (`src/components/3d/hall/renders.tsx`): when the customer reaches the summary, four fixed views
  (front, rear, side, aerial) are rendered from the live scene into an offscreen target with their own camera
  (framing math: `src/lib/hall/renderViews.ts`), helpers hidden, bigger soft shadows, MSAA, encoded as JPEG.
  One view per frame. Objects marked with `renderHiddenProps` never appear in renders.
- **Storage**: saving a configuration uploads the renders (multipart `POST /api/configurations`); they are validated
  by magic bytes (`src/lib/validation/renders.ts`) and stored in `ConfigurationImage` through
  `src/app/api/_lib/renderStore.ts` (the only module that touches the bytes).
- **PDF**: `GET /api/configurations/<token>/pdf` builds the quote from the stored configuration and current DB prices
  (`src/lib/quote/quoteModel.ts` → `src/app/api/_lib/quotePdf.tsx`, @react-pdf/renderer, Inter font in
  `assets/fonts/inter`, OFL). The lead email attaches the same PDF.

## Layout

- `src/app` pages and API routes, `src/components/3d` R3F scene, `src/components/configurator` UI steps
- `src/stores` Zustand stores, `src/lib` helpers, `prisma/` schema, migrations, seed
- `public/models` shipping GLBs only. Blender sources (`*.blend`) are not in git; they live in
  `~/CarStar-assets/` and are rebuilt by `scripts/blender/*.py`.
