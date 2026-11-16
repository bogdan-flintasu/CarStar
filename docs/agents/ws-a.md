# WS-A status (repo hygiene & build) — branch ws-a

## Done
- A1 pnpm only (package-lock.json removed); pnpm 12 uses `allowBuilds` in pnpm-workspace.yaml (replaces
  onlyBuiltDependencies/ignoredBuiltDependencies); `@prisma/client-runtime-utils`, `dotenv` direct deps;
  `postinstall: prisma generate`; `engines`, `packageManager: pnpm@12.10.1`. Clean install + tsc + test + build verified.
- A2 duplicate `setHoveredWallId` line removed (useOpeningsStore.ts, only that line).
- A5 eslint ignores `src/generated/**`, `coverage/**`.
- A6 `prisma/dev.db` untracked, `*.db` gitignored, migration `prisma/migrations/*_init`, `prisma/seed.ts`
  (exports DEFAULT_PRICES; run `pnpm db:seed`), `.env.example` rewritten for SQLite.
- A7 removed legacy configurator.js, 3d/Da.jsx, default Next SVGs. KEPT public/photos/image.png (used by src/app/page.tsx:179).
- A4 deleted cloudflared.deb and `untitled:` file; `allowedDevOrigins` from env `ALLOWED_DEV_ORIGINS`.
- A3 removed da.glb, da.gltf, da-transformed.glb, models/Da.jsx from tree. KEPT da-draco.glb. .gitignore excludes
  *.blend, *.blend1, assets/blender/**/*.blend, *.deb. .gitattributes: binary rules, NO LFS.
- A8 Vitest (`vitest.config.ts`, alias `@`, tests `src/**/*.test.ts(x)`), `pnpm test`, `.github/workflows/ci.yml`.
- A9 README rewritten.

## Decisions
- No git-lfs (orchestrator). History not rewritten.
- Kept the Prisma output at src/generated/prisma (gitignored) rather than moving it.

## Handoffs
- `pnpm lint` still fails on app code (13 errors, 21 warnings in files owned by D/E/F/B): each WS must fix its own; CI lint will be red until then.
- F6: DEFAULT_PRICES exists in seed.ts, api/prices/route.ts and useConfiguratorStore.ts; B/F should dedupe.
- B: auth env vars (AUTH_SECRET, ADMIN_*) were removed from .env.example as unused; add back when auth lands.
- Owner, later (history purge, not run): `git filter-repo --invert-paths --path industrial-configurator/public/models/da.glb --path industrial-configurator/public/models/da.gltf --path industrial-configurator/public/models/da-transformed.glb --path cloudflared.deb --path industrial-configurator/prisma/dev.db`
  (rewrites history; everyone must re-clone).

## Handoffs resolved (ws-a2)
- `.env.example` has AUTH_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD_HASH (escaping + bcryptjs command), APP_BASE_URL; README updated.
- `prisma/seed.ts` imports DEFAULT_PRICES from `../src/lib/pricing` (relative path); `pnpm db:seed` verified on a fresh DB.
- `next-auth` removed (unused), lockfile updated.
- Verified: tsc, 78 tests, build OK; lint = the 4 pre-existing D-owned errors, none added.
