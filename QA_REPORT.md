# QA_REPORT (Agent Q, branch ws-q, main @ 4374014)

Checks: tsc, lint, test, build, curl against a local dev server (:3007), `__hallStats`, 3 screenshots (0.5 scale).
Pane was phone-sized (382x370), so visual checks are coarse.

## §9 Definition of done

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Fresh clone works with no manual steps | PASS (with caveat) | `pnpm install` (postinstall prisma generate), `cp .env.example .env`, `prisma migrate deploy`, `db:seed` all OK. The `.env` step (AUTH_SECRET, ADMIN_PASSWORD_HASH with `\$` escaping) is manual but documented in README. Without it, admin login is disabled with a clear log line. Not a literal "no manual steps". |
| 2 | tsc, lint, test, build green in CI | PASS | tsc 0 errors; lint 0 problems; 318/318 tests (15 files); build OK; `.github/workflows/ci.yml` runs frozen install, tsc, lint, test, build. |
| 3 | Any W 8-20, H 3-6, L 12-102 renders a correct hall | PASS (numbers) | `__hallStats` frames == expectedFrames for 13.5x4.5x102 (18), 8x3x12 (3), 20x6x102 (18), 18x5x48 (9); purlinsPerSide 4/6/7/8; eaveY and ridgeY consistent. Orchestrator's 100-combo matrix was not re-run. Gaps and floating purlins were not judged visually at full size (pane too small). |
| 4 | L=102: <1 M tris, <50 draw calls, idle GPU, <3 s | PASS | 13.5x4.5x102: 176,684 tris / 32 calls. 20x6x102: 203,432 tris / 32 calls. renderFrame stayed at 30 over 3 s untouched (frameloop demand). The 3 s interactive time was not measured in a real browser; the model loads in about 6 s in the dev server, where the dev compile dominates. |
| 5 | Openings: place, drag, resize, ground doors, holes, reload/shared links | PARTIAL (unverified in browser) | 318 unit tests cover clamp, validate, holes and persist. E's status says the browser check was NOT done. I did not test it either (small pane, budget). Treat as unconfirmed. |
| 6 | Admin and APIs protected and validated; email escaped and rate-limited; server price | PASS | Unauthenticated `/api/admin/configurations`, `/api/configurations`, `/api/admin/prices` and `PUT /api/prices` all return 401. `/admin` returns 307 to login. Login with a throwaway password returns 200, then admin list returns 200 `{items,nextCursor}`. Admin price PUT of -5 returns 400. send-email with a bad email returns 400. Rate limit: calls 5 and 6 returned 429. POST configurations with bad body returns 400 with zod details. Server-side price recompute is covered by serverPrice tests; I did not check it end to end. The 500s from send-email were my dummy Resend key. |
| 7 | No binaries >5 MB outside LFS, no dead files, accurate README | PASS | Largest asset is hall-kit.glb at 165 KB; no file >5 MB outside node_modules/.next. da-draco.glb, Da.jsx and the legacy engine are gone. README commands match reality. Note: git history still holds the old GLBs (the filter-repo purge is an owner task, not run). |

Counts: 6 PASS (item 1 with caveat), 1 PARTIAL.

## Known items confirmed

- Look (one screenshot, clad 18x5x48, step 2): reads as a coherent grey steel hall with a green ground. It is tiny and distant in the small pane, so detail can't be judged. D never compared it against the old 12/15/18 renders (still open). The wall cladding metalness is 0.35 (`PANEL_METALNESS` in `materials.ts`), a deliberate departure from the asset.
- F9 FAIL: `setHallReady` is defined in the store, but nothing outside the store calls it. `configurator/page.tsx` falls back to `useProgress`, so the loader does hide. `__hallStats.ready` is true, but that is D's own flag, not the store's.
- F11 FAIL (partial): `wallLabelRo` exists in `src/lib/i18n/ro.ts` but no component imports it. `ClosingsStep.tsx` lines 241 and 280 still use the inline `.replace(...)` chains.
- F12 FAIL (not done): the bottom sheet opens by default over the canvas on a phone-sized viewport (first screenshot: the hall is fully hidden at step 1). Not fixed or verified.
- Dev hooks are absent from `.next/static` (build output grep: no hits). PASS.

## Regressions
- None found against the numbers above. Minor: Next warns about multiple lockfiles (root `pnpm-lock.yaml` plus `industrial-configurator/pnpm-workspace.yaml`); set `turbopack.root`. Owner: A.

## Open tasks from REVIEW_FINDINGS.md
- F9 (D: call `setHallReady(true)` after the first frame; false on unmount).
- F11 (E: ClosingsStep uses `wallLabelRo`).
- F12 (F: bottom sheet check and fix).
- E browser verification of E5-E11 (not covered by any run).
- D: visual comparison against the old 12/15/18 renders (no ID).
- A3 history purge (owner, `git filter-repo`, not run).
- F business questions 1-4 (price, VAT, bays); C `Panel` metallicFactor ~0.35 in the GLB, so `PANEL_METALNESS` can go (optional).

## FAIL table
| Item | Owner | Files |
|------|-------|-------|
| F9 hallReady never set | WS-D | `src/components/3d/hall/Hall.tsx` (or `CameraRig.tsx`), store in `src/stores/useConfiguratorStore.ts` |
| F11 ClosingsStep still uses inline replace chains | WS-E | `src/components/configurator/steps/ClosingsStep.tsx:241,280` |
| F12 bottom sheet covers the canvas on mobile, unverified | WS-F | `src/components/configurator/**` (sheet) |
| §9-5 openings not browser-verified | WS-E | `src/components/3d/openings/**` |
