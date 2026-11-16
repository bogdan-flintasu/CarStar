# CarStar repair — summary

Final gate on main (37c0926): install, `tsc --noEmit`, lint (0 problems), 318/318 tests and build are all green.
Branches were merged locally with `--no-ff`. Nothing was pushed. Full log: `docs/agents/ORCHESTRATOR.md`. QA: `QA_REPORT.md`.

## Per workstream
- **A, repo hygiene and build (ws-a, ws-a2):** a clean `pnpm install && pnpm build` now works. Prisma generates on postinstall, and an init migration and seed are added. Dead model files and other junk are removed from the working tree. Vitest and CI (`.github/workflows/ci.yml`) are set up. `.env.example` documents the auth vars, `next-auth` is removed, and the seed uses the shared `DEFAULT_PRICES`. `turbopack.root` is set.
- **B, security and API (ws-b, ws-b2):** admin login uses an HMAC-signed httpOnly cookie, and `src/proxy.ts` protects `/admin` and `/api/admin/*`, which return 401 without it. Request bodies are validated with zod, email HTML is escaped, `configurationLink` is allow-listed, and there is a per-IP rate limit, a honeypot field and a body size cap. The server recomputes the price itself (B5).
- **C, 3D assets (ws-c, ws-c2):** a reproducible headless Blender pipeline (`scripts/blender/*.py`, `scripts/optimize-model.mjs`) turns the 99 MB `da.glb` into `public/models/hall-kit.glb`. The kit is 165 KB, about 10.8k triangles per frame (was 1.52M), with LOD1 versions. `ASSET_CONTRACT.md` v1.0 describes it. The `.blend` files live in `~/CarStar-assets/` and are not in git.
- **D, engine (ws-d, ws-d2):** `computeHallLayout` is a pure function (`src/lib/hall/`) covered by tests. The new declarative engine is in `src/components/3d/hall/`, and the old engine, the clipping planes and `da-draco.glb` are deleted. At L=102 a hall is about 180k triangles and 22–32 draw calls (was 15.8M and 2134), and the GPU sits idle when nothing changes. Dev hooks: `window.__hallStats`, `__hallSet`, `__hallAdvance`, and the URL params `?w=&h=&l=&step=`. D9 is done.
- **E, openings (ws-e, ws-e2b):** every opening gets a unique nanoid. Openings are stored in metres and clamped to their wall, doors stay on the floor, and resizing keeps the opposite edge fixed. Openings use D's wall descriptors and cut real holes in the walls. Overlap, column and downpipe conflicts are flagged, openings are re-clamped when the hall changes, and you can click a wall to place one.
- **F, UI/state/pricing (ws-f, ws-f2, ws-fix):** `calculatePrice` and `DEFAULT_PRICES` live in `src/lib/pricing.ts`. The persisted store has a version and a migration, and hydration is done safely. Shared links are validated with zod. Lengths are free, the client price is labelled "Preț estimativ", "Continuă" is blocked while openings conflict, the honeypot field and the 400/429 messages are in place, there is a loader ready flag, the Romanian labels are used, and the mobile bottom sheet is 45vh.

## Skipped / not verified
- **Optional tasks:** E12 and E13 were not done.
- **Openings in the browser:** placing, dragging and resizing in the browser were never checked. Hidden-pane rendering was too slow to test there, so only unit tests cover them.
- **Look:** the new hall was not compared side by side against the old 12/15/18 m renders. QA judged one screenshot "a coherent steel hall".
- **Look choices D made itself:** cladding metalness is 0.35 and steel has no colour map.
- **Not measured:** the 3 s time-to-interactive target. The server-side price is tested by unit tests only. F12 was not checked at phone width.
- **Model choices:** per your instruction mid-run, E part 2, F part 2, Q and the fixes ran on Sonnet, and Q ran once. Nothing was BLOCKED or reverted.

## Open business questions
1. Should the roof and gable area be priced? Do the insulation tiers (30/50/80 mm) change the price per m²?
2. Should window and door prices scale with size? Is pricing the structure by volume (€/m³) intentional?
3. Are prices with or without VAT? Round to 1 EUR or 10 EUR?
4. Length grid: lengths are now free (any value in metres). Does the business accept bays that aren't 6 m?

## History purge (not run; rewrites history, run only if you want it)
```bash
git filter-repo --invert-paths --path industrial-configurator/public/models/da.glb --path industrial-configurator/public/models/da.gltf --path industrial-configurator/public/models/da-transformed.glb --path cloudflared.deb --path industrial-configurator/prisma/dev.db
```
(`da-draco.glb` can be added to that list too: it was removed from the tree at 1742ed9.)
