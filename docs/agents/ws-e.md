# WS-E status (openings) — branch ws-e

## Part 1 done: E1, E3, E4, E5, E10 (+ F handoff: ClosingsStep selectors / countOpenings)
- E1 ids are `nanoid()`; `_nextId` removed. Persist `version: 1` + `migrate` repairs duplicate v0 ids.
- E4 `Opening` is now in metres: `{ id, type, wallId, offsetX, sill, width, height }` (offsetX = wall start ->
  left edge, sill = floor -> bottom edge). Doors/industrial doors: `sill = 0` always.
  One `clampOpening(opening, wall?)` used by add, update, drag, resize, migration and shared links.
- E5 corner handles anchor the opposite edges (`resizeOpening`); door bottom handles change width only.
- E3 frame edges + industrial-door dividers are memoised `BufferGeometry`s, disposed on change.
- E10 drag/resize track `pointermove/up/cancel` on `window` from pointer-down (no mesh-only handlers).
- Side-wall openings now face outward (local +Z = wall normal); handle placement uses the localX·axisH sign.
- Tests: `src/components/3d/openings/openingMath.test.ts`, `src/stores/useOpeningsStore.test.ts` (actions,
  reload id uniqueness, v0->v1 migration). The store test stubs `window.localStorage`.

## Exported interfaces
- `@/stores/useOpeningsStore`: types `Opening, OpeningType, WallId, WallSpan, WallSpans, LegacyOpening`;
  `clampOpening, resizeOpening, DEFAULT_DIMENSIONS, MIN_OPENING_SIZE, isFloorStanding`;
  `addOpening(o): string` (returns id), `updateOpening` clamps, `setWallSpans(spans)`,
  `setOpenings(list)` accepts legacy + metric shapes (validates, clamps, dedupes ids).
- `src/components/3d/openings/wallSpans.ts`: `getWallDescriptors/getWallDescriptor/getWallSpans(w,h,l)`.
  TEMPORARY copy of the old magic numbers, the only place E6 has to swap for D1's `layout.walls`.
- `src/components/3d/openings/openingMath.ts`: pure math (`normalizeOpenings`, `legacyToOpening`, `openingCentre`).

## Decisions
- v0 -> v1 migration and `setOpenings` use spans from the configurator store's hall dims (default 12x3x12).
  add/update use `wallSpans`, pushed by `<WallOpenings>`.
- No re-clamp when the hall changes (deferred to E8, so a temporary shrink doesn't silently move openings).
- Max width/height = full wall length/height. Column/frame conflicts are left to E7.
- E2 depth mask unchanged (part 2).

## Handoffs
- B: the saved `openingsList` is the metric shape above. Validators must accept it (and may accept legacy).
- D (part 2): E9 + E2 integration lines will be posted here.

## Verification
- tsc OK, `pnpm test` 28/28, build OK, lint: 0 errors/warnings in E files (repo total 4 errors, all in D/F files).
- Browser: not run in part 1 (unattended). Covered by unit tests; manual check planned for part 2 milestone.

## Part 2 (not started): E2, E6, E7, E8, E9, E11
