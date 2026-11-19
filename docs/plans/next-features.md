# Plan: next feature round of the configurator engine

Status: **agreed scope, ready for the orchestrator.** Every item here was decided with the product owner; items under
"Not in this round" are explicitly out. Run it the way docs/agents/ORCHESTRATOR.md describes (worktrees, merge into
main, gate after each merge).

Gate (same as CI): `cd industrial-configurator && pnpm install && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`
Lint must stay at 0 errors and 0 warnings. Every track adds tests for its pure logic. UI text is Romanian.

Already on main (PR "fixed views + UI theme"): fixed views 3D/Față/Spate/Stânga/Dreapta/Plan, perspective/orthographic,
axis gizmo, keys 0–5 and P (`lib/hall/cameraViews.ts`, `components/3d/hall/CameraRig.tsx`,
`components/configurator/ViewToolbar.tsx`, `stores/useViewStore.ts`); admin "Interfață" theme
(`lib/uiTheme.ts`, `.cfg-theme` in `app/globals.css`, `api/_lib/settings.ts`, `AppSetting` table).

## Tracks, owners and models

| Track | What | Model | Owns these files (others must not edit them) |
|---|---|---|---|
| T1 | Openings package (doors, windows, garage doors) | opus | `stores/useOpeningsStore.ts`, `components/3d/openings/**`, `components/3d/PlacementMarkers.tsx`, `components/3d/WallOpening*.tsx`, `components/configurator/steps/ClosingsStep.tsx`, the openings part of `lib/validation/configuration.ts`, `lib/applyHallConfiguration.ts`, the legend in `ConfiguratorLayout.tsx`; new `stores/useHistoryStore.ts` |
| T2 | Brand identity | sonnet (opus reviews the schema) | `prisma/schema.prisma` + migrations, `lib/branding.ts`, `api/_lib/settings.ts`, `components/admin/**`, `app/admin/**`, `ConfigHeader.tsx`, `api/_lib/emailTemplate.ts`, the header block of `api/_lib/quotePdf.tsx` |
| T3 | Drawings: dimensions on flat views, PDF elevations, section cut + layers | opus | new `lib/hall/drawings*.ts`, `components/3d/DimensionLines.tsx`, `ViewToolbar.tsx`, new `components/3d/hall/Section*.tsx`, new `api/_lib/quoteDrawings.tsx` (included from `quotePdf.tsx` by one line) |
| T4 | Adaptive performance | opus design, sonnet tuning | `lib/hardwareTier.ts`, `components/3d/hall/KitInstances.tsx`, `Steel.tsx`, `Hall.tsx`, new `components/3d/hall/quality*.ts` |
| T5 | Small: lens, click a component for details | sonnet (opus designs the pick mapping) | new `components/3d/hall/ComponentPicker*.tsx`, new info card component |

Shared file `components/configurator/ConfiguratorEngine.tsx`: each track adds at most a few lines (mount its component,
pass a prop). The orchestrator merges and resolves; no track restructures it.

## Order (waves)

- **Wave 0 (orchestrator):** main is clean and the gate is green. Restart any running dev server after pulling (the
  Prisma client is cached across hot reloads; a schema change needs a restart).
- **Wave 1 (parallel):** T1a, T2, T3a, T5a.
- **Wave 2:** T1b + T1c, T3b + T3c, T4 (after its baseline measurement), T5b.
- **Wave 3:** T1d, T1e, T1f, T3d.
- **Final:** one QA pass (sonnet) over everything, browser checks by the orchestrator (desktop and 375 px phone), a
  summary in docs/agents.

## T1: Openings package (one sequential track; every step builds on the anchors)

**T1a: anchors + undo/redo (first, everything depends on it).**
- Problem today: an opening is stored as metres from the wall start; on a hall resize `setWallSpans` clamps every
  opening and **overwrites** it, so shrinking and growing back loses positions, bays shift under windows, gable
  openings drift off-centre.
- Store the user's intent as an anchor, never overwritten by a resize:
  - long walls: `{ kind: 'bay', bay: n (counted from the front), offset: 'centre' | metres from the bay's left column }`;
  - gable walls: `{ kind: 'axis', fromCentre: metres }` (centred = 0);
  - free placement (snapping off): `{ kind: 'wallStart', offsetX }`.
- The placed rectangle is derived from anchor + current layout every time (pure function, unit-tested).
- Rules on a structure change: a long-wall item keeps its bay; if the bay is gone it moves to the nearest free bay;
  a gable item keeps its distance from the axis; an item that no longer fits is shown red with "Reașază automat".
- Undo/redo history (hall dimensions + openings), Ctrl/⌘+Z and Ctrl/⌘+Shift+Z, plus buttons.
- After a resize that moved items: a toast "N goluri au fost mutate · Anulează".
- Migration: persisted store version 2; saved configurations and shared links in the old shape convert to anchors
  (same approach as the existing v0 → v1 migration); the server-side validation accepts both shapes.

