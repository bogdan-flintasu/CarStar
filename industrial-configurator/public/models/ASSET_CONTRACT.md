# Hall kit asset contract — v1.0 (WS-C → WS-D)

Status: **final for `hall-kit.glb`** (C3–C7). Matches the shipped file exactly; `scripts/optimize-model.mjs` fails the
build of the GLB if node names, identity TRS, socket counts, materials, size or triangle budgets drift from this file.
Owner: WS-C. WS-D answers to v0.1 §6 (`docs/agents/ws-d.md`) are applied (see §8).
Ground truth for placements: `assets/blender/kit_reference.json` (every source object re-fitted with the kit; glTF TRS + error).

## 1. File and loading

| Item | Value |
|------|-------|
| Shipping file | `public/models/hall-kit.glb` (~165 KB). `da-draco.glb` stays until WS-D switches. |
| Compression | `EXT_meshopt_compression` + `KHR_mesh_quantization` (both required; **normals only** are int8). POSITION and TEXCOORD_0 stay float32, so geometry is in true metres and no node carries a dequantization transform. |
| Load | `const { nodes, materials } = useGLTF('/models/hall-kit.glb', false, true)` (drei: no Draco, meshopt decoder). |
| Units / axes | metres; glTF/three.js **+Y up**, **+X across the width** (left/STG = −X, right/DR = +X), **Z along the length**. |
| Node rules | Every piece is a **root node**, `translation 0, rotation 0, scale 1`, one mesh with the **same name** as the node, one primitive. Geometry sits around the anchor in §2. |
| Authoring side | Pieces are authored for the **LEFT (−X) side**. Right side = rotate the piece **180° about Y** about its own origin. Never negative scale. |
| Triangles | 10,840 per complete frame incl. 84 bolts (LOD0); 2,402 for `_LOD1` (§6). Budget ≤ 60 k. |

three.js rotations used below (Euler order XYZ): `I=(0,0,0)`, `RY180=(0,π,0)`, `RX180=(π,0,0)`, `RZ180=(0,0,π)`.

## 2. Pieces

"Stretch" = the axis WS-D scales; the piece is exactly 1 m long on it (the section is never scaled). Tris = LOD0.

| Node | Anchor (local origin) | Stretch | Tris | Bolt sockets | Source |
|------|-----------------------|---------|------|--------------|--------|
| `Column` | base centre: column axis, bottom of the steel | +Y | 135 | — | `stalp_1` |
| `BasePlate` | plate bottom (y=0, ground) on the column axis | — | 130 | 8 | `baza_stalp`, stiffeners |
| `EaveHaunch` | column axis at the column top | — | 693 | 12 | cap plates, column extension, haunch, knee plates, top girt cleat |
| `Rafter` | eave end of the **bottom flange** (E); +X along the bottom flange | +X | 108 | — | `stalp_sus_1` |
| `RidgeJoint` | apex A = meeting point of both bottom-flange lines | — | 150 | 8 | apex plates + stiffeners |
| `Purlin` | seat point: centre of the purlin's bottom face, start end; runs +Z | +Z | 35 | — | `Grinda003` |
| `PurlinCleat` | the purlin seat point in the frame plane | — | 33 | 4 (`side` ±Z) | `suruburi_laterale004` |
| `GirtCleat` | outer column flange face, bottom of the angle, frame plane; points −X | — | 76 | 2 | `suruburi_laterale` + `ureche008` |
| `Gutter` | **inner top edge** (building side), start end; runs +Z | +Z | 172 | — | `jgheabSTG*` (section re-fitted, 0.110 × 0.054) |
| `GutterEndCap` | gutter **centreline**, top, at the gutter end (cap lies at local z −0.005…+0.001) | — | 214 | — | `capat__gheabSTG` |
| `Downpipe` | bottom centre | +Y | 100 | — | `burlan` (Ø 0.05) |
| `DownpipeShoe` | top centre (= `Downpipe` bottom); elbow points +Z | — | 241 | — | `Cylinder004` |
| `DownpipeOutlet` | bottom centre (= `Downpipe` top) | — | 100 | — | `capat_burlanSTG` |
| `RidgeCap` | apex, bottom of the flashing, start end; runs +Z (optional) | +Z | 30 | — | `coltar_acoperis` |
| `Bolt` | bolt centre, axis +Y; length 0.08, head circumradius 0.018 | — | 56 | — | C1 template |
| `PanelSwatch`, `ConcreteSwatch` | 1 m unit quads (XY / XZ) that carry the `Panel` / `Concrete` materials. Don't render. | — | 2 | — | — |

