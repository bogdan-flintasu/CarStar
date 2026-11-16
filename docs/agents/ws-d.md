# WS-D status (engine rewrite) — branches ws-d (part 1), ws-d2 (part 2)

## Done: D1-D10 and step 3 (legacy engine deleted). Nothing open in WS-D.
- **D1** `src/lib/hall/` pure layout: `computeHallLayout(p: HallParams): HallLayout` (+ `HALL_LIMITS`, `clampHallDimensions`,
  `wallPointToWorld`, `wallHeightAt`). Part 2 added `girtLevels`, `roof.*.plumbThickness`, `downpipes[].end`, and the
  downpipe now runs 0.292 m above the floor up to gutter − 0.0971 (kit contract).
- **D2/D5** `src/components/3d/hall/`: `Hall.tsx` (reads like a parts list) = `Steel.tsx` (`Frames`, `Purlins`, `Bolts`,
  `Rainwater`; one `KitInstances` InstancedMesh per kit piece) + `Walls.tsx` + `Roof.tsx` (`Roof`, `Slab`).
  `kit.ts` is the only file that knows `hall-kit.glb` (`useHallKit(detail)`; `light` = `_LOD1` meshes, no bolts).
  `placements.ts` (pure): `placeKit(layout)`, `placeBolts(placements, kit)`; tested against `assets/blender/kit_reference.json`
  (every source piece within 2 cm, same rotation). `Configurator.tsx` is deleted; all files < 120 lines.
- **D3** walls = E's `wallGeometryWithHoles` (real holes; `<WallOpenings layout realHoles />` wired), roof = extruded section. No clipping planes.
- **D4** `frameloop="demand"`; `Site.tsx` `Sun` fits the shadow camera to `layout.bounds`; AA via `gfx.antialias` (high/ultra).
- **D6** textures/materials built in memos and disposed on unmount (`materials.ts`); lint: 0 errors in the repo.
- **D7** `CameraRig.tsx`: frames the hall on load and on `requestHallFraming()` (`framing.ts`); otherwise camera + orbit target
  glide with the hall centre (user orbit/zoom/pan kept).
- **D8** `LandingScene.tsx` = `<Hall>` with a fixed 12 x 5 x 36 layout, renders on scroll only. **D9** `DimensionLines` reads the
  layout (L, clear width, H, ridge "Coamă", bay "Pas").
- **D10** dev hooks: `?w=&h=&l=&step=`, `window.__hallStats`, plus `window.__hallSet('?w=20&l=102')` (no reload) and
  `window.__hallAdvance()` (renders one frame: needed in hidden tabs, where requestAnimationFrame never fires).
## Verified (numbers from `__hallStats`; main pass only, three resets `gl.info` after the shadow pass)
- Matrix W {8,9,12,13,13.5,15,17,18,20} x H {3,4,4.5,5,6} at L 12, and L {12,17,18,48,102}, clad and bare: 100/100 have
  frames = expected. 12x4x12: 28.7 k tris / 23 calls (was 3.35 M / 458). 13.5x4.5x102: 18 frames, 180 k tris / 22 calls
  (was 15.8 M / 2134). Untouched for 3 s: 0 frames rendered. Dev hooks absent from `.next/static`. tsc, lint (0 errors),
  318 tests, build green. Screenshots: bare 12x4x12 and 13.5x4.5x30, clad 12x4x12 and 18x6x48, landing.
## Decisions (conservative; say if the business wants otherwise)
- Width = clear span between inner column faces; height = clear height under the rafter at the column; pitch 10 deg; bays
  `ceil(L/6)` equal; purlins max 1.6 m apart on the slope (12/15/18 m -> 5/6/7 per side, as the old engine).
- Shadows: the outermost visible shell casts (cladding when shown, steel when it is hidden); the slab only receives.
- No camera-distance LOD: the full kit is 180 k tris at 102 m, so `_LOD1` is used only on the `low` tier and on the landing
  page for `low`/`medium`.
- Look: steel keeps the old plain metal colour (normal + roughness maps only; the old engine never applied the colour map).
  Cladding metalness 0.35 instead of the asset's 1 (fully metallic walls render almost black). Slab plain grey in the
  configurator (as before), concrete maps on the landing page.
- A reset or loaded configuration (more than one dimension changing in one store update) reframes the camera.
## Handoffs
- **Orchestrator/C**: `public/models/da-draco.glb` is no longer referenced by any code: it can be deleted. C: consider
  `Panel` metallicFactor ~0.35 in the GLB so `PANEL_METALNESS` in `materials.ts` can go.
- **F**: call `requestHallFraming()` (`@/components/3d/hall/framing`) in `ConfigHeader.handleReset`; today a reset from the
  default size does not reframe. `gfx.landingFrameCount` is removed (was only used by the old landing scene).
- Not checked at full resolution (pane is ~760 px wide): shadow acne on cladding, roof texture scale; openings in the browser.
