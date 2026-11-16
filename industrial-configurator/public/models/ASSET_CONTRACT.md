# Hall kit asset contract — DRAFT v0.1 (WS-C → WS-D)

Status: **draft for WS-D review** (C4a). Final names/values are frozen in C4 after WS-D sign-off.
Owner: WS-C. Source of truth for numbers: `assets/blender/inventory.json` (C0, measured from `da.glb`).
Reproduce: `scripts/blender/00_*.py … 0N_*.py` against `~/CarStar-assets/da.glb` (no `.blend` in git).

## 1. File and loading

| Item | Value |
|------|-------|
| Shipping file | `public/models/hall-kit.glb` (part 2 of WS-C; `da-draco.glb` stays until WS-D switches) |
| Compression | `EXT_meshopt_compression` + `KHR_mesh_quantization` (no Draco). drei: `useGLTF(url, false, true)` |
| Budget | ≤ 1 MB file; ≤ 60 k triangles for one complete frame incl. bolts |
| Units / axes | metres; glTF/three.js: **+Y up**, **+X across the width** (left/STG = −X, right/DR = +X), **Z along the length** |
| Node rules | every piece is a **root node**, `translation 0, rotation 0, scale 1`, one mesh, English PascalCase name, no numeric suffixes. Its geometry is placed relative to the anchor below. |
| Mirroring | All pieces are symmetric about their own XY plane, so the **left-side** copy = right-side piece rotated **180° about Y**. Never use negative scale (InstancedMesh does not fix winding). |

## 2. Pieces (planned for C3; names are the contract)

Anchor = the piece's local origin. "Length axis" is the axis WS-D scales to stretch the piece; the cross-section is never scaled.

| Node | What (source objects) | Anchor (local origin) | Length axis / unit | Section (measured) |
|------|----------------------|------------------------|--------------------|--------------------|
| `Column` | I-column (`stalp_1/2`) | base centre (bottom of the steel, = top of base plate) | +Y, 1 m | depth 0.30 along X, flange 0.15 along Z |
| `Rafter` | I-rafter (`stalp_sus`, `stalp_sus_1`) | eave end, **bottom flange** at the rafter's centre plane (z = 0) | +X, 1 m along the rafter axis; WS-D rotates about Z by `pitch` | depth 0.30, flange 0.15 |
| `EaveHaunch` | haunch + column cap + end plates (`stalp_sus001`, `prelungire_stalp`, `suruburi_sus*`, `aripioara_*sus*`) | column axis at column top (top of `Column`) | fixed size, not scaled | — |
| `RidgeJoint` | apex plates + stiffeners (`plane_sus_1/2`, `plane_inclinat*`, `aripioara_sus`, `aripioara_mijloc_1`, …) | apex on the rafter bottom-flange line, x = 0 | fixed size (valid for the fixed pitch only) | — |
| `BasePlate` | plate + stiffeners (`baza_stalp*`, `aripioara_sustinere*`) | plate bottom centre (ground, y = 0) | fixed | 0.56 (X) × 0.02 (Y) × 0.40 (Z) |
| `Purlin` | purlin (`Grinda*`) | start end, centre of the purlin's bottom face | +Z, 1 m | ≈ 0.106 (X) × 0.10 (Y) |
| `PurlinCleat` | angle cleat on rafter top (`suruburi_laterale004…017`) | centre of the cleat's bottom face (on rafter top) | fixed; rotate by `pitch` like the rafter | — |
| `GirtCleat` | small cleat on column side (`ureche*`, `suruburi_laterale000…012`) | centre of its bottom face, column side | fixed | 0.12 × 0.06 × 0.073 |
| `Gutter` | eave gutter (`jgheab*`, `jgheab*_prelungire`) | start end, gutter inner bottom on the outer column line | +Z, 1 m | ≈ 0.11 × 0.054 |
| `GutterEndCap` | (`capat_jgheab*`) | centre of the cap | fixed | — |
| `Downpipe` | (`burlan*`) | bottom centre | +Y, 1 m | Ø ≈ 0.05 |
| `DownpipeShoe` | bottom elbow (`Cylinder002…005`, `capat_burlan*`) | top centre (joins `Downpipe` bottom) | fixed | — |
| `RidgeCap` | ridge flashing (`coltar_acoperis`) | apex, start end | +Z, 1 m | — (optional; may be generated with the roof) |
| `Bolt` | **one** low-poly bolt (C1, 56 tris) | bolt centre | axis +Y; nominal length 0.08, head circumradius 0.018 | hex head + 8-sided shank + hex nut |

**Bolt sockets.** Every joint piece (`BasePlate`, `EaveHaunch`, `RidgeJoint`, `PurlinCleat`, `GirtCleat`) gets child
**empties** `BoltSocket_00…NN` (local transforms incl. a near-1 non-uniform scale). WS-D renders all bolts as one
`InstancedMesh` of `Bolt`: `instanceMatrix = pieceWorldMatrix × socketLocalMatrix`. Bolt positions therefore come from
the asset, never from code. (Current per-bolt data, world-space in the original frame: `assets/blender/bolts.json`.)

## 3. Not in the asset (WS-D generates procedurally)

Walls (end + side), roof panels and the concrete slab were removed in C2 (they are sized by L/W/H; end walls were
113 k triangles of modelled corrugation). Use flat boxes / gable `ShapeGeometry` with `public/wall/*` (normal map gives
the corrugation) and `public/concrete/*`. No clipping planes needed.

## 4. Reference geometry of the source frame (for `src/lib/hall/constants.ts`)

Measured in C0 (`inventory.json`); the source is a 12 m wide, one-bay (6 m) model with the frame at z = 0.

| Quantity | Source value | Note |
|----------|-------------|------|
| Roof pitch | **10.0°** (purlin seats rise 1.08 m over 6.12 m; purlin-bolt axes tilt 10.2°) | fixed; ridge = eave + (W/2)·tan(pitch) |
| Column grid | inner flange faces at x = ±6.00, outer at ±6.29, axis ±6.14 | the nominal 12 m matches the **inner faces** — WS-D decides the width reference |
| Column top / eave stack | column steel 0.02 → 5.815; cap plates 5.815–5.845; extension to 6.07; rafter bottom at the inner face y = 6.0735 | eave height in the UI (5 m?) vs 5.815 m steel: WS-D maps this |
| Ridge | rafter top at apex y ≈ 7.43 | — |
| Purlins | 5 per side, seats at x ≈ ±0.09, ±1.64, ±3.16, ±4.68, ±6.22 (≈ 1.55 m along the slope) | WS-D: `ceil(rafterLen / maxSpacing) + 1` |
| Bay | 6.0 m (purlins span z 0 → −6) | — |
| Base plate | 0.56 × 0.40 × 0.02, bottom at y = 0 | — |
| Gutters / downpipes | gutter at x ≈ ±6.51, y ≈ 6.35–6.40; downpipes only at the 4 corners | — |

## 5. Materials (C5, planned)

`Steel` (metallic, `public/metal/*`), `Panel` (`public/wall/*`), `Concrete` (`public/concrete/*`). Kit meshes use
`Steel`; WS-D reads `Panel`/`Concrete` from the GLB for procedural meshes instead of creating materials by mesh name.

## 6. Open questions for WS-D (answer in `docs/agents/ws-d.md`)

1. Width reference: inner flange faces (source) or column axes?
2. OK with bolt sockets as child empties (§2), or prefer a flat `bolts[]` list in `extras`?
3. Rafter anchor at the bottom flange (proposed) vs. the centreline?
4. Gutters/downpipes in the kit (proposed) or generated in code?
