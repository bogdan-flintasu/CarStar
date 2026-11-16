# WS-C — Blender model & asset pipeline (part 1 `ws-c`, part 2 `ws-c2`)

## Done
- **C0/C1/C2** (run 1): inventory (1.61 M tris), one 56-tri `Bolt` (104 per frame), cladding/slab stripped (frame 63 k tris).
- **C3** `03_kit.py`: 14 kit pieces + `Bolt`, authored for the LEFT side, root nodes with identity TRS, anchors per contract,
  stretch pieces 1 m. 54 source instances re-fitted → `assets/blender/kit_reference.json` (glTF TRS, err_mm, constants).
  Fit 0–4 mm (exceptions in contract §7). Bolt sockets `<Piece>_BoltSocket_NN` (84 bolts/frame, predicted vs measured ≤ 15 mm except the girt ears).
- **C5** materials `Steel` (all kit meshes), `Panel`, `Concrete` (+ swatch quads); factors = the old look; texture paths in material extras; box UVs (1 UV = 1 m).
- **C6** `scripts/optimize-model.mjs` → `public/models/hall-kit.glb` **165 KB**, 10,840 tris/frame (was 1.52 M), validator clean.
  Pinned `pnpm dlx @gltf-transform/cli@4.5.1`. This file is also loaded as the CLI `--config` (custom `kit` command), so no package.json change.
  It verifies the contract (node names, identity TRS, sockets, materials, bounds unchanged, size, tris) and exits 1 on drift.
- **C7** `<Piece>_LOD1` twins (2,402 tris/frame, ≤ 15.5 mm deviation), and no bolts on LOD1 frames.
- **C4** `public/models/ASSET_CONTRACT.md` **v1.0** = shipped file. WS-D §6 answers applied.
- Check: `04_kit_assemble.py` rebuilds the source frame from the SHIPPING GLB (Blender imports meshopt) → 90/91 renders:
  orig vs kit at 3 m are visually equivalent (`~/CarStar-assets/previews/sheet_orig_c3.png`, `sheet_c3_lod1.png`). Pipeline is byte-deterministic.

## Pipeline (from `industrial-configurator/`, B=/Applications/Blender.app/Contents/MacOS/Blender)
1. `$B -b -P scripts/blender/00_import_inventory.py`
2. `$B -b ~/CarStar-assets/hala_import.blend -P scripts/blender/01_bolts.py`
3. `$B -b ~/CarStar-assets/hala_c1_bolts.blend -P scripts/blender/02_strip_cladding.py`
4. `$B -b ~/CarStar-assets/hala_c2_frame.blend -P scripts/blender/03_kit.py` → `~/CarStar-assets/hall-kit.raw.glb`
5. `node scripts/optimize-model.mjs` → `public/models/hall-kit.glb` (+ JSON summary)
6. optional: `$B -b -P scripts/blender/04_kit_assemble.py [-- --lod 1]`, then `90_preview.py --tag c3`, `91_contact_sheet.py`

## Decisions
- **POSITION is not quantized**: KHR_mesh_quantization would put a dequant TRS on every node, which breaks "identity TRS + metres". Normals are int8, UVs float.
- Textures not embedded (already in `public/`); Steel `doubleSided` kept as in the source.
- Gutter rebuilt from a fitted section (the 22 k-tri source is non-manifold); `GutterEndCap`/downpipe parts anchored on the gutter centreline (x-symmetric, so front/back = RY180).
- Girt "ear" plates: the source mirrors them; with rotations only they land on the other z side (≤ 73 mm, hidden by walls). Accepted, see contract §7.
- `RidgeCap` kept optional (its height depends on WS-D's roof build-up).

## Exported interfaces
- `public/models/hall-kit.glb`, `public/models/ASSET_CONTRACT.md` v1.0 (placement table §3, materials §5, LOD §6).
- `assets/blender/kit_reference.json` (ground-truth TRS of every piece for the 12 m source frame: test computeHallLayout against it).
- `scripts/optimize-model.mjs` exports `KIT_NODES`, `LOD1_OF`.

## Handoffs
- **WS-D**: confirmed **EaveHaunch height 0.2585** (column top → rafter underside at the inner face; E = haunch anchor + (0.1492, 0.2585)).
  `Gutter` anchor = inner top edge = haunch anchor + (−0.3123, +0.5886). Load with `useGLTF(url, false, true)`; apply the textures to `materials.*` once.
- **WS-A**: nothing needed (no new dependency). The lint errors left (3) are in D/F app files.
