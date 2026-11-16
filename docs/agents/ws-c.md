# WS-C — Blender model & asset pipeline (branch `ws-c`)

## Done (run 1)
- **C0** `scripts/blender/00_import_inventory.py` → `industrial-configurator/assets/blender/inventory.json`
  (190 objects, 1,610,600 tris, 1 material, 0 images — matches §4.1). `.blend` → `~/CarStar-assets/hala_import.blend`.
- **C4a** `industrial-configurator/public/models/ASSET_CONTRACT.md` **draft v0.1 — WS-D please review** (§6 has 4 open questions).
- **C1** `01_bolts.py`: 74 bolt objects (`surub*`, `surub_sus*`, `suruburi_grinzi*`, `suruburi_perete*`) → 104 instances
  of ONE `Bolt` mesh (56 tris, linked duplicates `Bolt.<family>.<NNN>`). Bolt tris 1,231,795 → 5,824. Per-bolt data:
  `assets/blender/bolts.json` (glTF coords, pos/quat/scale). Out: `~/CarStar-assets/hala_c1_bolts.blend`.
- **C2** `02_strip_cladding.py`: removed PereteFata/Spate/DR/STG, AcoperisDR/STG, beton. Frame = 63,305 tris
  (44 k of it = 2 gutters `jgheabSTG/DR`, to be remodelled in C3). Out: `~/CarStar-assets/hala_c2_frame.blend`.
- Review tools: `90_preview.py` (Workbench renders, fixed 3 m cameras), `91_contact_sheet.py` (before|after sheet).
  Before/after at 3 m (base, haunch, ridge, purlin, overall): visually equivalent.

## Pipeline (run from `industrial-configurator/`, B=/Applications/Blender.app/Contents/MacOS/Blender)
1. `$B -b -P scripts/blender/00_import_inventory.py`
2. `$B -b ~/CarStar-assets/hala_import.blend -P scripts/blender/01_bolts.py`
3. `$B -b ~/CarStar-assets/hala_c1_bolts.blend -P scripts/blender/02_strip_cladding.py`

## Decisions
- No git-lfs: all `.blend`/previews live in `~/CarStar-assets/` (outside git); only small JSON + scripts committed.
- Headless Workbench renders used for visual review instead of the live MCP GUI (deterministic, scripted, no GUI state).
- Bolt = symmetric (head + shank + nut) so head/nut side never matters; per-instance scale ≈ 1 (len 0.047–0.094 m).
- Note: `suruburi_laterale*` / `suruburi_sus*` are plates/cleats, not bolts — kept as steel.
- `coltar_acoperis` (ridge flashing) kept in the frame for now; becomes optional `RidgeCap` in C3.
- Kit pieces mirror by 180° rotation about Y, never negative scale (InstancedMesh-safe).

## Exported interfaces
- `public/models/ASSET_CONTRACT.md` (draft): node names, anchors, axes, reference dims (pitch 10.0°, bay 6 m, …).
- `assets/blender/inventory.json`, `assets/blender/bolts.json`.

## Handoffs
- **WS-D**: review ASSET_CONTRACT.md draft; answer §6 in `docs/agents/ws-d.md`. Kit GLB `hall-kit.glb` comes in run 2.
- **WS-A**: gates fail on base commit, not on WS-C files: `tsc` (missing `@/generated/prisma`, duplicate
  `setHoveredWallId`), `lint` 13 errors, `build` (module not found `@/generated/prisma`). WS-C adds only .py/.json/.md.

## Not done (run 2)
C3 kit pieces + bolt sockets, C5 materials, C6 `scripts/optimize-model.mjs` (meshopt) → `public/models/hall-kit.glb`, C7.
