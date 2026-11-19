# Brief r2-T1a — opening anchors + undo/redo (round 2, wave 1)

You are one worker in a multi-agent round on the industrial hall configurator (Next.js 16 + React Three Fiber + zustand +
Prisma/SQLite, app in `industrial-configurator/`). You have no memory of earlier discussions; this brief is the whole
contract. UI text is **Romanian**. Model: opus.

## Setup (do this first)
1. In your worktree: `git merge --ff-only main` (your worktree may start from an older commit).
2. `git checkout -b r2-t1a` (if the branch name is taken, use `r2-t1a-2`).
3. `cd industrial-configurator && pnpm install`.
4. Read: `docs/plans/next-features.md` (section T1), then the files below.

## Goal
Today an opening is stored as metres from the wall start (`offsetX`). On a hall resize, `setWallSpans` clamps every
opening and **overwrites** it, so shrinking and growing back loses positions, frames (bays) shift under windows and
gable openings drift off-centre. Store the user's **intent** as an anchor that a resize never overwrites, derive the
placed rectangle from anchor + current layout every time, and add undo/redo.

## Files you own (only these; do not edit anything else)
- `src/stores/useOpeningsStore.ts` (+ its test), new `src/stores/useHistoryStore.ts` (+ test)
- `src/components/3d/openings/**` (types, openingMath, validateOpenings, wallSpans, useOpeningsLayout, …)
- `src/components/3d/PlacementMarkers.tsx`, `src/components/3d/WallOpening*.tsx`
- `src/components/configurator/steps/ClosingsStep.tsx`
- the openings part of `src/lib/validation/configuration.ts` (`openingSchema` & co. only)
- `src/lib/applyHallConfiguration.ts` (+ test)
- `src/components/configurator/ConfiguratorLayout.tsx`: only to mount your new components / the shortcut hook (a few lines)
- new files you create under `src/components/configurator/` for this feature (e.g. `HistoryButtons.tsx`, `MovedOpeningsToast.tsx`)
- `src/components/configurator/ConfiguratorEngine.tsx`: at most a few lines if really needed (shared file; no restructuring)

Do NOT edit: `useConfiguratorStore.ts` (call its public setters only), `ViewToolbar.tsx`, `CameraRig.tsx`, `cameraViews.ts`,
`DimensionLines.tsx`, anything under `components/3d/hall/**`, `lib/hall/**`, `app/api/**` (except none), `prisma/**`,
`ConfigHeader.tsx`, `components/admin/**`. Other workers are editing those right now.

## Interfaces you can rely on
- `computeHallLayout` / `HallLayout` (`src/lib/hall/types.ts`): `frames[]` (z of each frame, front frame z = 0, back
  z = -length), `bayCount`, `bay`, `walls.{front,back,left,right}: WallDescriptor` with `spanH`, `spanV`, `apexV`,
  `apexH`, `supports` (h of the column axes behind that wall), `polygon`. Both side walls share the same `h` for the
  same frame (h runs front → back on both). Mono-pitch roofs: `roofType: 'mono'`, end walls are trapezoids (apex at one end).
- `wallSpansFromLayout(layout)` in `components/3d/openings/validateOpenings.ts` (you own it; extend `WallSpan` as needed,
  e.g. with the bay edges along the wall).
- Readers of `useOpeningsStore().openings` that you must keep working **without editing them**: `Hall.tsx` (`holes`),
  `hall/renders.tsx`, `SummaryStep.tsx` (sends `openingsList: openings` to the server), `lib/quote/quoteModel.ts`,
  `app/api/_lib/serverPrice.ts`, `wallShapeWithHoles.ts`. So every `Opening` the store exposes **keeps the placed metric
  fields** `offsetX`, `sill`, `width`, `height` (derived), and gains the intent `anchor`.

## Design (required behaviour; implementation details are yours)
1. **Anchor type** (in `components/3d/openings/types.ts`):
   - long (side) walls: `{ kind: 'bay', bay: number /* 0 = front bay */, offset: 'centre' | number /* m from the bay's left column axis */ }`
   - gable (end) walls: `{ kind: 'axis', fromCentre: number /* m from the wall's centre to the opening's centre; 0 = centred */ }`
   - free placement: `{ kind: 'wallStart', offsetX: number }` (used later by T1c when snapping is off; implement and test it now)
   Width, height and sill are also intent: a resize of the hall never changes them.
