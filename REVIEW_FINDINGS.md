# CarStar Industrial Configurator — Review Findings & Work Plan

Review date: 2026-11-16 · Scope: whole `industrial-configurator/` folder + repo root (not a diff).
Review axes: correctness, readability, architecture, security, performance.
Severity: **Critical** (broken/insecure, blocks release) · **Required** (must fix) · **Optional** · **Nit**.

Evidence tags: `[verified]` = reproduced by running the app / tools; `[code]` = found by reading code.

---

## 0. How to use this file (for agents)

Work is split into **6 workstreams** with **disjoint file ownership** so agents can run in parallel without
editing the same files. Each task has an ID, the files it touches, the fix, and acceptance criteria.

All agents are Claude Code sessions. The ready-to-paste launch prompts are in **§10**.
All paths are relative to `industrial-configurator/` unless stated otherwise.

| WS | Model · effort | Wave | Owns these paths (only this agent edits them) | Depends on |
|----|----------------|------|-----------------------------------------------|------------|
| **A** Repo hygiene & build | Sonnet 5.5 · medium | 1 | repo root files, `package.json`, lockfiles, `pnpm-workspace.yaml`, `.gitignore`, `.gitattributes`, `eslint.config.mjs`, `tsconfig.json`, `vitest.config.*`, `.github/workflows/**`, `prisma/` (schema, migrations, seed), `.env.example`, `README.md`, `next.config.ts` | — (small, do first) |
| **B** Security & API | Opus 5.5 · high | 2 | `src/app/api/**`, `src/app/admin/**`, new `src/lib/auth*`, new `src/middleware.ts`, new `src/lib/validation/**` | A merged |
| **C** 3D asset pipeline (Blender) | Opus 5.5 · high | 1 | `assets/blender/**`, `scripts/blender/**`, `scripts/optimize-model.*`, `public/models/**`, `public/models/ASSET_CONTRACT.md` | — (needs Blender running locally) |
| **D** Engine rewrite | **Fable 5.2** · high (the one Fable task) | 2 | `src/components/3d/Configurator.tsx`, new `src/components/3d/hall/**`, `src/components/3d/DimensionLines.tsx`, `src/components/configurator/ConfiguratorEngine.tsx`, new `src/lib/hall/**`, `src/components/landing/LandingScene.tsx`, `src/lib/hardwareTier.ts` | A merged; C's contract + kit GLB before D2 |
| **E** Openings (windows/doors) | Opus 5.5 · high | 2 → 3 | `src/components/3d/WallOpening.tsx`, `WallOpenings.tsx`, `PlacementMarkers.tsx`, `src/stores/useOpeningsStore.ts`, `src/components/configurator/steps/ClosingsStep.tsx` | A merged; E6+ need D1 merged |
| **F** UI, state & pricing | Sonnet 5.5 · medium | 2 → 4 | `src/stores/useConfiguratorStore.ts`, `src/components/configurator/**` (except `ClosingsStep.tsx` and `ConfiguratorEngine.tsx`), `src/app/configurator/**`, `src/app/configuration/**`, `src/app/page.tsx`, `src/components/landing/*Section.tsx`, new `src/lib/pricing.ts` | A merged; B5 uses F's `calculatePrice` |

**Why Fable goes to WS-D:** the engine rewrite is the riskiest and hardest piece of the project. It needs
geometric reasoning (frame/rafter/purlin layout), a clean architecture that E and F build on, and visual
judgement of correctness. Everything else is well specified in this file and Opus/Sonnet can execute it reliably.

### Rules for all agents (quality first, then token budget)

1. **One session per workstream, in its own git worktree/branch** (`ws-a-hygiene`, `ws-b-security`, …).
   Don't run one huge session for everything: context bloat lowers quality and costs more.
2. **Read only what you need:** §0, your own section, and your prompt in §10. Locate sections with
   `grep -n "^## " REVIEW_FINDINGS.md` and read them with an offset. The findings already give file:line, so
   **don't re-explore the codebase** and don't spawn Explore/general subagents to "understand the project".
3. **Don't edit files owned by another workstream.** If you need a change there, write it under "Handoffs" in
   your status file.
4. **Status handoff file:** keep `docs/agents/ws-<x>.md` (≤ 40 lines): tasks done, decisions taken, exported
   interfaces (function signatures, file paths), open handoffs. Other agents read these short files
   **instead of** your diffs or transcripts.
5. **Verify with numbers before images.** Prefer unit tests, `tsc`, `lint`, `build`, and the dev-only
   `window.__hallStats` (D10) over screenshots. Take screenshots only at milestones, at scale ≤ 0.6, one per
   check, and never in a polling loop.
6. **Gates for every commit:** `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` (once A8 exists), and
   `pnpm build` before you finish a task group. One task, or a tightly related group, per commit, with an
   imperative message.
7. **3D milestones:** check the **dimension matrix**. Width ∈ {8, 9, 12, 13, 15, 17, 18, 20} × height
   ∈ {3, 4, 5, 6} at length 12, plus length ∈ {12, 18, 48, 102}. Use the D10 URL params, read
   `__hallStats` for each, and screenshot only the 6 most informative combinations.
8. Run `/compact` between phases. If a session passes about 60 % context, write the status file, end the
   session, and continue in a fresh one from the status file.
9. Never push, merge to `main`, or rewrite git history. The user merges branches.

---

## 1. Executive summary

1. **The 3D engine is not parametric.** `Configurator.tsx` (1,459 lines) mutates GLTF meshes by *name* using
   empirically-tuned constants per integer width (8, 9, 10–11, 12, 13–14, 15, 16–17, 18, 19–20) and per height
   (3, 4, 5, else). Any value outside those exact integers — or any change to the Blender file — breaks it.
   It must be replaced with a pure layout function + declarative rendering (WS-D).
2. **The 3D model is ~1.52 M triangles per 6 m bay** and is cloned per bay: a 102 m hall renders
   **~27 M triangles** (×2 with the shadow pass), at 60 fps continuously. ~67 % of the triangles are bolts
   (~24 k triangles *each*). The model needs a rebuild in Blender (WS-C).
3. **Security is critical:** admin login is client-side `admin/admin`; `GET /api/configurations` returns all
   customer records to anyone `[verified]`; `PUT /api/prices` lets anyone change prices; the email route
   injects raw user HTML (WS-B).
4. **Windows/doors (openings) are half-built:** the "hole" is a depth-mask trick that shows the sky instead of
   the interior, IDs collide after reload, door positions break after resize, no overlap/column checks,
   and wall geometry is duplicated with magic numbers (WS-E).
