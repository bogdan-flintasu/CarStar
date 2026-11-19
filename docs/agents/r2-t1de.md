# Brief r2-T1d+e — copy/paste/repeat, then symmetry (round 2, wave 3)

You are one worker in a multi-agent round on the industrial hall configurator (Next.js 16 + React Three Fiber + zustand,
app in `industrial-configurator/`). You have no memory of earlier discussions; this brief is the whole contract. UI text is
**Romanian**. Model: opus. Do T1d first, commit it, then T1e, commit it (two commits at least).

## Setup
1. In your worktree: `git merge --ff-only main`, then `git checkout -b r2-t1de` (if taken: `r2-t1de-2`).
2. `cd industrial-configurator && pnpm install && pnpm exec prisma generate`.
3. Read `docs/plans/next-features.md` (T1 section, esp. T1d, T1e), `docs/agents/r2-t1a.md`, `docs/agents/r2-t1bc.md`, the
   round log `docs/agents/ORCHESTRATOR-round2.md` (T1a/T1b+c entries), then the code: `src/stores/useOpeningsStore.ts` (+test),
   `src/stores/useHistoryStore.ts`, `src/components/3d/openings/**` (anchors, placement, snapping, PlacementPreview,
   validateOpenings, wallSpans, types), `src/components/3d/WallOpenings.tsx`, `src/components/3d/WallOpening.tsx`,
   `src/components/configurator/steps/ClosingsStep.tsx`, `src/components/configurator/PlacementStatus.tsx`,
   `src/components/configurator/HistoryButtons.tsx`, `src/components/configurator/ViewToolbar.tsx` (keyboard rule: ignore while typing).

## What is on main
Intents (anchor: `bay` | `axis` | `wallStart`, sill, width, height, `linkId?` reserved for you) are the persisted truth
(store v2); `openings` derived with metric fields; `placement[id].fits`; conflicts incl. `'fit'`; `addOpening(rect, {free?})`,
`moveOpening`, `centreOpening`, `updateOpening`, `autoPlaceOpening`, `snap()`; undo/redo records intent changes (drag = one step
via `setIsDragging`); PlacementPreview with bay band + "nu încape"; phone "Gata" bar. Server `openingSchema` accepts `linkId`.

## Files you own
`src/stores/useOpeningsStore.ts` (+test), `src/stores/useHistoryStore.ts` (only if needed), `src/components/3d/openings/**`
(new e.g. `copyPaste.ts`, `repeat.ts`, `symmetry.ts`), `src/components/3d/WallOpening*.tsx`, `src/components/3d/PlacementMarkers.tsx`,
`src/components/configurator/steps/ClosingsStep.tsx`, `src/components/configurator/PlacementStatus.tsx`, the legend block in
`ConfiguratorLayout.tsx`, the openings part of `src/lib/validation/configuration.ts`, `src/lib/applyHallConfiguration.ts`,
new `src/components/configurator/Openings*.tsx` (e.g. a keyboard-shortcut hook, a confirm dialog), and at most a few mount lines
in `ConfiguratorEngine.tsx` / `ConfiguratorLayout.tsx`.
Do NOT edit: `components/3d/hall/**`, `ViewToolbar.tsx`, `DimensionLines.tsx`, `components/3d/drawings/**`, `lib/hall/**`,
`app/api/**`, `prisma/**`, `UiThemeScope.tsx`. Another worker (section cut + layers) is editing the toolbar and hall now.

## T1d — copy, paste, repeat
- Ctrl/⌘+C copies the selected opening; Ctrl/⌘+V pastes; Ctrl/⌘+D and a "Duplică" button duplicate. The copy goes into the
  **next free bay on the same wall** (side walls; gables: next free spot along the wall that fits), same type, size and sill.
  None free → a short message "Nu mai este loc pe acest perete", nothing added.
- Paste mode: after a copy, the status line reads "Lipești: Fereastră · click pe perete · Esc pentru a termina"; each click
  on a bay places another copy there (reuse the PlacementPreview with the copied size; red "nu încape" rules apply). Esc /
  right-click / "Gata" ends it.
- "Repetă" on the selected item (side walls): "În fiecare travee", "La fiecare a doua travee", "N bucăți, egal distanțate"
  (N input). Skips bays where it does not fit (report "X nu au încăput"). One action = one undo step.
- Shortcuts ignored while typing in an input/textarea/contenteditable (same rule as ViewToolbar) and when no opening is selected.
  ⌘ on Mac, Ctrl elsewhere; don't break the browser's own copy when text is selected in the page.

## T1e — symmetry
- Selector in ClosingsStep: "Simetrie: Niciuna / Stânga↔Dreapta / Față↔Spate / Pe axa peretelui" (store state; persist with intents
  is not required — a per-session setting is fine).
- Mirror pair (Stânga↔Dreapta: left/right long walls; Față↔Spate: front/back gables): an item placed gets a twin on the opposite wall,
  same bay (long walls: same bay index counted from the front; gables: mirrored `fromCentre` as seen from outside), same size and sill.
- Pe axa peretelui (gables): a garage door snaps to the centre; an item left of the axis gets a mirrored twin right of it
  (`fromCentre` → `-fromCentre`). An item on the axis has no twin.
- Twins share a `linkId`: moving or resizing one updates the other (mirrored); deleting one asks "Ștergi și perechea?" with
  "Doar acesta" / "Ambele" (deleting only one clears the other's `linkId`). One user action = one undo step for both.
- Mono-pitch gables are not symmetric: a twin that does not fit is kept and shown red (`fits: false`) with "Reașază automat",
  never silently shrunk.
- "Repetă" with symmetry on fills both walls in one action (one undo step).
- Turning symmetry on does not retro-create twins for existing items (only new placements/copies); say so in a hint line.

## Tests (Vitest, pure logic)
Next free bay search (incl. none free, gables); repeat patterns (every / every 2nd / N even, skipped bays count); paste places
the copied size; mirror mapping for each mode (bay index, `fromCentre` sign, axis item no twin); linked move/resize propagates;
delete one vs both; mono twin that does not fit stays with `fits: false`; one undo step per action; shortcut guard ignores
typing targets.

## Acceptance
- Gate green from `industrial-configurator/`: `pnpm install && pnpm exec prisma generate && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`, lint 0/0.
- `git diff --stat main...HEAD` shows only owned files. No new dependencies.
- Do not use port 3000. If you run a dev server, use port 3014 from your worktree (copy `.env*` and `prisma/dev.db` from
  `/Users/bogdan/Projects/WebNest/Hala/CarStar/industrial-configurator/` first; never touch the main checkout's database).
  A short browser check of duplicate + mirror is welcome but keep it lean (few screenshots); the orchestrator verifies after.

## Report back (short)
Branch + commits; what the user sees; public API added (exact signatures) for T1f; decisions; tests; gate; handoffs.
End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
