# Brief r2-T3d — section cut and layers (round 2, wave 3)

You are one worker in a multi-agent round on the industrial hall configurator (Next.js 16 + React Three Fiber + three.js,
app in `industrial-configurator/`). You have no memory of earlier discussions; this brief is the whole contract. UI text is
**Romanian**. Model: opus.

## Setup
1. In your worktree: `git merge --ff-only main`, then `git checkout -b r2-t3d` (if taken: `r2-t3d-2`).
2. `cd industrial-configurator && pnpm install && pnpm exec prisma generate`.
3. Read `docs/plans/next-features.md` (T3, T4 sections), `docs/agents/ORCHESTRATOR-round2.md` (T3b, T4, T5b entries), then:
   `src/components/configurator/ViewToolbar.tsx`, `src/stores/useViewStore.ts`, `src/components/configurator/ConfiguratorEngine.tsx`,
   `src/components/3d/hall/{Hall,Walls,Roof,Steel,Trims,Site,KitInstances,renders,snapshot,qualityController}.tsx`,
   `src/components/3d/WallOpenings.tsx` (read only), `src/components/3d/hall/ComponentPicker*.ts(x)` (read only),
   `src/components/3d/drawings/**`, `src/lib/hall/drawings.ts`, `src/components/configurator/UiThemeScope.tsx` (`useAccentColor()`).

## Files you own
`ViewToolbar.tsx`, `src/stores/useViewStore.ts` (additive: section + layer state), new `src/components/3d/hall/Section*.tsx` and
`src/components/3d/hall/section*.ts` (pure helpers + tests), new `src/components/3d/hall/layers.ts`, **small additive edits** to
`Hall.tsx` / `Walls.tsx` / `Roof.tsx` / `Steel.tsx` / `Trims.tsx` / `Site.tsx` to wire layer visibility (a `visible` flag or group
per layer; do not restructure, keep T4's LOD/instance-order contract and T5b's pick names `userData.kitPiece` intact),
`renders.tsx` (reset clipping + layers for the quote pass), and a few mount lines in `ConfiguratorEngine.tsx`.
Do NOT edit: openings files (`stores/useOpeningsStore.ts`, `components/3d/openings/**`, `WallOpening*.tsx`, `ClosingsStep.tsx`,
`PlacementStatus.tsx`), `ConfiguratorLayout.tsx`, `lib/hall/drawings*.ts`, `app/api/**`, `prisma/**`. Another worker (copy/paste,
symmetry) is editing those now. Openings visibility: wrap `WallOpenings`' mount in the engine in a group whose `visible` follows the
"Goluri" layer — don't edit the openings files.

## Section cut
- "Secțiune" in the view toolbar: off / across the width (plane normal ±X… i.e. cut along X) / along the length (Z). Choose axis
  naming so it reads naturally: "Transversală" (cuts across, shows the portal frame) and "Longitudinală".
- A draggable clipping plane: a thin handle (accent colour) at the cut that the user drags (pointer capture; OrbitControls disabled
  while dragging), plus a slider in the toolbar popover for touch. Range clamped to the hall extents; default at mid-span.
- Implement with `gl.clippingPlanes` (global) or per-material planes — your call; component picking (T5b) must ignore clipped-away
  parts (raycast hits beyond the plane are skipped — expose a pure `isClipped(point, plane)` and filter in the engine mount, or
  tell the orchestrator the one line the picker needs).
- Optional caps: a "Capace" toggle that fills the cut faces (stencil caps or a simple outline of the cut profile — your call; keep
  it cheap; if caps are too costly, ship an outline and say so).
- Dimension overlays (T3b) are unaffected; the section is reset when the user picks a fixed view? No — keep it; only reset on
  "Resetează" / leaving the configurator.

## Layers
- "Straturi" popover in the toolbar with toggles: Structură (steel), Pereți (wall cladding), Acoperiș (roof), Goluri (openings),
  Fundație (foundation/site slab), Apă pluvială (gutters + downpipes). All on by default; not persisted (or per-browser in try/catch).
- Hidden layers are not pickable.
- Phones (375 px): the two popovers fit, no horizontal scroll, toolbar does not grow beyond its row.

## Quote renders
The offscreen quote pass in `renders.tsx` always ignores clipping and layers: everything visible, no clipping planes, restored after.
Add a test or an explicit pure helper for the "render state" reset.

## Tests (Vitest, pure logic)
Plane from (axis, position, layout extents) incl. clamping; `isClipped`; layer → object-group mapping; render-pass reset restores
previous state; toolbar state reducers in `useViewStore`.

## Acceptance
- Gate green from `industrial-configurator/`: `pnpm install && pnpm exec prisma generate && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`, lint 0/0.
- `git diff --stat main...HEAD` shows only owned files. No new dependencies.
- Do not use port 3000. Dev server on port 3015 from your worktree (copy `.env*` and `prisma/dev.db` from
  `/Users/bogdan/Projects/WebNest/Hala/CarStar/industrial-configurator/` first; never touch the main checkout's database).
  Browser-check the cut (both axes, drag, caps) and each layer at desktop and 375 px; keep it lean (few screenshots).
  Check FPS stays fine on the 102 m hall with the cut on (no new per-frame allocations).

## Report back (short)
Branch + commits; what the user sees; API added; decisions (clipping method, caps approach); tests; gate; handoffs.
End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
