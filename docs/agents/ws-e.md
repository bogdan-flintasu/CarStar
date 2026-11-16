# WS-E status (openings) — branch ws-e2b (part 2; part 1 = ws-e, merged)

## Part 1 done: E1, E3, E4, E5, E10 (see git log of ws-e). Opening = `{ id, type, wallId, offsetX, sill, width, height }` in metres.

## Part 2: E2 hole fn (done, tests), E6/E7/E8/E9/E11 (see "Part 2 progress" below)

## E2 / E9 integration for WS-D (two lines, exact API)
Pure functions in `@/components/3d/openings/wallShapeWithHoles` (no React; imports three + `@/lib/hall` types only):
```ts
wallGeometryWithHoles(wall: WallDescriptor, openings: Pick<Opening,'offsetX'|'sill'|'width'|'height'>[]): THREE.BufferGeometry
wallMeshTransform(wall: WallDescriptor): { position: Vec3; rotationY: number }
```
Per wall mesh (D3), openings of that wall = `useOpeningsStore(s => s.openings).filter(o => o.wallId === wall.id)`:
```tsx
const geometry = useMemo(() => wallGeometryWithHoles(wall, wallOpenings), [wall, wallOpenings]);  // dispose on change
<mesh geometry={geometry} position={wallMeshTransform(wall).position} rotation-y={wall.yaw} />
```
- The slab is `wall.thickness` thick INWARDS from the exterior face; face at local z = 0; the mirrored left wall is handled
  inside (local x = spanH - h; mesh origin = far corner), so use `wallMeshTransform`, never `wall.origin` directly.
- Gable walls: hole is clipped under the slope; holes are inset 2 mm from the outline (earcut); overlapping openings
  are merged into their bounding box (a blocked conflict anyway, E7).
- Re-build the geometry only when that wall's openings change (store `openings` array identity changes on every edit).
- Pass `realHoles` to `<WallOpenings realHoles />` once walls have holes: it removes the depth mask (E2). Without it only
  windows lose the mask (they show the wall through the glass).
- E9 needs NO change in ConfiguratorEngine: `WallOpenings`/`PlacementMarkers` hide themselves when walls are hidden
  (same rule as the engine: `currentStep === 2 || wallsVisible`); pass `visible` to override.
- E6: `WallOpenings`/`PlacementMarkers` take an optional `layout?: HallLayout` (else they compute it from the
  configurator store). If D already has `layout`, pass `layout={layout}` (hall dims props are now ignored).

## Part 2 progress
- E6: `wallSpans.ts` now derives spans from `computeHallLayout` (`spansFromHallState`, `layoutFromHallState`);
  `WallSpan` gained `apex` (gable), `supports`, `supportHalfWidth`, `blockers`. `clampOpening` keeps openings under the gable slope.
- E7: `validateOpenings(openings, spans) -> OpeningConflict[]` (`overlap|support|blocker`); store field `conflicts` (kept in sync).
- E8: `setWallSpans` re-clamps every opening when the layout changes; leftovers show up in `conflicts`.