5. **The repo is not reproducible:** a 99 MB GLB committed outside LFS, an 18 MB `.deb`, unused legacy files,
   committed SQLite DB, two lockfiles, a pnpm config that produces a broken install `[verified]`, a TypeScript
   error that fails `tsc` `[verified]`, and no tests (WS-A).

---

## 2. Workstream A — Repo hygiene & build

| ID | Sev | Finding | Fix | Acceptance |
|----|-----|---------|-----|------------|
| A1 | Critical | `pnpm install` produces a broken app `[verified]`: `pnpm-workspace.yaml` lists `better-sqlite3`, `prisma`, `@prisma/engines`, `sharp` under `ignoredBuiltDependencies`, so the native SQLite binary is never built. The generated Prisma client also requires `@prisma/client-runtime-utils`, which pnpm doesn't hoist → `/configurator` throws "Module not found". | Pick **one** package manager (recommend pnpm). Delete `package-lock.json`. Replace `ignoredBuiltDependencies` with `onlyBuiltDependencies: [better-sqlite3, prisma, @prisma/engines, sharp]`. Add `@prisma/client-runtime-utils` as a direct dependency (or set `publicHoistPattern`). Add `"postinstall": "prisma generate"`. Add `"engines": {"node": ">=20 <27"}` and `packageManager`. | Fresh clone → `pnpm install && pnpm dev` → `/configurator` and `/api/prices` both return 200 with no manual steps. |
| A2 | Critical | `pnpm exec tsc --noEmit` fails `[verified]`: `useOpeningsStore.ts:43-44` declares `setHoveredWallId` twice. | Remove the duplicate line. **Coordinate:** this file belongs to WS-E; the one-line fix is allowed here because it blocks the build. | `tsc --noEmit` exits 0. |
| A3 | Required | `public/models/da.glb` (**99 MB**) is committed as a normal git blob (`.gitattributes` only covers `*.gltf`). `da.gltf` is an LFS pointer to a 132 MB file. Neither file is used at runtime: only `da-draco.glb` is loaded. | Remove `da.glb`, `da.gltf`, `da-transformed.glb` and `public/models/Da.jsx` from the repo. Store the `.blend` source in LFS or outside git. Extend `.gitattributes` to `*.glb *.blend *.gltf`. Optionally purge history with `git filter-repo` (coordinate with the repo owner; it rewrites history). | `du -sh .git` shrinks; app still loads. |
| A4 | Required | Junk at the repo root: `cloudflared.deb` (18 MB); `industrial-configurator/untitled:plan-roofHierarchyFix.prompt.md` (the colon in the filename breaks checkouts on Windows); `next.config.ts` hardcodes an ngrok host in `allowedDevOrigins`. | Delete the `.deb` and the `untitled:` file. Read `allowedDevOrigins` from an env var. | `git ls-files` contains no binaries outside `public/` textures/models. |
| A5 | Required | `pnpm lint` reports 823 problems because ESLint lints `src/generated/prisma/**` `[verified]`. App code has about 30 real issues, including a `react-hooks/refs` **error** at `Configurator.tsx:1400`, `no-require-imports` at `ConfiguratorLayout.tsx:53`, 7× `any`, and 20 unused variables. | Add `src/generated/**` to the ESLint ignores. Move the Prisma output to `node_modules/.prisma` or keep it gitignored (it already is). Fix the remaining lint issues inside each owning workstream. | `pnpm lint` reports only app-code issues; each WS reaches zero errors in its files. |
| A6 | Required | `prisma/dev.db` is committed (4 test rows, no personal data `[verified]`). There is no `prisma/migrations`. `.env.example` says PostgreSQL but the code uses SQLite. `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`NEXTAUTH_*` are documented but unused. | gitignore `*.db`. Run `prisma migrate dev --name init` to create migrations. Add `prisma/seed.ts` for default prices (move `DEFAULT_PRICES` there; see F6). Rewrite `.env.example` for SQLite: `DATABASE_URL="file:./prisma/dev.db"`. | A fresh clone creates its DB via `pnpm prisma migrate dev` plus the seed. |
| A7 | Required | Dead code: `src/components/3d/configurator.js` (900-line legacy vanilla three.js whose `jsm/...` imports don't resolve), `src/components/3d/Da.jsx` (gltfjsx output for the unusable merged model), the default Next SVGs in `public/` (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`), and `public/photos/image.png` if unused. | Delete them after confirming with `grep` that nothing references them. | No unreferenced files under `src/` or `public/`. |
| A8 | Required | No tests exist at all. | Add Vitest. Wire `pnpm test` into CI (GitHub Actions: install, tsc, lint, test, build). Each WS adds tests for its own logic: D1 layout, F pricing, B validation. | CI is green on every PR. |
| A9 | Optional | `README.md` is the create-next-app template. | Replace it with the real setup steps, architecture overview, and env vars (merge in the useful parts of `implementation.md`). | — |

---

## 3. Workstream B — Security & API