**T1b: placement without the plus markers.** Remove the plus markers. When a tool is chosen:
- a see-through preview of the item follows the pointer over the walls and settles into the centre of the bay under
  it; click to place;
- the bay under the preview is highlighted; if the item does not fit, the bay turns red with "nu încape";
- a status line at the top of the 3D view: "Plasezi: Fereastră · click pe perete · Esc pentru a termina";
- the tool stays active after placing; Esc or right-click exits;
- a first-time hint in the panel: "1. Alege tipul · 2. Click pe perete · 3. Trage pentru a muta", hidden after the
  first placement (per-browser flag, wrapped in try/catch);
- drag a type card from the panel straight onto a wall as an alternative;
- phones: tap a type, tap a bay; the status line becomes a bar with a "Gata" button.

**T1c: snapping.** While dragging, snap within about 0.30 m to: the bay centre (thin guide line), the sill height of
other windows on the same wall, equal gaps between neighbours, the middle of the wall. Alt (⌥ Option on a Mac)
disables snapping; the bottom-left legend shows "Alt/⌥ · Fără aliniere"; phones get an "Aliniere: on/off" switch.
Buttons on the selected item: "Centrează în travee", "Centrează pe perete".

**T1d: copy, paste, repeat.** Ctrl/⌘+C, Ctrl/⌘+V, Ctrl/⌘+D and a "Duplică" button: the copy goes into the next free bay
on the same wall, same size and height. Paste mode: after copying, each click on a bay places another copy. "Repetă":
every bay, every second bay, or N copies evenly spaced. Shortcuts are ignored while typing in a field (as the view
keys already are).

**T1e: symmetry.** Selector "Simetrie: Niciuna / Stânga↔Dreapta / Față↔Spate / Pe axa peretelui".
- Mirror pair: an item placed on one wall gets a twin on the opposite wall, same bay, same height.
- Wall axis: on a gable, a garage door snaps to the centre; an item left of the axis gets a mirrored twin on the right.
- Twins share a `linkId`: move or resize one and the other follows; deleting one asks whether to delete both.
- Mono-pitch gables are not symmetric: a twin that does not fit is red with "Reașază automat", never silently shrunk.
- "Repetă" with symmetry on fills both walls in one action.

**T1f: resize polish.** Finish the toast, "Reașază automat" and conflict states from T1a across all the above; browser
test the full flow: place, copy, mirror, resize smaller and larger, undo.

## T2: Brand identity

- **Data model (multi-tenant ready):** `Organization` (name, legal details, subdomain, status) 1:1 `BrandIdentity`
  (display name, logo asset, brand colours, theme), `Asset` (logo files; bytes in the DB for now behind a storage
  interface like `api/_lib/renderStore.ts`, S3 later). One default organization for now. Move the current `uiTheme`
  setting into `BrandIdentity` with a migration; `lib/branding.ts` reads the DB with the environment as fallback.
- **Logo upload** in "Interfață": PNG, JPG or SVG, at most 1 MB, type checked by magic bytes; SVG sanitized
  server-side (or rasterized to PNG); served with cache headers.
- **Company name and logo** in the configurator header (replacing the hard-coded "CarStar"), the admin header, the PDF
  quote, the emails and the favicon.
- **"Folosim culorile din logo?"** After upload, the browser extracts the 3–5 dominant colours (canvas, skipping
  near-white and near-black) and asks: swatches, the suggested main and second colour, buttons "Da, aplică" /
  "Aleg eu" / "Nu, păstrez tema actuală". A one-colour logo gets a neutral second colour.
- **Theme generator** from 1–2 brand colours: three contrast-checked variants, "Luminos", "Întunecat",
  "Bară în culoarea firmei" (the price bar filled with the brand colour, buttons in a darker shade of it). Reuse the
  contrast helpers in `lib/uiTheme.ts`. Manual hex entry stays.
- **Freeze branding in each sent quote** (like prices): old PDFs never change after a rebrand.
- **Leftovers to theme:** the 3D accents (`DimensionLines`, placement preview, selected opening) and
  `app/configuration/[token]/page.tsx` still use the fixed orange.

## T3: Drawings layer (one 2D model, three uses; the same data feeds the DXF phase later)

- **T3a: drawing model.** Pure `lib/hall/drawings.ts`: from `HallLayout` (+ openings) build front, back, left, right
  elevations, the plan and a cross-section as polylines plus dimension chains: column axes with labels (A, B… across,
  1, 2… along), bay widths, total length and width, eave and ridge heights, openings with their sizes. Format-neutral
  (no three.js, no PDF). Unit tests against `computeHallLayout`.