Every piece except `Bolt` and the swatches also has a `<Piece>_LOD1` twin (§6). Node extras: `kit_anchor` (text),
`kit_stretch` (`"X"|"Y"|"Z"|""`), and `kit_lod_of` on the LOD twins.

**Bolt sockets.** Child empties `<Piece>_BoltSocket_NN` (NN from 00), extras `{ kit_socket: "Bolt" }`. Their local TRS
includes a near-1 non-uniform scale (the measured bolt size). Render all bolts as one `InstancedMesh` of `nodes.Bolt.geometry`:
`instanceMatrix = pieceWorldMatrix × socket.matrix` (local matrix; the template pieces sit at the identity).
`PurlinCleat` sockets carry `side: "-Z" | "+Z"` in **local** space: the pair that bolts the purlin of the bay on that side.
On interior frames draw all 4. On an end frame draw only the pair whose side, after the instance rotation, faces the
existing bay (`RY180` swaps them).

## 3. Placement (source frame numbers; WS-D's layout maps W/H/L onto them)

Source: width between inner column faces 12.0 (W, WS-D reference), frame at z = 0, bay 6 m. All values are in m, left side.
For the right side mirror x and add `RY180`. `p` = pitch = **10.0°** (measured 10.003°).

| Piece | Position | Rotation / scale |
|-------|----------|------------------|
| Column axis | x = −(W/2 + **0.1502**) (inner face → axis; the column is 0.30 deep along X, flange 0.15 along Z) | — |
| `BasePlate` | (axis, 0, z_frame) | I |
| `Column` | (axis, **0.02**, z_frame) | I; scale.y = column top − 0.02 (source 5.795) |
| `EaveHaunch` | (axis, column top, z_frame) (source column top 5.815) | I |
| Rafter E | E = haunch anchor + (**0.1492**, **0.2585**) = inner column face at the rafter underside. **Confirmed: EaveHaunch height = 0.2585** (column top 5.815 → rafter bottom 6.0735 at the inner face). So column top = clear height − 0.2585. | left (0,0,p); right (0,π,p) |
| `Rafter` | at E | scale.x = \|A − E\| (source 6.0877) |
| `RidgeJoint` | A = (0, E.y + (0 − E.x)·tan p) (source 7.1309) | I |
| Purlin seat P | P.y = E.y + (P.x − E.x)·tan p + **0.3046** (rafter depth, vertical) + **0.0014**. Source seats along the flange from E: −0.237, 1.324, 2.866, 4.406, 5.980 (≈ 1.54 m pitch; the first sits over the haunch, the last next to the apex) | — |
| `PurlinCleat` | (P.x, P.y, z_frame) | left I; right RY180 |
| `Purlin` | left (P.x, P.y, bay start z); right (mirrored x, P.y, bay **end** z) | left I; right RY180; scale.z = bay length |
| `GirtCleat` | (axis − 0.1502, y, z_frame). Source anchors y = 0.3122 (I), 1.8429 (RX180), 3.7658 (I), 5.5608 (RX180), i.e. ears alternate below/above | left I / RX180 (ear above); right RY180 / RZ180 (ear above) |
| `Gutter` | inner top edge = haunch anchor + (**−0.3123**, **+0.5886**) = E + (−0.4615, +0.3301). z from (first frame − **0.1388**) to (last frame + **0.1547**) | left I, start at the back end; right RY180, start at the front end; scale.z = gutter length |
| Gutter centreline | inner edge − **0.0551** outward (section 0.1102 wide × 0.0539 high) | — |
| `GutterEndCap` | (gutter centreline, gutter anchor y, gutter end z) | front I; back RY180 (both sides) |
| `Downpipe` | (gutter centreline, **0.292** above the floor, front frame + 0.0977 / back frame − 0.0817) | front I; back RY180; scale.y = top − 0.292, top = gutter anchor y − **0.0971** (source 6.0144) |
| `DownpipeShoe` / `DownpipeOutlet` | downpipe bottom / top | same as the downpipe |
| `RidgeCap` | A + (0, **0.4063**) (sits on the source roof panels: depends on WS-D's panel build-up), z from the gutter start | I; scale.z = length |

Source asymmetries (source centre x = +0.0048): the right base plate is 0.58 wide (left 0.56), and the right column axis is
at +6.1498. WS-D should use the symmetric left values.

## 4. Not in the asset (WS-D generates)

Walls (end + side), roof panels and the concrete slab (C2). Use flat boxes / gable `ShapeGeometry` with the `Panel` and
`Concrete` materials (§5). No clipping planes.

## 5. Materials (C5)

| Material | Used by | Factors (glTF) | Maps (in material `extras`, paths under `public/`) |
|----------|---------|----------------|----------------------------------------------------|
| `Steel` | every kit mesh incl. `Bolt` | base white, metallic 1, roughness 1 (= the old `Material_0`, so the look is unchanged); `doubleSided: true` | `map`, `normalMap`, `roughnessMap`, `metalnessMap` → `/metal/metal_*.webp` |
| `Panel` | `PanelSwatch` (for procedural walls/roof) | white, metallic 1, roughness 1 (the old walls used `Material_0` + maps) | `map`, `normalMap`, `roughnessMap` → `/wall/wall_*.webp` |
| `Concrete` | `ConcreteSwatch` (for the slab) | #8a8a8a, metallic 0, roughness 0.9 (= the old `beton` material) | `map`, `normalMap`, `roughnessMap` → `/concrete/concrete_*.webp` |

Textures are **not embedded** (they are already in `public/`, and this keeps the GLB small). WS-D attaches them once
to `materials.Steel` / `Panel` / `Concrete` (set `map.colorSpace = SRGBColorSpace`), and never creates materials by mesh name.
UVs (TEXCOORD_0) are box-projected, **1 UV unit = 1 m** at the source size, so stretch pieces scale their UVs along the stretch axis.

## 6. LOD (C7)

`<Piece>_LOD1` = same anchor, stretch and placement as `<Piece>`, no sockets: limited-dissolve 20° (+ 50 % collapse on
fixed pieces). Use it for frames more than about 20 m from the camera (drei `<Detailed distances={[0, 20]}>` per frame,
or switch per frame group), and **draw no bolts** for LOD1 frames. Frame: 10,840 → 2,402 tris. Max deviation from LOD0 is
15.5 mm (`PurlinCleat`), which is sub-pixel at 20 m.

## 7. Known deviations (measured, `kit_reference.json` → `err_mm` [max, p95])

- Right `EaveHaunch` and two of the four `GirtCleat`s per side: the small girt "ear" plate (and its 2 bolts) lands on the
  other side of the frame plane (z mirrored, ≤ 73 mm). The source mirrors these in X, and a rotation cannot reproduce that.
  They are hidden by the side walls. All other pieces fit within 0–4 mm (right base plate 10.5 mm, a source asymmetry).
- `Rafter`: the plumb end cuts are stretched with `scale.x`, which shifts them by ≤ 0.053 × |scale.x/6.09 − 1| m. That is ≤ 35 mm
  at W = 20, and it stays inside the haunch and ridge plates.
- `Gutter`: section re-fitted from the 22 k-tri source (16-segment half-round + rim beads), ≤ 3.9 mm.

## 8. Decisions (WS-D answers, `docs/agents/ws-d.md`)

1. Width = inner flange faces; column axis = W/2 + 0.1502. 2. Bolt sockets as child empties. 3. Rafter anchor E on the
bottom flange at the inner column face; EaveHaunch height 0.2585 **confirmed**. 4. Gutters/downpipes in the kit; `Gutter`
anchored on its **inner top edge**.
Changes vs draft v0.1: pieces authored for the left side (not the right); socket names `<Piece>_BoltSocket_NN` (globally
unique); `Rafter` normalised by |A − E|; `Purlin`/`PurlinCleat` share the seat point; new `DownpipeOutlet`, swatches, `_LOD1`.

## 9. Reproduce

From `industrial-configurator/` (B = `/Applications/Blender.app/Contents/MacOS/Blender`; `.blend` files live in `~/CarStar-assets/`):
`00_import_inventory.py` → `01_bolts.py` → `02_strip_cladding.py` (see `docs/agents/ws-c.md`), then
`$B -b ~/CarStar-assets/hala_c2_frame.blend -P scripts/blender/03_kit.py` (→ `hall-kit.raw.glb`, `kit_reference.json`),
`node scripts/optimize-model.mjs` (→ `public/models/hall-kit.glb`, verified), and optionally
`$B -b -P scripts/blender/04_kit_assemble.py [-- --lod 1]` + `90_preview.py` / `91_contact_sheet.py` for the visual check.
