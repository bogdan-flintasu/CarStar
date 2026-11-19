# Brief r2-T3b+c — dimensions on the flat views, elevations in the PDF quote (round 2, wave 2)

You are one worker in a multi-agent round on the industrial hall configurator (Next.js 16 + React Three Fiber,
`@react-pdf/renderer` for quotes, app in `industrial-configurator/`). You have no memory of earlier discussions; this brief is
the whole contract. Labels are **Romanian**. Model: opus. Do T3b, commit, then T3c, commit.

## Setup
1. In your worktree: `git merge --ff-only main`, then `git checkout -b r2-t3bc` (if taken: `r2-t3bc-2`).
2. `cd industrial-configurator && pnpm install && pnpm exec prisma generate`.
3. Read `docs/plans/next-features.md` (section T3), then: `src/lib/hall/drawings.ts` + `drawingsFormat.ts` + `drawings.test.ts`
   (the T3a model you build on), `src/components/3d/DimensionLines.tsx`, `src/components/configurator/ViewToolbar.tsx`,
   `src/stores/useViewStore.ts`, `src/lib/hall/cameraViews.ts`, `src/components/3d/hall/CameraRig.tsx` (read only),
   `src/components/configurator/ConfiguratorEngine.tsx`, `src/components/configurator/UiThemeScope.tsx` (`useAccentColor()`),
   `src/app/api/_lib/quotePdf.tsx`, `src/app/api/_lib/quoteForToken.ts`, `src/lib/quote/quoteModel.ts` (+ tests).

## The drawing model you build on (T3a, on main, `@/lib/hall`)
`buildDrawings(layout, openings?) -> Record<'front'|'back'|'left'|'right'|'plan'|'section', Drawing>`; a `Drawing` has
`toWorld` (sheet → world frame: `origin`, `axisX`, `axisY`), `bounds`, `polylines` (layer + `ref`), `axes` (labels A, B…/1, 2…,
`labelAt`), `dimensions` (chains: `direction`, `base`, `line`, `row`, `segments[]` with `text`, `labelAt` on the dimension
line), `labels`. `drawingPointToWorld(frame, p)`, `formatMetres` ("7,5 m"). Openings input: `{ id, type, wallId, offsetX,
sill, width, height }` — pass the store's `openings` (they carry exactly these placed metric fields).
T3a's notes: draw grid polylines dashed; `steel` on elevations as hidden lines (columns stand behind the wall); `labelAt`
sits on the dimension line, offset the text yourself; `DimensionLines` should use `formatMetres` too.

## Files you own
`src/components/3d/DimensionLines.tsx`, `src/components/configurator/ViewToolbar.tsx` (only if needed), new
`src/components/3d/drawings/**` (e.g. `FlatViewDimensions.tsx`), new `src/app/api/_lib/quoteDrawings.tsx` (+ test),
**one line** in `src/app/api/_lib/quotePdf.tsx` to include the drawing pages (plus its import), additive changes to
`src/lib/quote/quoteModel.ts` (e.g. carry the hall params + placed openings the drawings need) and `quoteForToken.ts` only if
the data does not reach the PDF otherwise, `src/lib/hall/drawings*.ts` (bug fixes / additions you need, with tests), and
a few lines in `ConfiguratorEngine.tsx` (mount; no restructuring).
Do NOT edit: openings files/stores, `components/3d/hall/**` (incl. `Hall.tsx`, `KitInstances.tsx`, `CameraRig.tsx`),
`lib/hardwareTier.ts`, `ConfiguratorLayout.tsx`, `ClosingsStep.tsx`, `prisma/**`. Other workers (openings placement,
adaptive performance) are editing those now.

## T3b — dimensions on the flat views
- When the camera is on an orthographic fixed view (`useViewStore`: `view` in front/back/left/right/top and
  `projection === 'orthographic'`), draw that view's dimension chains, axis bubbles and labels in the 3D view, placed via
  `toWorld`, slightly in front of the building (towards the camera) so nothing is hidden by the cladding.
- Readable at any zoom: text and ticks keep a constant on-screen size (scale with the orthographic camera's zoom, or use
  screen-space text), lines are 1 px. Chains don't overlap each other or the building (use `row` offsets).
- Hidden in the perspective 3D view and as soon as the user orbits away (`view === null`). Never in quote renders: wrap
  in the existing `renderHiddenProps` group as `DimensionLines` already is.
- Accent colour from `useAccentColor()` (replaces the fixed `#F5A623`); `DimensionLines` labels switch to `formatMetres`.
- Openings appear in the chains (from the store's `openings`, passed in from the engine).

## T3c — elevations in the PDF quote
- `api/_lib/quoteDrawings.tsx`: vector pages (react-pdf `Svg`, `Path`/`Line`/`Text`) for the **front, one side and the
  plan** (add the section if it fits on the page), each scaled to fit the A4 content box, with the main dimensions (bays,
  totals, eave/ridge heights) and the openings with their sizes, a title per drawing (`DRAWING_TITLES`), and a scale note
  (e.g. "Scara aprox. 1:200" computed from the fit).
- Built from the stored configuration on the server (`computeHallLayout` + the placed openings in `openingsList`), so a
  saved quote shows the hall as saved. Old configurations without anchors still work (they carry the metric fields).
- Included from `quotePdf.tsx` by one line; branding/header stay as they are (the fixed header renders on every page).
- Fonts: use the fonts `quotePdf.tsx` already registers (Romanian diacritics must render).

## Tests
- T3b: a pure helper that picks the drawing for a view + projection (`null` for perspective/free), and the screen-size
  scale factor for a given ortho zoom (pure functions, unit-tested).
- T3c: `renderQuotePdf` with drawings renders without throwing for a gable and a mono hall with openings (existing quote
  tests show how), page count grows by the drawing pages, and a pure `fitDrawing(bounds, box)` returns the expected scale.

## Acceptance
- Gate green from `industrial-configurator/`: `pnpm install && pnpm exec prisma generate && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`, lint 0/0.
- `git diff --stat main...HEAD` shows only owned files. No new dependencies.
- Do not use port 3000. If you run a dev server, use port 3015 from your worktree (copy `.env*` and `prisma/dev.db` from
  `/Users/bogdan/Projects/WebNest/Hala/CarStar/industrial-configurator/` first; never touch the main checkout's database).
  Generate one sample PDF into your scratchpad and look at it (convert a page to PNG with `sips` or read it) — report what you saw.

## Report back (short)
Branch + commits; what the user sees; exported API; decisions (text scaling approach, which views go in the PDF); tests;
gate; handoffs (e.g. for T3d section cut / layers next wave). End commit messages with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