- **T3b: dimensions on the flat views.** When the camera is on an orthographic fixed view, draw that view's dimension
  chains in the 3D view, readable at any zoom.
- **T3c: elevations in the PDF quote.** Vector pages (front, side, plan) with the main dimensions and the openings,
  from T3a, in `api/_lib/quoteDrawings.tsx`.
- **T3d: section cut and layers.** A draggable clipping plane across the width (X) or along the length (Z), with
  optional caps; layer toggles for steel, wall cladding, roof, openings, foundation and rainwater; both in the view
  toolbar ("Secțiune", "Straturi"). Quote renders always ignore clipping and layers (reset in `renders.tsx`'s pass).

## T4: Adaptive performance

1. **Measure first:** with `HallStatsProbe`, record triangles, draw calls and frame time for 12×12×4, 40×15×5 and
   102×20×6 halls, on this machine and with Chrome's CPU throttling (4×, 6×). Write the numbers into this file.
2. **Live adaptation:** a frame-time watcher lowers, in order, costly effects (environment reflections), then shadow
   map size, then far detail, and screen resolution last; it raises them back when frames are fast again. A
   "Calitate: Auto / Ridicată" switch.
3. **Hall-based level of detail:** estimate the scene's cost from the layout; bolts, cleats and fittings only near
   the camera; simpler far purlins; merge static pieces.
- Acceptance: the 102 m hall holds 30 fps or more at 4× throttling; no visible change on high-tier devices; quote
  renders unchanged (they keep their fixed quality).
- Baseline (2026-11-19, Apple M5 10-core 16 GB, Chrome headless with ANGLE Metal GPU, 1440×900 at DPR 2, device tier
  `ultra`; `node scripts/measure-perf.mjs`, 5 s of mouse-drag orbit per row, step 2 so the cladding is on):
  - frame ms are rAF-to-rAF intervals of rendered frames (vsync-capped at 16.7); "render CPU ms" is the main-thread
    cost of one `__hallAdvance()` (GPU time excluded), i.e. the headroom under the cap.

  | hall (w×l×h) | CPU | median ms | p95 ms | fps | render CPU ms | triangles | draw calls |
  |---|---|---|---|---|---|---|---|
  | 12×12×4 | 1× | 16.7 | 16.8 | 60 | 0.1 | 35,040 | 41 |
  | 12×12×4 | 4× | 16.7 | 16.8 | 60 | 0.5 | 35,040 | 41 |
  | 12×12×4 | 6× | 16.7 | 33.4 | 53 | 1.0 | 35,040 | 41 |
  | 15×40×5 | 1× | 16.7 | 16.8 | 60 | 0.1 | 86,164 | 41 |
  | 15×40×5 | 4× | 16.7 | 16.8 | 60 | 0.6 | 86,164 | 41 |
  | 15×40×5 | 6× | 16.7 | 16.8 | 60 | 0.9 | 86,164 | 41 |
  | 20×102×6 | 1× | 16.7 | 16.7 | 60 | 0.1 | 212,676 | 39 |
  | 20×102×6 | 4× | 16.7 | 16.8 | 60 | 0.5 | 212,636 | 35 |
  | 20×102×6 | 6× | 16.7 | 33.4 | 44 | 4.4 | 212,636 | 35 |

  - Reading: on this machine every hall is vsync-bound at 4× (the acceptance already holds before any change); the 6×
    dips are main-thread stalls under the input flood, not draw cost. Draw calls stay ~40 whatever the length
    (instancing); triangles grow ~linearly with length (bolts, cleats, purlin spans). The costs that scale on weaker
    devices are GPU-side: pixels (DPR 2), PCF shadow map 2048, environment reflections, and the triangle count.

## T5: Small items

- **T5a: narrower lens.** Default field of view 75° → about 45° (one constant); framing already adapts through
  `cameraViews.ts`; update tests.
- **T5b: click a component for details.** Click (tap) a column, rafter, purlin, wall panel, roof panel, gutter or
  downpipe: it is highlighted and an info card shows what it is, its size (e.g. column height, bay number, panel area),
  its colour and RAL; later the steel profile and its price share. Openings keep priority (clicking an opening selects
  it as today). Esc or clicking empty space closes. Needs a mapping from the instanced pieces (`instanceId`) back to
  layout elements.

## Not in this round

- AR presentation: docs/plans/ar.md (next).
- GPU render server: docs/plans/gpu-render-server.md (after AR).
- Interior walk-through view: its own plan, later.
- Reading colours and logo from a company's website: later; needs the legal check noted in the AR/branding discussion
  (one public page fetch, colours are free to use, a prospect's logo only in private, expiring demos).
- Embed-script controls (set view or theme from the host page): with the phase 2 integration script.