2. **Pure placement** (new file, e.g. `components/3d/openings/anchors.ts`, no React/three/zustand):
   - `placeOpening(intent, span) -> { rect, fits }` derives the placed rectangle from the anchor and the current wall.
   - `anchorFromRect(rect, span, wallKind)` turns a dragged/placed rectangle into an anchor (side wall: bay = the bay
     holding the opening's centre, `offset: 'centre'` when within 1 cm of the bay centre, else metres; gable: axis).
   - Structure-change rules: a long-wall item keeps its bay; if that bay no longer exists it moves to the **nearest free
     bay** (no overlap with others); a gable item keeps its distance from the axis; an item that no longer fits (too
     wide for the bay/wall, under the mono-pitch slope, off the wall) is **not shrunk or moved silently**: it is placed
     as close as possible, flagged (new conflict kind, e.g. `'fit'`), shown red, and offers "Reașază automat".
   - "Reașază automat" = a pure function that finds the nearest valid placement (same wall first, keep size; shrink only
     as a last resort and only when the user clicks the button).
3. **Store** (`useOpeningsStore`): persisted state = intents (anchor, type, wallId, sill, width, height, id, later
   `linkId` is reserved for T1e — leave room, don't implement). On every layout/spans change, recompute placed
   rectangles from intents — never write the clamped result back into the intent. Drag/resize in the 3D view still
   work: they produce a new rect, which becomes a new anchor via `anchorFromRect`. `conflicts` include the new 'fit' kind.
   Persist **version 2**, with a `migrate` that converts v0 (posX/posY) and v1 (offsetX metres) to anchors using the
   hall from the configurator store (same approach as the existing v0 → v1 migration).
4. **Untrusted input** (`setOpenings`, shared links, saved models): accept v0, v1 and v2 shapes; v0/v1 convert to anchors.
   `currentHallData()` in `applyHallConfiguration.ts` includes the anchor. Server validation
   (`lib/validation/configuration.ts`): `openingSchema` accepts all three shapes (v2 = the metric fields **plus** an
   optional, strictly-validated `anchor`), so old saved configurations and links still validate.
5. **Undo/redo** (`useHistoryStore`): history of {hall dimensions and shape fields of the configurator store: width,
   height, length, roofType, highSide, showFoundation, isIsolated, insulation} + opening intents. One history entry per
   user action: coalesce a slider drag into one entry (e.g. commit after ~400 ms without change), one entry per
   add/remove/drag-end/resize-end of an opening. Applying an undo uses the configurator store's public setters and the
   openings store, and must not itself create a history entry. Cap the history (e.g. 100). Keyboard: Ctrl/⌘+Z undo,
   Ctrl/⌘+Shift+Z redo (also Ctrl+Y); ignored while focus is in an input/textarea/select/contenteditable (same rule the
   view keys use in `ViewToolbar.tsx` — copy the check, don't import from there if it is not exported). Buttons
   "Anulează" / "Refă" (icons with `aria-label` and `title` incl. the shortcut), visible on every step, disabled when
   there is nothing to undo/redo, usable at 375 px width.
6. **Toast**: after a hall change that moved items (bay removed → moved to another bay) or made some not fit, show
   "N goluri au fost mutate · Anulează" (Anulează = undo that change); for non-fitting ones add a hint in ClosingsStep
   (red row + "Reașază automat" button). Auto-hide after ~6 s.
7. Fix in passing (you own the file): `useOpeningsLayout` builds its fallback layout without `roofType`/`highSide`.

## Tests to add (Vitest, pure logic; behaviour, not implementation details)
- shrink the hall then grow it back → every opening is back exactly where it was (side walls and gables).
- length change that removes the bay of an opening → it moves to the nearest free bay; with no free bay → 'fit' conflict.
- gable: centred garage door stays centred across width changes; off-axis item keeps its distance from the axis.
- mono-pitch: an item under the low side that no longer fits → flagged, not shrunk; "Reașază automat" yields a valid spot.
- `anchorFromRect` ↔ `placeOpening` round trip; `offset: 'centre'` detection.
- persisted v0 and v1 → v2 migration; `setOpenings` with all three shapes; server `openingSchema` accepts v0/v1/v2 and
  rejects a malformed anchor.
- history: slider drag coalesced to one entry; undo/redo of dimension change + opening move; undo does not record itself.
Keep all existing tests green (adapt tests in files you own when the behaviour intentionally changed, e.g. E8 "re-clamp").

## Acceptance
- Gate green from `industrial-configurator/`: `pnpm install && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`,
  lint 0 errors 0 warnings.
- No edits outside the owned files (`git diff --stat main` shows only them).
- Existing placement (plus markers, click on wall, drag, resize) still works; the plus markers stay (T1b removes them later).
- Do not start a dev server on port 3000 (the orchestrator's). If you want a quick look, use port 3011; browser checks
  are not required from you.

## Report back (short)
Branch + final commit hash; files changed; the anchor/intent types and the public store API (exact signatures) that
T1b–T1f will build on; decisions you made; tests added (count); gate result; anything left over or any handoff to
other tracks (file + what is needed). Commit with clear messages ending in
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
