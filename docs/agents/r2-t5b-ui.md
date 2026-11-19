# Brief r2-T5b-ui — click a component: highlight + info card (round 2, wave 2)

You are one worker in a multi-agent round on the industrial hall configurator (Next.js 16 + React Three Fiber + Tailwind,
app in `industrial-configurator/`). You have no memory of earlier discussions; this brief is the whole contract. UI text is
**Romanian**. Model: sonnet. Small, focused task on top of an existing, tested API: do not redesign it.

## Setup
1. In your worktree: `git merge --ff-only main`, then `git checkout -b r2-t5b-ui` (if taken: `r2-t5b-ui-2`).
2. `cd industrial-configurator && pnpm install && pnpm exec prisma generate`.
3. Read: `src/components/3d/hall/ComponentPicker.tsx` (see the `// UI:` notes at the end), `ComponentPicker.map.ts`
   (`PickedComponent`, `highlightTarget`, `componentColor`), `src/stores/useComponentSelection.ts`,
   `src/components/3d/hall/kit.ts` (how kit piece geometries are loaded: `useHallKit`), `src/components/configurator/ConfiguratorEngine.tsx`,
   `src/components/configurator/ConfiguratorLayout.tsx`, `src/components/configurator/UiThemeScope.tsx` (`useAccentColor()`),
   `src/stores/useConfiguratorStore.ts` (`colors`) and wherever the colour palette is available on the client
   (see `ColorPicker.tsx` / `PanelsStep.tsx` for how they get it).

## Files you own
New `src/components/3d/hall/ComponentHighlight.tsx`, new `src/components/configurator/ComponentInfoCard.tsx` (+ tests for any
pure helper you add), one mount line (+ import) in `ConfiguratorEngine.tsx` for the highlight (inside the existing
`renderHiddenProps` group, so it never shows in quote renders), one mount line (+ import) in `ConfiguratorLayout.tsx` for the card.
Do NOT edit anything else — in particular not `Hall.tsx`, `KitInstances.tsx`, `Steel.tsx`, `hardwareTier.ts` (another worker
owns them right now), nor `ComponentPicker*.ts(x)` / `useComponentSelection.ts` (if you find a bug there, report it).

## Tasks
1. **Highlight** (`ComponentHighlight.tsx`, inside the Canvas): read `useComponentSelection(s => s.selected)` and
   `highlightTarget(selected, layout)`.
   - `type: 'instances'`: draw the kit piece geometry (same geometry as the scene's InstancedMesh, from `useHallKit`) at each
     `matrix`, with a see-through accent-coloured material (`useAccentColor()`), `depthTest` off or a slight polygon offset so it
     reads over the steel, plus an outline (e.g. `Edges` from drei, already a dependency) in the accent colour.
   - `type: 'face'`: draw the polygon a few mm out along `normal`, translucent accent fill + accent outline.
   - Invalidate the demand-rendered canvas when the selection changes (`useThree(s => s.invalidate)`). Dispose created geometry.
2. **Info card** (`ComponentInfoCard.tsx`, HTML outside the Canvas): when something is selected show `label`, the `details`
   rows, and the colour (swatch + name + RAL from `componentColor(selected, colors, palette)`); a close button (× with
   `aria-label="Închide"`) calls `clear()`. Placement: desktop — top-left of the 3D view below the admin bar area, not covering the
   view toolbar (top-right), undo/redo (bottom-left) or the legend; phones (< 768 px) — a compact card above the view bar at the
   bottom, full width minus 12 px gutters, no horizontal scroll at 375 px. Styling consistent with the existing overlay cards
   (`bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl shadow-sm`, theme-aware Tailwind classes).
3. "Later: profile + price share" is out of scope — do not add placeholders for it.

## Acceptance
- Gate green from `industrial-configurator/`: `pnpm install && pnpm exec prisma generate && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`, lint 0/0.
- `git diff --stat main...HEAD` shows only owned files. No new dependencies.
- **Browser check required** (the live raycast has never been tested): run your own dev server on port **3018** from your
  worktree (copy `.env*` and `prisma/dev.db` from `/Users/bogdan/Projects/WebNest/Hala/CarStar/industrial-configurator/`
  first; never touch the main checkout's database; never port 3000). Use the built-in browser if your tools have it. On step 2
  (cladding shown) click a column, a purlin, a wall, the roof and a gutter; on step 3 click an opening (it must select the
  opening, not a component); Esc and empty-space click clear. Check at 375 px too. Keep screenshots to a minimum (≤ 4).
  If you cannot drive a browser, say so plainly in the report.

## Report back (short)
Branch + commit; what you verified in the browser (and what you could not); any bug found in the picker/mapping (file + line +
what happens); gate. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
