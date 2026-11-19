# Brief r2-T3a — drawing model (round 2, wave 1)

You are one worker in a multi-agent round on the industrial hall configurator (Next.js 16 + React Three Fiber,
app in `industrial-configurator/`). You have no memory of earlier discussions; this brief is the whole contract.
Labels are **Romanian**. Model: opus.

## Setup (do this first)
1. In your worktree: `git merge --ff-only main`, then `git checkout -b r2-t3a` (if taken: `r2-t3a-2`).
2. `cd industrial-configurator && pnpm install`.
3. Read `docs/plans/next-features.md` (section T3), then `src/lib/hall/types.ts`, `computeHallLayout.ts`, `section.ts`,
   `walls.ts`, `constants.ts`, `cameraViews.ts` (view names/directions), `src/components/3d/DimensionLines.tsx` (what is
   measured in 3D today), `src/components/3d/openings/types.ts` (the opening shape), and their tests.

## Goal
One format-neutral 2D drawing model of the hall, built from `HallLayout` (+ openings), that three consumers will use:
dimension chains on the orthographic 3D views (T3b), vector elevations in the PDF quote (T3c), and later a DXF export.
This track builds **only the pure model** — no three.js, no React, no PDF.

## Files you own
New `src/lib/hall/drawings.ts` (and more `src/lib/hall/drawings*.ts` if you split it, e.g. `drawingsDimensions.ts`) and
`src/lib/hall/drawings*.test.ts`. You may add one export line to `src/lib/hall/index.ts`. Nothing else.
Do NOT edit `computeHallLayout.ts`, `types.ts`, `DimensionLines.tsx`, `ViewToolbar.tsx`, openings files or stores
(other workers are changing them now). If the layout lacks something you need, compute it inside your module from
what `HallLayout` exposes, and list it as a handoff.

## Openings input
Another worker is changing the openings store right now. Do not import the store. Accept a structural input defined in
your module, compatible with both the current and the next opening shape:
`interface DrawingOpening { id: string; type: 'window' | 'door' | 'garageDoor'; wallId: 'PereteFata' | 'PereteSpate' | 'PereteSTG' | 'PereteDR'; offsetX: number; sill: number; width: number; height: number }`
(`offsetX` = metres from the wall start along the wall's `h` axis; `sill` = floor → bottom edge). Map `wallId` to the
layout wall via `WallDescriptor.id`.

## Model (suggested API; refine names, keep it format-neutral and serialisable)
```ts
type DrawingViewId = 'front' | 'back' | 'left' | 'right' | 'plan' | 'section';
interface Drawing {
  view: DrawingViewId;
  /** 2D frame of the sheet: x to the right, y up, metres; plus how to map it back to world (for T3b). */
  toWorld: { origin: Vec3; axisX: Vec3; axisY: Vec3 };
  bounds: { min: Vec2; max: Vec2 };
  polylines: { layer: DrawingLayer; points: Vec2[]; closed: boolean }[];   // outline, columns, roof, openings, slab, grid
  axes: { label: string; at: number; direction: 'x' | 'y'; from: number; to: number }[]; // A, B… across; 1, 2… along
  dimensions: DimensionChain[];   // each chain: base line, offset (row), ordered points, the label of each segment
  labels: { text: string; at: Vec2; layer: DrawingLayer }[];
}
type DrawingLayer = 'outline' | 'steel' | 'cladding' | 'roof' | 'openings' | 'foundation' | 'grid' | 'dimensions';
buildDrawings(layout: HallLayout, openings?: readonly DrawingOpening[]): Record<DrawingViewId, Drawing>;
```
Content:
- **Elevations (front, back, left, right)** as seen from outside: wall outline (rectangle / gable pentagon / mono
  trapezoid from `WallDescriptor.polygon`), roof edge line, slab line when there is a foundation, column axes behind the
  wall, the openings on that wall (rectangles, mirrored correctly for walls whose `h` runs right-to-left from outside —
  see the note on the LEFT wall in `types.ts`), dimension chains: bay widths + total along the wall, eave height and
  ridge/high-eave height, each opening's width × height and its position (chain of edges along the bottom row, sill
  height for windows).
- **Plan (from above)**: column grid with axis labels (A, B… across the width; 1, 2… along the length), outer outline,
  bay widths + total length, total width (axis to axis and outer), openings shown as gaps/marks on the outline.
- **Cross-section** (at a typical frame): columns, rafters, roof line, eave and ridge heights, clear width.
- Number formatting helper shared by all consumers: metres with up to 2 decimals in Romanian style (comma decimal
  separator, e.g. `7,5 m`); expose it and use it for every label.
- Gable vs mono-pitch must both be correct (mono: one slope, high side from `layout.highSide`).
- Deterministic and side-effect free; values rounded to the millimetre.

## Tests (Vitest, against `computeHallLayout`)
- 12×12×4 gable, 40×15×5, 102×20×6 and a mono-pitch hall: bay segments sum to the total length; axis count =
  frames (along) / columns (across); eave/ridge dimension values equal `layout.eaveY`-based heights you choose to show
  (state which: clear height vs top of steel — be consistent with `DimensionLines.tsx`, which measures clear height and ridge).
- Openings land on the right elevation, at the right side (left wall mirrored), with matching width/height labels.
- Every polyline point is inside `bounds`; `toWorld` maps a known 2D point (e.g. the front-left eave corner) to the
  expected world point.
- Romanian number formatting.

## Acceptance
- Gate green from `industrial-configurator/`: `pnpm install && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`,
  lint 0/0. `git diff --stat main` shows only your files. No new dependencies. No dev server needed.

## Report back (short)
Branch + commit; the final exported types and functions (exact signatures) T3b/T3c will use; which heights/widths each
view dimensions and why; decisions; tests added; gate; handoffs. End commit messages with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