| ID | Sev | Finding | Fix | Acceptance |
|----|-----|---------|-----|------------|
| B1 | **Critical** | Admin "auth" is client-side: `src/app/admin/page.tsx:34` checks `username === 'admin' && password === 'admin'` in the browser. Anyone can open devtools and set the state, or simply call the APIs directly. `next-auth@5` is installed but unused. | Implement real auth: NextAuth Credentials provider (or a signed httpOnly session cookie) checking `ADMIN_USERNAME` / a bcrypt `ADMIN_PASSWORD_HASH` from env. Protect `/admin` with `src/middleware.ts`. | `/admin` redirects to login when there's no session; the password appears nowhere in the client bundle. |
| B2 | **Critical** | `GET /api/configurations` (`src/app/api/configurations/route.ts:34`) returns **every** configuration, including `userName`, `userEmail` and `userPhone`, with no auth `[verified via curl]`. This is a GDPR exposure as soon as real leads arrive. | Require an admin session. Add pagination (`take`/`cursor`) because the list is currently unbounded. | Unauthenticated request returns 401. |
| B3 | **Critical** | `PUT /api/prices` (`src/app/api/prices/route.ts:36`) has no auth and no validation. Anyone can set prices to 0, negative values or strings, and every visitor's quote changes. | Require an admin session. Validate with zod (`z.number().nonnegative().finite()` per field). | Unauthenticated → 401; invalid body → 400. |
| B4 | **Critical** | `POST /api/send-email` (`src/app/api/send-email/route.ts:13-32`) interpolates `name`, `email`, `phone`, `message` and `configurationLink` **raw into HTML** (HTML injection / phishing links inside the company's own inbox). No validation, no rate limit, and the subject is attacker-controlled. | Validate with zod (email format, max lengths). HTML-escape every field. Only accept `configurationLink` matching `${origin}/configuration/<nanoid>` (or build it server-side from a token). Add per-IP rate limiting and a honeypot field. Strip CR/LF from the subject. | Fuzz test: `<script>` in the name is rendered escaped; a foreign link is rejected. |
| B5 | Required | Prices are computed on the client and trusted: `estimatedPrice` from the client is stored in `Configuration.data` and emailed as the quote. | Recompute the price server-side from validated dimensions and options plus the DB prices, using the shared pure `calculatePrice()` (see F6), when saving or emailing. | A tampered client price is ignored. |
| B6 | Required | `POST /api/configurations` stores arbitrary JSON (`data ?? {}`) with no schema or size limit (spam/DoS on SQLite). | Write a zod schema for the configuration (dimensions within allowed ranges, booleans, `openingsList` max 200 items with a valid shape). Cap the body size. | Invalid payload → 400. |
| B7 | Optional | The admin page loads the configurations list and prices from the same public endpoints. | After B1–B3, move admin reads to `/api/admin/*` or server components. | — |

---

## 4. Workstream C — 3D model (Blender) & asset pipeline

### 4.1 What the model is today `[verified by parsing the GLB]`

| File | Size | Nodes/meshes | Triangles | Notes |
|------|------|--------------|-----------|-------|
| `da.glb` | 99 MB | 190 / 190 | 1.61 M | Raw export, unused at runtime |
| `da-draco.glb` | 6.3 MB | 190 / 190 | **1.52 M** | **The only file used** (configurator and landing page) |
| `da-transformed.glb` | 4.1 MB | 1 / 1 | 1.52 M | `gltfjsx --transform` **merged everything into one mesh**, so all node names are lost and the engine can't use it |

The model has 1 material (`Material_0`, plain, no textures) and 0 images.

**Where the triangles go (per bay):**

| Family | Triangles | Share |
|--------|-----------|-------|
| `surub*` (bolts) | 828,844 | 55 % |
| `surub_sus*` (top bolts) | 193,191 | 13 % |
| `suruburi_grinzi*` | 86,080 | 6 % |
| `suruburi_perete*` | 43,040 | 3 % |
| `PereteFata` / `PereteSpate` (end walls) | 113,146 each | 15 % |
| `PereteDR` vs `PereteSTG` | 38,482 vs 18,666 | asymmetric; leftover modifier? |
| Roof, gutters, everything else | ~80 k | 5 % |

Each bolt is **about 24,000 triangles**; a bolt should be 50–300.

**Runtime impact:** the engine deep-clones the whole model once per 6 m bay (`Configurator.tsx:645-650`,
`783-787`). For length L the frame count is `floor(L/6)+1`:

| Length | Frames | Triangles drawn | Draw calls (approx.) |
|--------|--------|-----------------|----------------------|
| 12 m | 3 | ~4.6 M | ~570 |
| 48 m | 9 | ~13.7 M | ~1,700 |
| 102 m | 18 | **~27 M** | ~3,400 |

Every mesh has `castShadow = true`, so the shadow pass draws it all a second time. `frameloop="always"`
(`ConfiguratorEngine.tsx:30`) means this happens 60 times per second even when nothing moves.
After a reload the loader screen sat at "0%" for about 20–30 s before the scene appeared `[verified]`.

### 4.2 Blender working method (token-friendly, reproducible)

Use **two channels**:

| Channel | Use it for | Why |
|---------|-----------|-----|
| **Headless Blender scripts** (`/Applications/Blender.app/Contents/MacOS/Blender -b <file> -P scripts/blender/<step>.py`) | All bulk work: importing, inventory, decimating or replacing bolts, rebuilding the kit, applying transforms, renaming, exporting. | Deterministic, committed and re-runnable. A whole step costs one Bash call, and the scripts print **compact JSON stats** instead of dumping the scene. Verified working: Blender 5.2.0 imports `da.glb` headless with 193 objects and 1,610,612 triangles. |
| **Blender MCP** (official Blender Lab server, live Blender GUI) | Visual review only: `get_screenshot_of_area_as_image` on the 3D viewport, or `render_viewport_to_path` and then viewing the PNG at reduced size, after each milestone. Also `get_object_detail_summary` on 1–2 objects, and small interactive tweaks that need an eye. | Screenshots are expensive. Use them only to judge shape and proportion, never for counting. |

Blender MCP rules (official Blender Lab MCP, tools prefixed `mcp__blender__`):
- Never call `get_objects_summary` or `get_blendfile_summary_*` on the full scene (190+ objects is a huge
  output). Use `execute_blender_code` with code that sets `result = {...}` to a ≤ 30-line summary.
- Use `search_api_docs` / `get_python_api_docs` for Blender 5.2 API questions instead of guessing.
- Any change made through MCP must be copied into a `scripts/blender/*.py` file, so the pipeline can always be
  re-run from the source file without the GUI.

**One-time setup (human):** the Blender side is the official **Blender Lab "MCP" extension** (already
installed, listening on `localhost:9876`). The Claude side is the server from the same project, cloned at
`~/Tools/blender_mcp` (from projects.blender.org/lab/blender_mcp). Do **not** use the community
`uvx blender-mcp` (ahujasid). It uses a different protocol and times out against this add-on.

```bash
cd ~/Tools/blender_mcp/mcp && uv sync
```

```bash
claude mcp remove blender -s user; claude mcp remove blender; claude mcp add -s user blender -- uv --directory "$HOME/Tools/blender_mcp/mcp" run blender-mcp
```

Then `claude mcp list` should show `blender … ✔ Connected`. Open a new Claude session after that.
If you have the **original `.blend`** for the hall, put it in `~/CarStar-assets/`; otherwise the agent starts
from `da.glb` (task C0).

### 4.3 Tasks

| ID | Sev | Task | Acceptance |
|----|-----|------|------------|
| C0 | Required | **Baseline.** Write `scripts/blender/00_import_inventory.py`: import the source (`.blend` if provided, else `public/models/da.glb`) and save `assets/blender/hala_import.blend`. Write `assets/blender/inventory.json` with name, parent, triangle count, bbox, origin and dimensions per object, plus a family summary. Print only the family summary. | The inventory matches §4.1 (±1 %). |
| C4a | Required | **Draft `ASSET_CONTRACT.md` before modelling** (moved up from C4). Write it as soon as the inventory exists so WS-D can review it early. | Sent to WS-D through `docs/agents/ws-c.md`. |
| C1 | **Critical** | **Rebuild bolts:** in Blender, replace every bolt with one low-poly bolt mesh (≤ 200 triangles; a hex head plus a cylinder is enough). Bolts are sub-pixel beyond about 10 m, so ideally export **one** `Bolt` mesh and place it with `InstancedMesh` in code (positions exported as empties or computed). | Bolt family under 20 k triangles per bay in total (from about 1.15 M). |
| C2 | **Critical** | **Remove walls, roof and foundation from the frame asset.** End walls are 113 k triangles each because the corrugation is modelled as geometry. Corrugation should come from the existing `public/wall/*` normal map on a flat box. Walls, roof panels and the concrete slab are simple boxes or extrusions whose size depends on L/W/H: generate them procedurally in code (WS-D). This also removes the need for clipping planes. | The frame asset contains only steel: columns, rafters, purlins, haunches, gutters/downpipes optional. |
| C3 | Required | **Model a parametric kit, not a finished hall.** Export separate, named, origin-correct pieces: `Column` (origin at base centre, 1 m tall, scaled along Y), `Rafter` (origin at the eave joint, 1 m long along +X), `Purlin` (`grinda`, 1 m along Z), `BasePlate`, `HaunchBracket`, `Gutter` (1 m), `Downpipe` (1 m), `Bolt`. Apply all transforms/modifiers before export. | Every piece has scale 1 and rotation 0 and its origin at the documented anchor. |
| C4 | Required | **Naming and hierarchy contract.** Fix inconsistent names (`aripioarea_sustinere` vs `aripioara_*`, the `surub001…035` implicit ordering, Romanian/English mix). Write `public/models/ASSET_CONTRACT.md` listing every node name, its origin, its axis, and its unit length. WS-D codes against this file, not against guesses. | WS-D signs off on the contract. |
| C5 | Required | **Materials:** at least `Steel` (metallic, uses `public/metal/*`), `Panel` (uses `public/wall/*`), `Concrete` (uses `public/concrete/*`). Right now the code overrides materials by mesh name. | The engine no longer creates materials by name. |
| C6 | Required | **Export pipeline script** `scripts/optimize-model.mjs` using `@gltf-transform/cli`/`core`: `dedup → weld → simplify (bolts) → quantize → meshopt` (meshopt decodes faster than Draco and doesn't need a WASM decoder download). **Do not** use `gltfjsx --transform`, which flattens the hierarchy. Commit only the optimized output. | Shipping GLB ≤ 1 MB, ≤ 60 k triangles for one complete frame. |
| C7 | Optional | LOD: a bolt-less variant for frames more than about 20 m from the camera (drei `<Detailed>`). | — |
| C8 | Optional | Bake ambient occlusion into a light texture for the steel to replace expensive real-time shadows on low-tier devices. | — |

**Expected result:** about 1.52 M → about 40–60 k triangles per bay (25–40× fewer), and a 102 m hall under
1 M triangles in total. Combined with instancing (D5), draw calls go from thousands to tens.

---

## 5. Workstream D — Configurator engine rewrite

### 5.1 Why the current engine breaks `[code]`

All references are to `src/components/3d/Configurator.tsx` unless stated otherwise.

| ID | Sev | Problem | Where |
|----|-----|---------|-------|
| D-a | Critical | **Width logic is a lookup table of hand-tuned integer cases.** Purlin positions use different formulas for `[8,9,10,11]` (with special factors for 9: `-0.09, -0.0295, -0.026`, and for 8: `0.26, 0.0627, 0.0658`), for 13–14, for 16–17 and for 19–20. They reset to the initial position at exactly 12/15/18, and purlins are added or removed at thresholds 9, 15 and 18. A width such as 12.5, 21 or 7, or any change to the model, falls through every branch and leaves purlins at stale positions. | 806–1049 |
| D-b | Critical | **Column pull factors are empirical** (`0.484` when widening, `0.487` and `×0.987` when narrowing), and the same formula is copy-pasted in three places: lines 811–819 and 1157–1162, plus `PlacementMarkers.tsx:36-39`. | — |
| D-c | Critical | **Height logic is path-dependent and only handles 3/4/5.** `fourmeters_lower` is shifted by ±0.3 depending on a mutable `ok` flag, so jumping 3→5 directly gives a different result from 3→4→5. Height 6 falls into the `else` branch. An inverse-scale hack on the children of the scaled `stalp_1`/`stalp_2` adds `TWEAK_LATERAL_Y = 0.03` on init (612) but not on later updates (694), so the result differs after the first slider move. | 596–744 |
| D-d | Critical | **Length is quantised silently.** Frames = `floor(L/6)+1`. The number input accepts any integer from 12 to 102 (`DimensionsStep.tsx:46-53`; only the slider has `step=6`), so L=17 renders 12 m of steel while the price, dimension lines and openings use 17 m. | 776 |
| D-e | Required | **Magic offsets everywhere:** `DeltaX=1.5363`, `DeltaY=0.27089`, `maxrise=0.696`, `minrise=-0.335`, `roofBaseY = y - 3` (590), `cornerLiftOffset` 0.4 in one place (323) and 0.23 in another (1170), `baseRise=1.285`, `extraWidth=0.41`, `extraHeight=0.255`, roof `scaleX*1.01` for the DR side only (1089). The insulation gap axis is guessed: see the comment "change 'x' to 'y' or 'z'" at 1362. | many |
| D-f | Required | **Name-string coupling:** about 60 hardcoded mesh names (`suruburi_laterale005…017`, `stalp_sus_1`, …) decide behaviour. Renaming anything in Blender breaks the engine silently. | 411–563 |
| D-g | Required | **Walls via clipping planes:** end walls are full-size meshes cut by 4 world-space planes computed from duplicated empirical formulas. Side walls get a separate plane. Each frame clones materials (`material.clone()`) and sets `needsUpdate = true` on **every slider change** (338, 347, 1233, 1240), which forces shader recompiles and causes visible stutter. | 318–362, 1151–1277 |
| D-h | Required | **O(frames × meshes²) sync on every slider change:** each clone traverses its meshes and calls `baseModel.getObjectByName(name)` (a full tree walk) for each one. At 18 frames × ~200 meshes × ~200 that is about 720 k name comparisons per tick. | 747–765, 1123–1141 |
| D-i | Required | **Renders 60 fps forever:** `frameloop="always"`. The shadow camera covers a fixed 200×200 m area (blurry shadows on small halls, under-covered at 102 m). `antialias: false`. There is an empty `<mesh>` with no geometry at `ConfiguratorEngine.tsx:66-67`. | `ConfiguratorEngine.tsx` |
| D-j | Required | **Side effects during render:** texture `wrapS`/`repeat`/`rotation` are mutated in the render body on every render (66–86, 1421–1425). A ref is read in render (`if (!modelsGroup.current) return null`, line 1382; this is the lint error). | — |
| D-k | Required | **Camera reset on every length change** (`updateCamera`, 789) overwrites the user's orbit. | 171–184 |
| D-l | Required | A debug `PlaneHelper` is created and added to the scene on every side-clip update (355–361). Removed frames and cloned materials are never `dispose()`d. | — |
| D-m | Required | **The landing page duplicates the engine:** `LandingScene.tsx` re-implements the visibility rules and name lists, and loads the same 1.5 M-triangle model for a background animation. | `LandingScene.tsx` |

### 5.2 Target architecture

```
src/lib/hall/
  types.ts            HallParams {length,width,height,bay?,foundation,panels,insulationMm}
  constants.ts        documented engineering constants (roof pitch, max purlin spacing, max bay, column size…)
  computeHallLayout.ts  PURE: HallParams -> HallLayout
                        { frames:[{z}], columns:[{x,z,height}], rafters:[{from,to}], purlins:[{x,y,zFrom,zTo}],
                          eaveY, ridgeY, walls:{front,back,left,right: {origin,axisH,spanH,spanV,polygon}},
                          roof:{left,right}, slab:{w,l} }
  computeHallLayout.test.ts
src/components/3d/hall/
  Hall.tsx            reads layout, renders sub-components declaratively
  Columns.tsx, Rafters.tsx, Purlins.tsx, Bolts.tsx  -> <Instances>/InstancedMesh from the kit GLB
  Walls.tsx, Roof.tsx, Slab.tsx  -> procedural geometry sized from layout (gable = ShapeGeometry polygon; no clipping)
```

**Design rules:**
- Bay count: `n = ceil(L / maxBay)` and `bay = L / n`, so any length works and is never truncated
  (or snap the input to multiples of 6 if that's a business rule; decide in F2).
- Purlin count: `ceil(rafterLength / maxPurlinSpacing) + 1`, evenly spaced along the rafter. Positions come
  from geometry, not from width-specific tables.
- Ridge height = `eaveY + (W/2)·tan(pitch)`; the rafter angle comes from the same values.
- Everything is derived from `computeHallLayout`. Openings (WS-E), dimension lines and pricing (F) consume the
  **same** layout, so there are no duplicated formulas.
- Rendering is declarative R3F, so no `useLayoutEffect` mutation chains. `useMemo` is keyed on params.

### 5.3 Tasks

| ID | Sev | Task | Acceptance |
|----|-----|------|------------|
| D1 | Critical | Implement `computeHallLayout` plus unit tests. Use today's integer-width screenshots as the visual reference, but derive the values from geometry. Test: no NaN; purlins strictly inside the rafter span; eave < ridge; frame z-positions cover exactly [0, −L]; works for W=8…20 step 0.5, H=3…6 step 0.5, L=12…102. | ≥ 30 table-driven tests pass. **Can start now** with placeholder assets. |
| D2 | Critical | Replace `ConfiguratorScene` with `Hall.tsx` built on D1 and the C3/C4 kit. Delete the name tables, `ok` flag, `prev*` refs, clipping planes and sync loops. | Dimension matrix screenshots look correct for **non-integer** values too; `Configurator.tsx` < 300 lines or deleted. |
| D3 | Required | Procedural walls, roof and slab (C2): side walls as boxes, end walls as an extruded pentagon (gable). Insulation thickness = real box thickness. Hide-walls toggle = `visible` prop. | No `clippingPlanes` left in the codebase. |
| D4 | Required | Render loop: `frameloop="demand"` plus `invalidate()` on changes (OrbitControls already invalidates). Fit the shadow camera to the hall bounds. Only steel casts shadows; walls and slab receive them. Enable AA on high tiers (via `hardwareTier`). | GPU idle when not interacting (check with the Performance panel). |
| D5 | Required | Instancing: columns, purlins and bolts via `<Instances>`/`InstancedMesh`. | Under 50 draw calls at L=102 (check `gl.info.render.calls`). |
| D6 | Required | Move texture setup into `useMemo`/`useEffect` (or the `useTexture` callback). Dispose geometries and materials on unmount. | No `react-hooks` lint errors in `src/components/3d/**`. |
| D7 | Required | Camera: frame the hall only on first load and on "Reconfigurează"; don't reset on every length change. Make the orbit target follow the hall centre smoothly. | — |
| D8 | Required | Landing page: reuse `Hall.tsx` with fixed params (or a pre-baked low-poly GLB) instead of the duplicated name logic. | `LandingScene.tsx` contains no mesh-name strings. |
| D9 | Optional | `DimensionLines.tsx`: read eave/ridge/span from the layout (show ridge height as well). | — |
| D10 | Required | **Cheap verification hooks (dev only).** URL params `/configurator?w=13.5&h=4&l=30&step=1` set the dimensions directly. `window.__hallStats = {triangles, drawCalls, frames, purlinsPerSide, eaveY, ridgeY, ready}` is updated after each render via `gl.info`. Both are guarded by `process.env.NODE_ENV !== 'production'`. **Do this first in D2**: every agent uses it to check 3D work with numbers instead of screenshots. | Reading `__hallStats` from the browser returns correct values; nothing is exposed in a production build. |

---

## 6. Workstream E — Openings (windows, doors, industrial doors)

Current state: placing works only roughly. You pick a tool, hover a wall, and click one of the "+" markers
(`<Html>` DOM elements) spaced 2 m apart at mid-height. The opening is a coloured plane in front of the wall.

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| E1 | **Critical** | **Duplicate IDs after reload.** `_nextId` is module state (`useOpeningsStore.ts:57`) that resets to 1 on reload while the persisted openings keep `opening-1…n`, so new openings collide. Deleting one then removes several, and React reports duplicate keys. `setOpenings` parses the prefix `'op-'` (line 128) but IDs are `'opening-N'`, so restoring from a shared link doesn't advance the counter either. | Use `nanoid()` / `crypto.randomUUID()` for IDs and delete `_nextId`. |
| E2 | Critical | **The "hole" is fake.** `WallOpening.tsx:347-354` draws a depth-only plane that makes everything behind it fail the depth test, including the hall interior and floor. Windows (35 % opacity) therefore show the canvas clear colour or sky instead of the inside of the hall. | With procedural walls (D3), cut real holes: build the wall `Shape` with `holes` from the openings on that wall (`ShapeGeometry`/`ExtrudeGeometry`). Until then, at least remove the depth mask for windows. |
| E3 | Critical | **GPU memory leak while dragging.** `<edgesGeometry args={[new THREE.PlaneGeometry(...)]}>` (374) and `new Float32Array(...)` inside `bufferAttribute` (391) create new GPU buffers on **every render**, and dragging re-renders on every pointer move. | Memoise geometries on `[width, height]`, or use drei `<Edges>` / `<Line>`. |
| E4 | Required | **Doors leave the ground after a resize.** Changing height (`ClosingsStep.tsx` inputs, or the resize handles in `WallOpening.tsx:255-268`) keeps the normalised `posY`, so a door no longer sits on the floor. Width/height changes don't re-clamp `posX`, so openings can stick out past the wall edge. The inputs allow width up to 20 m and height up to 10 m, regardless of the wall size. | Store positions in **metres** (`offsetX` from the wall start, `sill` height) instead of normalised values. Put one `clampOpening(opening, wall)` function in the store, used by add, update, drag and resize. Doors: `sill = 0` always. |
| E5 | Required | Resizing is symmetric around the centre (the group is centred), so dragging the right handle also grows the left side. | Anchor resizing to the opposite edge: adjust `offsetX` together with width. |
| E6 | Required | **Wall geometry is duplicated with magic numbers:** `PlacementMarkers.tsx:28-93` re-implements `pullMain` (0.484/0.487), `SIDE_WALL_OFFSET = 0.44` and `FRONT_BACK_WALL_OFFSET = 0.048`. Side walls are assumed to span `L`, but the rendered steel spans `floor(L/6)·6`. End walls use `spanV = h`, ignoring the gable, so nothing can be placed in the gable. | Consume `layout.walls` from D1 (needs D1). |
| E7 | Required | No validation: openings can overlap each other, cross a column or frame line (every bay), or block a downpipe. | Add `validateOpenings(layout, openings)` that returns conflicts. Show conflicts in red in 3D and in the list, and block "Continuă" while any exist. |
| E8 | Required | Openings aren't revalidated when the hall changes. After shrinking width, height or length, the stored openings can exceed or overlap walls. | Re-clamp on layout change and flag what can't be fixed. |
| E9 | Required | Openings render in step 1 while the walls are hidden, so they float in the air (`ConfiguratorEngine.tsx:95` always mounts `<WallOpenings>`). | Render only when walls are visible (coordinate with WS-D, which owns that file). |
| E10 | Required | The drag `onPointerMove` handler is attached only to the opening mesh, so fast drags that leave the mesh stop updating. `setPointerCapture` is called on `e.target as HTMLElement`. | Use R3F `e.target.setPointerCapture(e.pointerId)` correctly, or listen on `gl.domElement` while dragging. |
| E11 | Required | Placement UX: you have to hover a wall, then aim at fixed "+" DOM markers. | Click anywhere on a wall to place at the hit point (snapped to a 0.1 m grid and clamped). Show a ghost preview of the opening before clicking. Keep the markers only as a hint. |
| E12 | Optional | Industrial door divider lines and the frame look flat. Add proper door and window models (from the C kit) later. | — |
| E13 | Optional | Price ignores opening size (a 1×1 m window costs the same as a 3×2 m window). Decide the pricing rule with F6. | — |

---

## 7. Workstream F — UI, state & pricing

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| F1 | Critical | **Number inputs clamp on every keystroke** (`DimensionsStep.tsx:19-24`): typing "15" in width gives "1" → clamped to 8 → "85" → clamped to 20, so you can't type a value. | Keep a local string state, validate and clamp on blur/Enter, show an inline error for out-of-range values. |
| F2 | Critical | Length accepts any integer, but the engine only renders multiples of 6 (D-d). | Business decision: either snap the input to the bay grid, or support any length (D1 makes this possible). Make the slider and the input consistent either way. |
| F3 | Required | `setStep`/`nextStep`/`prevStep` force `wallsVisible = step !== 1` (`useConfiguratorStore.ts:66-82`), which overrides the user's toggle. `ConfiguratorEngine.tsx:22` also forces walls on in step 2. Two sources of truth. | Make `wallsVisible` a derived value: `step === 1 ? userToggle : true`. |
| F4 | Required | `persist` stores **everything**, including `prices` and `currentStep` (`useConfiguratorStore.ts:61-173`), so stale prices flash until the API responds. | `partialize` to dimensions and options only, plus `version` + `migrate`. |
| F5 | Required | Shared-link restore (`src/app/configuration/[token]/page.tsx:37-53`) merges into whatever is already persisted. It doesn't reset `isIsolated` when insulation is 0, or the openings when the list is missing, and it does no shape validation. | Call `resetConfigurator()` and `resetOpenings()` first, then apply the validated data (reuse the B6 zod schema). |
| F6 | Required | Pricing lives inside the store and is duplicated across `ConfiguratorLayout.tsx:53-58`, `SummaryStep.tsx:19-24` and `ClosingsStep.tsx`. The model: price by volume (`L·W·H·€/m³`), sandwich panels by wall area only (no roof, no gables), insulation thickness ignored, opening size ignored. | Extract a pure `calculatePrice(params, openings, prices)` into `src/lib/pricing.ts` with unit tests, used by both client and server (B5). Confirm the pricing rules with the business (roof area, gable area, insulation thickness tiers, opening size). |
| F7 | Required | `ConfiguratorLayout.tsx:53` calls `require('@/stores/useOpeningsStore')` inside the component (a hook via require), with `any` types. It subscribes to the whole store. | Use a normal import and a selector with `useShallow`. |
| F8 | Required | `useConfiguratorStore()` is called without selectors in most components, so every store change re-renders the whole layout and every step, including on each slider tick. | Use selectors (`useConfiguratorStore(s => s.width)`) or `useShallow`. |
| F9 | Required | The loader (`src/app/configurator/page.tsx:8-32`) shows "0%" for 20–30 s on reload `[verified]` because `useProgress` doesn't count the Draco decode and scene build. `if (!active && progress === 100)` can also stay stuck when everything comes from cache. | Hide the loader when the hall reports "ready" through a store flag, instead of relying on `useProgress` alone. This mostly disappears after C1/C2. |
| F10 | Required | The whole layout renders an empty div until mounted (`ConfiguratorLayout.tsx:16-21`, 75-78) to avoid persist hydration mismatches. | Use Zustand's `skipHydration` + `rehydrate()` in an effect, or a `useHasHydrated` hook, so the shell renders on the server. |
| F11 | Optional | Mixed Romanian/English and repeated wall-name mapping (`replace('PereteFata','Față')…`) in several places. | Centralise labels in `src/lib/i18n/ro.ts`. |
| F12 | Optional | The mobile bottom sheet has a fixed `bottom-[70px]` / `h-[60vh]` and the canvas sits under it. Check on a 375×812 viewport. | — |
| F13 | Nit | `getNumberOfBays` (`floor(L/6)`) disagrees with the engine's frame count. Use the layout. | — |

---

## 8. Execution waves

You (the human) merge each branch into `main` at the gates below. Agents never merge.

```
Wave 1 (start now, parallel)
  A  Sonnet  A1-A8 (install fix, tsc, lint ignore, LFS/cleanup, prisma migrations+seed, dead code, Vitest+CI)
  C  Opus    C0, C4a (contract draft), then C1-C3, C5, C6 in Blender      <- runs through waves 1-3
  GATE 1: merge ws-a  (fresh clone installs and builds green)

Wave 2 (after GATE 1, parallel)
  B  Opus    B1-B4, B6 (B5 after F6 lands)
  D  Fable   D1 (pure layout + tests) -> D10 -> D2..D7 once C's kit GLB exists
  E  Opus    part 1: E1, E3, E4, E5, E10   (no dependency on D)
  F  Sonnet  part 1: F1, F2 (decision noted), F6 calculatePrice, F7, F8
  GATE 2: merge ws-b, ws-f part 1, ws-e part 1, then ws-d once D1+D10 are in (layout + hooks)

Wave 3 (after GATE 2)
  D  Fable   continues D2-D8 on the new kit
  E  Opus    part 2: E2, E6, E7, E8, E9 (handoff to D), E11
  B  Opus    B5 (server-side price using F6)
  GATE 3: merge ws-c, ws-d, ws-e, ws-b

Wave 4
  F  Sonnet  part 2: F3, F4, F5, F9, F10, F11-F13
  QA Opus    integration check against §9 (prompt Q in §10)
```

## 9. Definition of done (whole project)

- [ ] Fresh clone → `pnpm install && pnpm prisma migrate dev && pnpm dev` works with no manual steps.
- [ ] `tsc`, `lint`, `test` and `build` are green in CI.
- [ ] Any width 8–20, height 3–6 and length 12–102 (including non-integers, if allowed) renders a correct hall: no floating purlins, no gaps between walls and roof.
- [ ] L = 102 m: under 1 M triangles, under 50 draw calls, GPU idle when untouched, interactive in under 3 s on a mid-range laptop.
- [ ] Windows and doors: place, drag and resize within the wall; doors stay on the ground; no overlaps or column clashes; real holes; survive reload and shared links.
- [ ] Admin and APIs are protected and validated; the email is escaped and rate-limited; the price is recomputed on the server.
- [ ] The repo has no binaries over 5 MB outside LFS, no dead files, and an accurate README.

---

### Notes from the review session

- To run the app locally during this review I added `.claude/launch.json` at the repo root and manually built
  `better-sqlite3` plus symlinked `@prisma/client-runtime-utils` inside `node_modules` (not committed). A1 makes
  this unnecessary.
- The model statistics come from parsing the GLB JSON chunk directly; the per-family triangle counts are exact.
- The visual checks were limited to a few dimension combinations. The width/height breakage is established from
  the code paths (D-a to D-d); agents should capture the full dimension matrix before and after D2.

---

## 10. Launch prompts

### 10.1 How to launch an agent

Prerequisite: `REVIEW_FINDINGS.md` must be **committed on `main`**. Worktrees only see committed files.

For each agent, either:
- **Desktop app:** start a new Code session on this repo with "worktree" enabled, pick the model from the
  table, and paste the prompt.
- **CLI:**

```bash
git worktree add ../CarStar-ws-a -b ws-a-hygiene main
```

```bash
cd ../CarStar-ws-a && claude --model sonnet
```

Use `--model opus` for B/C/E/QA and `--model claude-fable-5-2` for D. Set the effort level from the table in §0.
Agent C must run on **this Mac**, with Blender open and the BlenderMCP addon connected (§4.2 setup).

Every prompt below starts with the same shared preamble. Paste the preamble, then the agent's own block.

### 10.2 Shared preamble (paste first in every agent)

```text
You are one of several Claude agents repairing the CarStar industrial-hall configurator
(Next.js 16 + React Three Fiber, in industrial-configurator/). The full review is in
REVIEW_FINDINGS.md at the repo root.

Token discipline (quality comes first, but don't waste context):
- Read ONLY: §0 (rules + ownership table), your own section, and docs/agents/*.md status files of
  workstreams you depend on. Find sections with: grep -n "^## " REVIEW_FINDINGS.md, then Read with offset/limit.
- The findings already give file:line. Don't re-explore the codebase and don't spawn Explore/general
  subagents. Open only the files your tasks touch.
- Verify with tests/tsc/lint/build and numbers first; take screenshots only at milestones (scale <= 0.6).
- Keep docs/agents/ws-<your letter>.md (<= 40 lines): done tasks, decisions, exported interfaces, handoffs.
  Update it at every commit. It is how other agents learn what you did.

Rules: edit only the paths your workstream owns (§0 table). Commit each task or tight group of tasks on your
branch, with an imperative message. Run pnpm exec tsc --noEmit, pnpm lint, pnpm test (if present) and
pnpm build before declaring a group done. Never push, never merge to main, never rewrite history, never
delete data without asking me. If a task needs a business decision, write the options in your status file,
pick the most conservative default, and continue.
When you finish your wave's tasks, stop and report in 10 lines max: done / not done / handoffs.
```

### 10.3 Agent A — Repo hygiene & build (Sonnet 5.5, medium, wave 1)

```text
You are Agent A (workstream A, §2). Branch: ws-a-hygiene.
Do A1-A8 in this order: A1, A2, A5, A6, A7, A4, A3, A8. Then A9 if there is time.
Specifics:
- A1: after your changes, prove a clean install works: delete node_modules, run pnpm install,
  pnpm prisma generate, then pnpm build. Report the exact commands in README (A9).
- A3: remove the unused model files from the working tree only. Do NOT run git filter-repo; write the
  history-purge command in your status file for me to run later.
- A8: set up Vitest (one sample test) and .github/workflows/ci.yml (install, tsc, lint, test, build).
  Other agents will add tests; keep the config minimal.
- A2 touches src/stores/useOpeningsStore.ts (owned by E). Only delete the duplicate line.
Done when a fresh `pnpm install && pnpm build` works with zero manual steps and `pnpm lint` ignores generated code.
```

### 10.4 Agent C — Blender model & asset pipeline (Opus 5.5, high, waves 1-3)

```text
You are Agent C (workstream C, §4). Branch: ws-c-assets. Read §4 fully (4.1-4.3) and §5.2 (the target
architecture your assets must serve).
Method (§4.2): do all bulk work as headless Blender scripts in scripts/blender/NN_name.py, run with
/Applications/Blender.app/Contents/MacOS/Blender -b <in.blend> -P <script> -- <args>, each printing a compact
JSON summary (<= 30 lines). Use the official Blender Lab MCP (mcp__blender__* tools, live GUI) only for
visual review: one get_screenshot_of_area_as_image (3D viewport) or render_viewport_to_path per milestone,
after opening the latest .blend in the GUI via execute_blender_code. Never call get_objects_summary or the
blendfile summaries on the full scene; use execute_blender_code with a compact `result = {...}`. Anything you
change through MCP must be copied back into a script.
Order: C0 inventory -> C4a ASSET_CONTRACT.md draft (signal Agent D in docs/agents/ws-c.md) -> C1 bolts
(one low-poly Bolt, instanced) -> C2 strip walls/roof/slab -> C3 kit pieces with correct origins -> C5
materials -> C6 gltf-transform export script (meshopt; never gltfjsx --transform) -> C7 optional.
Quality bar: the kit must look like the current steel frame from 3 m away (compare screenshots of the original
vs the kit at the same camera), each piece at unit scale with origins exactly as the contract says.
Targets: <= 60k tris per complete frame, shipping GLB <= 1 MB. Keep the old da-draco.glb until Agent D
switches over; ship the new file as public/models/hall-kit.glb.
Large binaries (.blend) go in assets/blender/ and must be covered by Git LFS (.gitattributes is owned by A;
if A hasn't added *.blend yet, note it as a handoff).
```

### 10.5 Agent D — Engine rewrite (Fable 5.2, high, waves 2-3) — the one Fable task

```text
You are Agent D (workstream D, §5): the most critical workstream. Branch: ws-d-engine, based on main after
Gate 1. Read §5 fully, §4.1 (model facts), and docs/agents/ws-c.md + public/models/ASSET_CONTRACT.md if they
exist (Agent C works in parallel; if the contract draft is missing, define the interface you need in your
status file and continue with D1).
Plan:
1. D1: pure computeHallLayout in src/lib/hall/ with >= 30 table-driven Vitest tests. Constants in
   constants.ts, each with a one-line engineering justification. Support W 8-20, H 3-6, L 12-102 including
   non-integers. Bays per §5.2 unless F2 says the business wants a 6 m grid.
   Export the wall descriptors that Agent E needs (origin, axisH, normal, spanH, spanV, gable polygon,
   column/frame x-or-z positions per wall). Document the signatures in docs/agents/ws-d.md.
2. D10 dev verification hooks, then D2-D7 on the new kit (use placeholder boxes until hall-kit.glb exists, so
   you're never blocked). Then D8. D9 optional.
3. Delete the old engine code paths and the clipping planes when the new path is complete.
Verification for each milestone: the dimension matrix from §0 rule 7 via URL params + window.__hallStats
(numbers), then screenshots of only the 6 most informative combinations. Compare against the original
renders for widths 12, 15 and 18 (the "clean" widths that the old engine got right) to confirm the look is
preserved. Targets: L=102 under 1M tris and under 50 draw calls, GPU idle when untouched.
Design priorities: correctness > readability > performance. Keep each file < 300 lines and keep rendering
declarative (no imperative mesh mutation chains). Hall.tsx should read like a description of a hall.
```

### 10.6 Agent B — Security & API (Opus 5.5, high, waves 2-3)

```text
You are Agent B (workstream B, §3). Branch: ws-b-security, based on main after Gate 1.
Do B1, B2, B3, B4, B6 now. Do B5 when docs/agents/ws-f.md says calculatePrice (F6) is merged.
Specifics: NextAuth v5 Credentials (already a dependency) or a signed httpOnly session cookie. Credentials come
from env (ADMIN_USERNAME, ADMIN_PASSWORD_HASH as bcrypt). Protect /admin and /api/admin/* in
src/middleware.ts. Use zod schemas in src/lib/validation/ (export the configuration schema, since Agent F
reuses it for F5). Escape every field interpolated into the email HTML, allow-list configurationLink, add a
simple in-memory per-IP rate limit + honeypot, and add Vitest tests for validation and escaping.
Send me the new env vars to add to .env (handoff to A for .env.example).
Done when unauthenticated requests to the admin data/price endpoints return 401 (prove it with curl in your
report) and the admin UI still works after logging in.
```

### 10.7 Agent E — Openings (Opus 5.5, high, waves 2-3)

```text
You are Agent E (workstream E, §6). Branch: ws-e-openings, based on main after Gate 1.
Part 1 now (no dependency on D): E1, E3, E4, E5, E10. Migrate the persisted store (zustand persist version +
migrate) when you change the Opening shape to metres. Add Vitest tests for clampOpening and the store
actions.
Then STOP and report. Part 2 (E2, E6, E7, E8, E9, E11) starts when I tell you D1 is merged: read
docs/agents/ws-d.md for the wall-descriptor API and consume it instead of PlacementMarkers' own math.
E2 real holes and E9 touch D-owned files (walls, ConfiguratorEngine). Implement hole generation as a pure
function in your own files (e.g. src/components/3d/openings/wallShapeWithHoles.ts) and hand off the
two-line integration to D through your status file.
Verify in the browser at milestones: place a window, a door and an industrial door on each wall; drag; resize;
reload; check that IDs stay unique and doors stay on the ground. Screenshot only the final state.
```

### 10.8 Agent F — UI, state & pricing (Sonnet 5.5, medium, waves 2 and 4)

```text
You are Agent F (workstream F, §7). Branch: ws-f-ui, based on main after Gate 1.
Part 1 now: F1, F2 (write the business question in your status file; default: snap length to the 6 m grid
until D supports free lengths, and keep the slider and the input consistent), F6 (pure calculatePrice in
src/lib/pricing.ts with Vitest tests; keep today's formula as the default and list the open pricing questions
for the business), F7, F8.
Then STOP and report. Part 2 (wave 4): F3, F4, F5 (reuse B's zod schema), F9, F10, F11-F13.
Keep the UI in Romanian and don't change the visual design except where a task requires it.
```

### 10.9 Agent Q — Integration QA (Opus 5.5, high, wave 4)

```text
You are Agent Q, the final integration reviewer. Work on main after all branches are merged; read-only
except for a new file QA_REPORT.md.
Read §9 (Definition of done) and every docs/agents/ws-*.md. For each §9 item, check it with commands, tests
and the dev hooks (window.__hallStats, URL params), and take the minimum number of screenshots needed.
Write QA_REPORT.md: pass/fail per item with evidence, plus regressions found, plus remaining tasks from
REVIEW_FINDINGS.md that are still open, with their IDs. Don't fix anything; report it.
```
