# Brief r2-T5b-map — click a component: the pick mapping (round 2, wave 2)

You are one worker in a multi-agent round on the industrial hall configurator (Next.js 16 + React Three Fiber + three.js,
app in `industrial-configurator/`). You have no memory of earlier discussions; this brief is the whole contract. UI text is
**Romanian**. Model: opus. You design and build the **mapping and the picking**; a later sonnet worker builds the highlight
and the info card on top of your API, so make the API complete and documented.

## Setup
1. In your worktree: `git merge --ff-only main`, then `git checkout -b r2-t5b-map` (if taken: `r2-t5b-map-2`).
2. `cd industrial-configurator && pnpm install && pnpm exec prisma generate`.
3. Read `docs/plans/next-features.md` (section T5b), then: `src/lib/hall/types.ts`, `computeHallLayout.ts`,
   `src/components/3d/hall/{Hall,Steel,KitInstances,Walls,Roof,Trims,kit,placements}.tsx/ts` (+ `placements.test.ts`),
   `src/components/3d/WallOpenings.tsx`, `src/components/3d/WallOpening.tsx`, `src/stores/useOpeningsStore.ts`
   (`selectedOpeningId`, `activeTool`, `isDragging`), `src/lib/colors.ts` (component colours + RAL), `src/stores/useConfiguratorStore.ts`
   (`colors`), `src/components/configurator/ConfiguratorEngine.tsx`.

## Goal
Click (tap) a column, rafter, purlin, wall panel, roof panel, gutter or downpipe → it is identified as a layout element with
what it is, its size (e.g. column height, bay number, panel area), and its colour + RAL. Openings keep priority: clicking an
opening selects it exactly as today. Esc or a click on empty space clears the selection.

## Constraint: another worker owns `Hall.tsx`, `KitInstances.tsx`, `Steel.tsx` right now (adaptive performance)
Do **not** edit them. Pick without them: your own component inside the Canvas listens to pointer events on
`gl.domElement` (pointerdown/up with a small movement threshold so an orbit drag is not a click), raycasts the scene with its
own `Raycaster`, and resolves hits by **object name** (`InstancedMesh.name` is the kit piece name — `Column`, `Rafter`,
`Purlin`, `Gutter`, `Downpipe`, … — and wall meshes are named by wall id, the roof `Roof`) plus `intersection.instanceId`.
The performance worker has been told to keep **instance order = placement order** and the per-piece names; rely on that, and
write it down in your module's header as the contract. If an object is invisible (hidden cladding in step 1) it must not be picked.

## Files you own
New `src/components/3d/hall/ComponentPicker*.ts(x)` (pure mapping + the picker component + tests), new
`src/stores/useComponentSelection.ts` (+ test), and **one mount line** in `ConfiguratorEngine.tsx` (inside the existing
`renderHiddenProps` group or next to it — never active during quote renders). Nothing else.

## Tasks
1. **Pure mapping** `ComponentPicker.map.ts` (name it as you like): `resolvePick(hit: { objectName: string; instanceId?: number; point: Vec3 }, layout: HallLayout) -> PickedComponent | null`.
   Rebuild the instance order from `placements.ts` for the given layout (or reproduce its ordering rules) and map:
   `Column` → { kind:'column', side, frame (bay/axis label like "Ax 3, stânga"), height }, `Rafter` → { side, frame, length },
   `Purlin` → { side, line index, bay, length }, wall mesh → { kind:'wallPanel', wall key, area, height }, `Roof` → { slope side
   (or the slope hit by `point`), area, slope length, pitch }, `Gutter` → { side, length }, `Downpipe` → { side, end, height }.
   Base plates, haunches, cleats, bolts, trims → `null` (not pickable) or map to their parent member if trivial — your call, document it.
   Each result carries `colorComponent` (the key into `colors`: walls/roof/steel/trims…) so the card can show colour name + RAL,
   a stable `key` string (e.g. `column:left:3`) for highlighting, and a Romanian `label` + `details: {label, value}[]`
   (formatted with `formatMetres` / area "m²").
2. **Selection store** `useComponentSelection`: `{ selected: PickedComponent | null; select(c); clear() }`. Selecting a
   component clears `selectedOpeningId`; selecting an opening (store subscription) clears the component.
3. **Picker component** `ComponentPicker.tsx`: the raycast click handler described above; ignores clicks while an opening tool
   is active (`activeTool !== null`), while dragging, and when the hit nearest the camera is an opening (let `WallOpening`
   handle it — check how openings are named/flagged and test the priority rule in pure form). Esc clears (ignore while typing).
   Empty space clears. Also export a pure `highlightTarget(picked, layout)` that returns what the UI worker needs to draw the
   highlight: for instanced pieces `{ objectName, instanceId, matrix }`, for walls/roof `{ objectName, faceBounds or polygon }`.
4. Do not build the card UI or the highlight rendering (next worker), but leave a `// UI:` note where they plug in.

## Tests (Vitest, pure)
For 12×12×4 gable, 40×15×5 and a mono-pitch hall: every `Column` instance id maps to a distinct (side, frame) and the count
matches `layout.columns`; rafter/purlin/gutter/downpipe ids map to the right side/frame/bay; a wall hit maps to the right wall
with its area; roof hit picks the slope from `point`; invisible/unpickable names → null; opening-priority rule; selection store
mutual exclusion with the openings selection.

## Acceptance
- Gate green from `industrial-configurator/`: `pnpm install && pnpm exec prisma generate && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`, lint 0/0.
- `git diff --stat main...HEAD` shows only owned files. No new dependencies. Do not use port 3000 (use 3017 if you run a
  server, with copies of `.env*` and `prisma/dev.db` from `/Users/bogdan/Projects/WebNest/Hala/CarStar/industrial-configurator/`).

## Report back (short)
Branch + commit; the exact exported types and functions (`PickedComponent`, `resolvePick`, `highlightTarget`, the store);
which pieces are pickable and how ambiguous hits are resolved; the instance-order contract you rely on; tests; gate; what the
UI worker must do. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
