# Brief r2-T1b+c — placement without plus markers, then snapping (round 2, wave 2)

You are one worker in a multi-agent round on the industrial hall configurator (Next.js 16 + React Three Fiber + zustand,
app in `industrial-configurator/`). You have no memory of earlier discussions; this brief is the whole contract. UI text is
**Romanian**. Model: opus. Do T1b first, commit it, then T1c, commit it (two commits at least).

## Setup
1. In your worktree: `git merge --ff-only main`, then `git checkout -b r2-t1bc` (if taken: `r2-t1bc-2`).
2. `cd industrial-configurator && pnpm install && pnpm exec prisma generate`.
3. Read `docs/plans/next-features.md` (sections T1b, T1c), `docs/agents/r2-t1a.md` (what T1a built), then the code:
   `src/stores/useOpeningsStore.ts`, `src/components/3d/openings/{types,anchors,openingMath,validateOpenings,wallSpans,useOpeningsLayout}.ts`,
   `src/components/3d/PlacementMarkers.tsx`, `src/components/3d/WallOpenings.tsx`, `src/components/3d/WallOpening.tsx`,
   `src/components/configurator/steps/ClosingsStep.tsx`, `src/components/configurator/ConfiguratorLayout.tsx` (legend),
   `src/components/configurator/ConfiguratorEngine.tsx`, `src/components/3d/hall/Hall.tsx` (`onWallHover` only — read, do not edit),
   `src/components/configurator/UiThemeScope.tsx` (`useAccentColor()`), `src/components/configurator/ViewToolbar.tsx`
   (how its keyboard shortcuts ignore typing — copy the rule).

## What T1a gave you (on main)
- Store: `intents` (truth, persisted v2) → derived `openings` (metric `offsetX/sill/width/height` + `anchor`);
  `placement[id].fits`; `conflicts` incl. `'fit'`; `addOpening(rect, { free? })`, `addIntent`, `updateOpening`
  (position → new anchor; size-only keeps the anchor), `updateIntent`, `autoPlaceOpening(id)`, `activeTool`, `selectOpening`,
  `isDragging`, `setWallSpans`. `WallSpan.bays` = `{h0,h1}[]` column axes on side walls. Pure helpers in `anchors.ts`
  (`placeOpening`, `anchorFromRect`, `baysOf`, `bayIndexAt`, `CENTRE_TOLERANCE`).
- Undo/redo (`useHistoryStore`) records every intent change; a drag commits on drag end (`isDragging` false). Keep using
  `setIsDragging` around drags so one drag = one undo step.

## Files you own
`src/stores/useOpeningsStore.ts` (+test), `src/components/3d/openings/**`, `src/components/3d/PlacementMarkers.tsx`
(remove or repurpose), `src/components/3d/WallOpening*.tsx`, new files under `src/components/3d/openings/` (e.g.
`PlacementPreview.tsx`, `snapping.ts`), `src/components/configurator/steps/ClosingsStep.tsx`, the legend block in
`ConfiguratorLayout.tsx`, new `src/components/configurator/PlacementStatus.tsx` (status line/bar), and at most a few lines
in `ConfiguratorEngine.tsx` (mount/unmount components; no restructuring).
Do NOT edit: `components/3d/hall/**` (incl. `Hall.tsx`, `KitInstances.tsx`), `lib/hardwareTier.ts`, `ViewToolbar.tsx`,
`DimensionLines.tsx`, `components/3d/hall/Section*`, `lib/hall/**`, `app/api/**`, `prisma/**`, `UiThemeScope.tsx`.
Other workers (drawings + dimensions, adaptive performance) are editing those now. If you need a wall hit target, use your
own invisible hit meshes in `components/3d/openings/` (an E11 hit mesh following the gable may already exist in `WallOpenings`)
or the existing `onWallHover` prop.

## T1b — placement without the plus markers
- Remove the plus markers (and the "Apasă pe un perete și apoi pe + …" hint text).
- With a tool chosen: a see-through preview of the item follows the pointer over the walls and settles into the **centre of
  the bay under it** (side walls; gables: centre on the axis when near it, else follow the pointer at 0.1 m). Click to place.
- The bay under the preview is highlighted (thin translucent band in the accent colour from `useAccentColor()`); if the item
  does not fit there (too wide, overlaps, crosses a column, under the mono slope), the bay turns red with a label "nu încape"
  and a click does nothing.
- Status line at the top of the 3D view: "Plasezi: Fereastră · click pe perete · Esc pentru a termina" (Ușă / Ușă industrială).
- The tool stays active after placing; Esc or right-click exits.
- First-time hint in the panel: "1. Alege tipul · 2. Click pe perete · 3. Trage pentru a muta", hidden after the first
  placement (per-browser flag in localStorage, every access in try/catch).
- Drag a type card from the panel straight onto a wall (HTML5 drag or pointer capture → 3D hit test; the preview shows
  during the drag; drop = place).
- Phones (coarse pointer / < 768 px): tap a type, tap a bay; the status line becomes a bar with a "Gata" button. No hover
  preview needed on touch, but the tapped bay flashes the highlight.
- Theme: placement preview and the selected opening outline use `useAccentColor()` (replace the fixed orange in your files).

## T1c — snapping
- While dragging (and for the placement preview), snap within ~0.30 m to: the bay centre (show a thin guide line), the sill
  height of other windows on the same wall, equal gaps between neighbours, the middle of the wall. Pure function in
  `components/3d/openings/snapping.ts`: `snap(candidate, wall span, others, opts) -> { rect, guides[] }`, unit-tested.
- Alt (⌥ Option on a Mac) held disables snapping → the result is a free placement (`addOpening(rect, { free: true })` /
  `updateOpening(..., { anchor: { kind: 'wallStart', ... } })`). The bottom-left desktop legend shows "Alt/⌥ · Fără aliniere".
- Phones: an "Aliniere: on/off" switch in the openings panel (not persisted, or per-browser flag in try/catch).
- Buttons on the selected item in `ClosingsStep`: "Centrează în travee" (side walls) and "Centrează pe perete".

## Tests (Vitest, pure logic)
Bay-under-pointer selection and centring; "fits" decision for the preview (too wide, overlap, column, mono slope);
`snap()` for each target and the 0.30 m threshold, guide output, Alt/free → `wallStart`; centre buttons produce
`{ kind: 'bay', offset: 'centre' }` / `{ kind: 'axis', fromCentre: 0 }`; first-time hint flag survives a throwing localStorage.

## Acceptance
- Gate green from `industrial-configurator/`: `pnpm install && pnpm exec prisma generate && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`, lint 0/0.
- `git diff --stat main...HEAD` shows only owned files. No new dependencies.
- Do not use port 3000. If you run a dev server, use port 3014 from your worktree (copy `.env*` from
  `/Users/bogdan/Projects/WebNest/Hala/CarStar/industrial-configurator/` and `prisma/dev.db` into your worktree first;
  never touch the main checkout's database). A browser check is optional; the orchestrator verifies after the wave.

## Report back (short)
Branch + commits; what changed for the user; public API added (exact signatures) that T1d (copy/paste/repeat), T1e
(symmetry, `linkId`) and T1f will build on; decisions; tests added; gate; handoffs. End commit messages with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
