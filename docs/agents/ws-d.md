# WS-D status (engine rewrite) — branch ws-d

## Done (run 1): D1, D10. Not started: D2-D9 (run 2; the legacy engine still renders).
- **D1** `src/lib/hall/` — pure, no three.js, 134 Vitest tests green. `import { ... } from '@/lib/hall'`:
  - `computeHallLayout(p: HallParams): HallLayout`; `HallParams = { length, width, height, bay?, foundation, panels, insulationMm }`.
    Any positive size works (non-integers, outside 8-20 too); throws `RangeError` on NaN / <= 0.
  - `HallLayout`: `frames[{index,z,isEnd}]`, `bayCount`, `bay`, `columns[{side,frame,x,z,baseY,topY,height}]`,
    `rafters[{side,frame,z,from,to,length}]`, `purlins[{side,index,x,y,zFrom,zTo}]`, `purlinsPerSide`, `eaveY`, `ridgeY`,
    `halfWidths{columnInner,columnAxis,columnOuter,wallInner,wallOuter,roofEdge}`, `panelThickness`, `walls`, `roof{left,right}`,
    `slab{w,l,centerX,centerZ,topY,thickness}`, `groundY`, `gutters`, `downpipes`, `bounds{min,max}`, `pitch` (rad), `params`.
  - **Walls (for E):** `layout.walls.front|back|left|right: WallDescriptor` = `{ key, id ('PereteFata'|'PereteSpate'|'PereteSTG'|
    'PereteDR'), origin, axisH, axisV, normal, yaw, spanH, spanV, apexV, thickness, polygon [h,v][], area, supports, supportHalfWidth }`.
    Exterior face; point = `wallPointToWorld(wall, h, v, out?)`; top limit = `wallHeightAt(wall, h)` (follows the gable).
    `supports` = h of each column axis behind the wall (frames on side walls, 2 columns on gables).
    h runs front->back on BOTH side walls (same as today's PlacementMarkers, saved openings keep their place); so the left
    wall is mirrored (axisH x axisV = -normal): orient meshes with `yaw`, not with a basis matrix.
  - Also: `HALL_LIMITS` + documented constants (`constants.ts`), `clampHallDimensions`, `parseHallUrlParams`, `computeSection`.
- **D10** dev only (absent from the production bundle: grep on `.next/static`):
  - URL: `/configurator?w=13.5&h=4&l=30&step=1` (clamped to HALL_LIMITS; applied once on mount).
  - `window.__hallStats = { triangles, drawCalls, frames, expectedFrames, purlinsPerSide, eaveY, ridgeY, renderFrame, engine,
    params:{w,h,l}, ready }`. Measured: triangles/drawCalls (gl.info, shadow pass included), frames, renderFrame.
    Targets from computeHallLayout: expectedFrames, purlinsPerSide, eaveY, ridgeY. Poll until `ready` and `params` match.
  - Legacy baseline: 12x4x12 = 3.35 M tris / 458 calls; 18x6x17 = 3 frames vs 4 expected (D-d); 13.5x4.5x102 = 15.8 M tris /
    2134 calls / 18 frames. The legacy model needs 30-120 s to load in a hidden browser pane.
- `ConfiguratorEngine` uses a `useShallow` selector (F8). `hardwareTier.ts` lint fixed; the 3 lint errors left are in the legacy
  `Configurator.tsx` / `LandingScene.tsx`, untouched until they are replaced (D2, D8).

## Decisions (conservative defaults; say if the business wants otherwise)
- **Width** = clear span between inner column faces (as in da.glb: 12 m = faces at +-6.00). **Height** = clear height: floor to
  rafter underside at the inner column face (da.glb frame = 6.0735). **Length** = first to last frame axis. Y = 0 = finished floor.
- Bays: `n = ceil(L / 6)`, `bay = L / n` (free lengths work; F may lift the 6 m snap once D2 lands). Pitch 10 deg.
  Purlins: max 1.6 m along the slope -> 12/15/18 m give 5/6/7 per slope (= old engine); 8-9 m: 4; 20 m: 8.
- Cladding grows outwards with insulation (30-250 mm); no panels: 40 mm sheet. Gables run full width, side walls between them.
- Slab: top at Y = 0, 0.2 m thick, 2 m apron; with a foundation the terrain is drawn at `groundY = -0.2` (column feet stay visible).

## Answers to ASSET_CONTRACT.md §6 (for C)
1. Width reference: **inner flange faces** (column axis = W/2 + 0.15; `columns[].x` is the axis).
2. Bolt sockets as child empties: **OK** (`pieceWorld x socketLocal` into one InstancedMesh).
3. Rafter anchor at the **bottom flange, eave end at the inner column face**: OK = `rafters[].from` (`to` = apex); rotate by `pitch`.
   Keep `EaveHaunch` height = 0.2585 (column top -> rafter bottom at the inner face) or tell me the real value.
4. Gutters/downpipes **in the kit**, but anchor `Gutter` on its inner top edge: D hangs it on the outer wall face (`gutters[].x,y`),
   which moves with insulation thickness. `Purlin` anchor (bottom-face centre) = `purlins[].x,y`.

## Handoffs
- E: build on `layout.walls` (drop `computePullMain`, 0.44 / 0.048 offsets). F: `HALL_LIMITS` for ranges; areas in `walls[].area`, `roof[].area`.
