"""C3 + C5 - Rebuild the steel frame as a parametric kit of unit pieces, with materials and bolt sockets.

Usage (from industrial-configurator/):
  Blender -b ~/CarStar-assets/hala_c2_frame.blend -P scripts/blender/03_kit.py -- \
      --out ~/CarStar-assets/hala_c3_kit.blend \
      --glb ~/CarStar-assets/hall-kit.raw.glb \
      --json assets/blender/kit_reference.json

What it does (all maths in glTF coords: +Y up, +X across the width, Z along the length):
  1. Each kit piece is built from the LEFT-side (STG, -X) source objects, translated so its anchor
     (public/models/ASSET_CONTRACT.md) is the origin; stretch pieces are normalised to 1 m along
     their length axis. Node TRS stays identity (translation 0, rotation 0, scale 1).
  2. Every source instance (left, right, front, back, each purlin ...) is re-fitted with the kit
     piece (rotation from {0, 180 deg about Y [, 180 deg about X]}, stretch scale), and the surface
     deviation source<->kit is measured with BVH trees -> kit_reference.json (ground truth for WS-D).
  3. Bolts (C1) become child empties `<Piece>_BoltSocket_NN` of the joint pieces; predicted bolt
     positions are checked against assets/blender/bolts.json.
  4. Materials Steel / Panel / Concrete (C5); Panel and Concrete ride on 1 m swatch quads so they
     survive export and pruning.
"""
import json
import math
import os
import sys

sys.dont_write_bytecode = True  # no __pycache__ in the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import _common as C  # noqa: E402

args = C.parse_args({
    "out": os.path.join(C.ASSETS_DIR, "hala_c3_kit.blend"),
    "glb": os.path.join(C.ASSETS_DIR, "hall-kit.raw.glb"),
    "json": "assets/blender/kit_reference.json",
    "bolts": "assets/blender/bolts.json",
    "gutter_bins": "16",
})

CG = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))  # Blender -> glTF
CGI = CG.inverted()
I3 = np.eye(3)
RY = np.diag([-1.0, 1.0, -1.0])   # 180 deg about Y (left <-> right, front <-> back)
RX = np.diag([1.0, -1.0, -1.0])   # 180 deg about X (girt cleat ear above / below)
ROTS = {"I": I3, "RY180": RY, "RX180": RX, "RZ180": RY @ RX}
BAY = 6.0                          # source bay (purlin length), m
SMOOTH_DEG = 30.0

# ── source sets ──────────────────────────────────────────────────────────────
HAUNCH_L = ["suruburi_sus", "suruburi_sus001", "prelungire_stalp", "stalp_sus_1001", "aripioara_laterala_sus",
            "plane_inclinat", "aripioara_sustinere_sus", "aripioara_sustinere_sus001", "aripa_lateral",
            "plane_aripioara001", "suruburi_laterale020", "ureche010"]
HAUNCH_R = ["suruburi_sus003", "suruburi_sus002", "prelungire_stalp001", "stalp_sus001", "aripioara_laterla_sus",
            "plane_inclinat003", "aripioara_sustinere_sus002", "aripioara_sustinere_sus003", "aripioara_lateral",
            "plane_aripioara", "suruburi_laterale019", "ureche004"]
BASE_L = ["baza_stalp"] + [f"aripioara_sustinere{s}" for s in ("", "001", "002", "003", "004")] + ["aripioarea_sustinere"]
BASE_R = ["baza_stalp001"] + [f"aripioara_sustinere{s}" for s in ("005", "006", "007", "008", "009")] + ["aripioarea_sustinere001"]
RIDGE = ["plane_sus_1", "plane_sus_2", "plane_inclinat001", "plane_inclinat002", "plane_inclinat004",
         "plane_inclinat005", "aripioara_sus", "aripioara_mijloc_1", "plane_drept_sus", "plane_sus_drept"]
GUTTER_L = ["jgheabSTG", "jgheabSTG_prelungire", "jgheab_spateSTG"]
GUTTER_R = ["jgheabDR", "jgheabDR_prelungire", "jgheab_spateDR"]
CLEATS = [f"suruburi_laterale{i:03d}" for i in (4, 5, 6, 7, 8, 13, 14, 15, 16, 17)]
GIRTS = [("suruburi_laterale", "ureche008"), ("suruburi_laterale001", "ureche007"),
         ("suruburi_laterale002", "ureche006"), ("suruburi_laterale003", "ureche005"),
         ("suruburi_laterale009", "ureche001"), ("suruburi_laterale010", "ureche002"),
         ("suruburi_laterale011", "ureche003"), ("suruburi_laterale012", "ureche009")]
PURLINS = {c: next(ch.name for ch in bpy.data.objects[c].children if ch.name.startswith("Grinda")) for c in CLEATS}


# ── geometry helpers (glTF space) ────────────────────────────────────────────
def src_geom(names):
    """Joined world-space geometry of source objects: (verts Nx3 glTF, faces [idx...])."""
    vs, fs = [], []
    for n in names:
        o = bpy.data.objects[n]
        m = CG @ o.matrix_world
        base = len(vs)
        vs += [(m @ v.co)[:] for v in o.data.vertices]
        fs += [[base + i for i in p.vertices] for p in o.data.polygons]
    return np.array(vs), fs


def bb(names, axis, rule):
    v = src_geom(names)[0][:, axis]
    return {"min": v.min(), "max": v.max(), "c": (v.min() + v.max()) / 2}[rule]


def to_bmesh(verts, faces):
    bm = bmesh.new()
    bv = [bm.verts.new(v) for v in verts]
    for f in faces:
        try:
            bm.faces.new([bv[i] for i in f])
        except ValueError:  # duplicate / degenerate face in the source soup
            pass
    bm.normal_update()
    return bm


def box_uv(bm):
    """Box projection in metres (1 UV unit = 1 m) by dominant face normal."""
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        ax = int(np.argmax(np.abs(f.normal[:])))
        a, b = [(1, 2), (0, 2), (0, 1)][ax]
        for lp in f.loops:
            lp[uv].uv = (lp.vert.co[a], lp.vert.co[b])


GL2BL_AXIS = {0: 0, 1: 2, 2: 1}  # glTF axis -> Blender axis (magnitude)


def apply_decimate(obj, steps):
    """Apply Decimate modifier steps [(\"DISSOLVE\", deg) | (\"COLLAPSE\", ratio)] to obj.data."""
    name = obj.data.name
    for mode, val in steps:
        mod = obj.modifiers.new("dec", "DECIMATE")
        mod.decimate_type = mode
        if mode == "DISSOLVE":
            mod.angle_limit = math.radians(val)
        else:
            mod.ratio = val
        dg = bpy.context.evaluated_depsgraph_get()
        new = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
        obj.modifiers.remove(mod)
        old = obj.data
        obj.data = new
        bpy.data.meshes.remove(old)
        new.name = name


def finish(obj):
    """Triangulate; smooth shading with sharp edges above SMOOTH_DEG."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.shade_smooth()
    obj.data.set_sharp_from_angle(angle=math.radians(SMOOTH_DEG))


def make_piece(name, verts_local, faces, stretch=None, decimate=None, extras=None):
    """verts_local: metres, anchor at origin (glTF). stretch = (axis, length) -> normalised to 1 m."""
    bm = to_bmesh(verts_local, faces)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    box_uv(bm)
    bm.transform(CGI)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    apply_decimate(obj, decimate or [])
    if stretch:
        ax, length = stretch
        s = [1.0, 1.0, 1.0]
        s[GL2BL_AXIS[ax]] = 1.0 / length
        obj.data.transform(Matrix.Diagonal((*s, 1.0)))
    finish(obj)
    for k, v in (extras or {}).items():
        obj[k] = v
    return obj


def piece_geom(obj):
    vs = np.array([(CG @ v.co)[:] for v in obj.data.vertices])
    fs = [list(p.vertices) for p in obj.data.polygons]
    return vs, fs


def affine(R, S, t):
    M = np.eye(4)
    M[:3, :3] = R @ np.diag(S)
    M[:3, 3] = t
    return M


def apply(M, V):
    return V @ M[:3, :3].T + M[:3, 3]


def surface_err(Va, Fa, Vb, Fb, n=4000):
    """Symmetric max / p95 distance (m) between two triangle soups (vertex -> nearest surface)."""
    def one(Vs, Vt, Ft):
        tree = BVHTree.FromPolygons([tuple(v) for v in Vt], Ft, epsilon=0.0)
        idx = np.linspace(0, len(Vs) - 1, min(n, len(Vs))).astype(int)
        d = [tree.find_nearest(Vector(Vs[i]))[3] for i in idx]
        return np.array([x if x is not None else 1e9 for x in d])
    d = np.concatenate([one(Va, Vb, Fb), one(Vb, Va, Fa)])
    return float(d.max()), float(np.percentile(d, 95))


def fit(tpl_obj, names, rots, stretch_axis=None):
    """Place the kit piece onto source objects: best rotation, stretch, translation (AABB match)."""
    T, Ft = piece_geom(tpl_obj)
    V, Fs = src_geom(names)
    best = None
    for rk in rots:
        R = ROTS[rk]
        Vb = V @ R            # rotate back: R^T v  (R symmetric/orthogonal, row form)
        S = [1.0, 1.0, 1.0]
        if stretch_axis is not None:
            S[stretch_axis] = (Vb[:, stretch_axis].max() - Vb[:, stretch_axis].min()) / \
                (T[:, stretch_axis].max() - T[:, stretch_axis].min())
        Ts = T * np.array(S)
        cb = (Vb.min(0) + Vb.max(0)) / 2
        ct = (Ts.min(0) + Ts.max(0)) / 2
        t = R @ (cb - ct)
        M = affine(R, S, t)
        err = surface_err(apply(M, T), Ft, V, Fs)
        if best is None or err[0] < best[1][0]:
            best = (rk, err, M, S)
    return best


def quat_xyzw(R):
    q = Matrix(R.tolist()).to_quaternion()
    return [round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)]


def r4(v):
    return [round(float(x), 4) for x in v]


# ── reference measurements ───────────────────────────────────────────────────
col_axis = bb(["stalp_1"], 0, "c")
col_top = bb(["stalp_1"], 1, "max")
col_bot = bb(["stalp_1"], 1, "min")
col_z = bb(["stalp_1"], 2, "c")
x0 = bb(["plane_sus_1", "plane_sus_2"], 0, "c")               # apex joint centre
x0_cols = (col_axis + bb(["stalp_2"], 0, "c")) / 2              # hall centre from column axes

RV, RF = src_geom(["stalp_sus_1"])
eave_end = RV[RV[:, 0] < RV[:, 0].min() + 0.02]
ridge_end = RV[RV[:, 0] > RV[:, 0].max() - 0.02]
E = eave_end[np.argmin(eave_end[:, 1])].copy()
Rb = ridge_end[np.argmin(ridge_end[:, 1])].copy()
pitch = math.atan2(Rb[1] - E[1], Rb[0] - E[0])
tp = math.tan(pitch)
E[2] = col_z
A = np.array([x0, E[1] + (x0 - E[0]) * tp, col_z])           # apex on the bottom-flange lines
sigma = float(np.linalg.norm(A - E))
# vertical depth of the rafter: top flange line above the bottom flange line (prism: end verts only)
d_vert = float((RV[:, 1] - (E[1] + (RV[:, 0] - E[0]) * tp)).max())

Rz = np.array([[math.cos(pitch), -math.sin(pitch), 0], [math.sin(pitch), math.cos(pitch), 0], [0, 0, 1]])

# ── build kit pieces ─────────────────────────────────────────────────────────
kit = {}
anchors = {}


def build_fixed(name, names, anchor, **kw):
    V, F = src_geom(names)
    a = np.array(anchor)
    anchors[name] = a
    kit[name] = make_piece(name, V - a, F, **kw)


def build_stretch(name, names, anchor, axis, **kw):
    V, F = src_geom(names)
    a = np.array(anchor)
    length = V[:, axis].max() - V[:, axis].min()
    anchors[name] = a
    kit[name] = make_piece(name, V - a, F, stretch=(axis, length), **kw)


ex = lambda anchor, stretch="": {"kit_anchor": anchor, "kit_stretch": stretch}  # noqa: E731

build_stretch("Column", ["stalp_1"], (col_axis, col_bot, col_z), 1,
              extras=ex("base centre (column axis, bottom of steel)", "Y"))
build_fixed("BasePlate", BASE_L, (col_axis, bb(["baza_stalp"], 1, "min"), col_z),
            extras=ex("plate bottom on column axis (ground)"))
build_fixed("EaveHaunch", HAUNCH_L, (col_axis, col_top, col_z), extras=ex("column axis at column top"))
# Rafter: local = Rz(-pitch) (v - E), x normalised by sigma = |A - E|
V, F = src_geom(["stalp_sus_1"])
anchors["Rafter"] = E
kit["Rafter"] = make_piece("Rafter", (V - E) @ Rz, F, stretch=(0, sigma),
                           extras=ex("eave end of the bottom flange; +X along the bottom flange", "X"))
build_fixed("RidgeJoint", RIDGE, tuple(A), extras=ex("apex of the rafter bottom-flange lines"))
g3 = PURLINS["suruburi_laterale004"]
seat = (bb([g3], 0, "c"), bb([g3], 1, "min"), bb([g3], 2, "min"))
build_stretch("Purlin", [g3], seat, 2, extras=ex("seat point: centre of the bottom face, start end", "Z"))
build_fixed("PurlinCleat", ["suruburi_laterale004"], (seat[0], seat[1], col_z),
            extras=ex("purlin seat point at the frame plane"))
gx_face = bb(["stalp_1"], 0, "min")
build_fixed("GirtCleat", list(GIRTS[0]), (gx_face, bb([GIRTS[0][0]], 1, "min"), col_z),
            extras=ex("outer column flange face, bottom of the angle"))
# WS-D (docs/agents/ws-d.md §6.4): gutter anchored on its INNER TOP edge (building side = +X for the
# left gutter), hung on the outer wall face, which moves with the insulation thickness.
gut = (bb(GUTTER_L, 0, "max"), bb(GUTTER_L, 1, "max"), bb(GUTTER_L, 2, "min"))

def gutter_profile(name, bins, slice_z=-3.0):
    """Fit the half-round gutter section from a slice of the (22k-tri, non-manifold) source mesh.

    Returns closed 2D loops (glTF x, y): the U-shaped wall (centreline +- t/2) and the two rim beads.
    """
    o = bpy.data.objects[name]
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.transform(CG @ o.matrix_world)
    cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                                 plane_co=(0, 0, slice_z), plane_no=(0, 0, 1))["geom_cut"]
    P = np.array([v.co[:2] for v in cut if isinstance(v, bmesh.types.BMVert)])
    bm.free()
    xmin, xmax, ymax = P[:, 0].min(), P[:, 0].max(), P[:, 1].max()
    bead_r = 0.003
    rim_y = ymax - bead_r
    cx = (xmin + xmax) / 2
    body = P[P[:, 1] < rim_y - bead_r]
    ang = np.degrees(np.arctan2(body[:, 1] - rim_y, body[:, 0] - cx)) % 360   # 180 (left) .. 360 (right)
    rad = np.hypot(body[:, 0] - cx, body[:, 1] - rim_y)
    edges_deg = np.linspace(180, 360, bins + 1)
    cl, th = [], []
    for k in range(bins + 1):
        a0 = edges_deg[k]
        m = np.abs(((ang - a0 + 180) % 360) - 180) < (180 / bins) * 0.75
        if m.sum() < 2:
            continue
        r = rad[m]
        th.append(np.percentile(r, 95) - np.percentile(r, 5))
        rm = (np.percentile(r, 95) + np.percentile(r, 5)) / 2
        cl.append((cx + rm * math.cos(math.radians(a0)), rim_y + rm * math.sin(math.radians(a0))))
    cl = np.array(cl)
    t = float(np.clip(np.median(th), 0.0015, 0.004))
    tang = np.gradient(cl, axis=0)
    nrm = np.stack([-tang[:, 1], tang[:, 0]], 1)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    wall = np.concatenate([cl + nrm * t / 2, (cl - nrm * t / 2)[::-1]])
    loops = [wall]
    for bx in (cl[0, 0], cl[-1, 0]):  # rolled rim beads on top of both wall ends
        loops.append(np.array([(bx + bead_r * math.cos(2 * math.pi * i / 6), ymax - bead_r + bead_r * math.sin(2 * math.pi * i / 6))
                               for i in range(6)]))
    return loops, t


def extrude(loops, z0, z1):
    V, F = [], []
    for lp in loops:
        n = len(lp)
        b = len(V)
        V += [(x, y, z0) for x, y in lp] + [(x, y, z1) for x, y in lp]
        F += [[b + i, b + (i + 1) % n, b + n + (i + 1) % n, b + n + i] for i in range(n)]
        F += [list(range(b + n - 1, b - 1, -1)), list(range(b + n, b + 2 * n))]
    return np.array(V), F


gloops, g_thick = gutter_profile("jgheabSTG", int(args["gutter_bins"]))
gV, gF = extrude(gloops, bb(GUTTER_L, 2, "min"), bb(GUTTER_L, 2, "max"))
anchors["Gutter"] = np.array(gut)
kit["Gutter"] = make_piece("Gutter", gV - np.array(gut), gF, stretch=(2, gV[:, 2].max() - gV[:, 2].min()),
                           extras=ex("inner top edge (building side), start end", "Z"))
# end cap and downpipe parts are x-symmetric about the gutter centreline: anchor them there so the
# front/back copies are a plain 180 deg Y rotation on either side
gut_cx = bb(GUTTER_L, 0, "c")
build_fixed("GutterEndCap", ["capat__gheabSTG"], (gut_cx, gut[1], bb(GUTTER_L, 2, "max")),
            extras=ex("gutter centreline, top, at the gutter end"))
dp = (bb(["burlan"], 0, "c"), bb(["burlan"], 1, "min"), bb(["burlan"], 2, "c"))
DRAIN = {  # measured now: the source objects are deleted before the report
    "downpipe_anchor_minus_gutter_anchor": r4(np.array(dp) - np.array(gut)),
    "downpipe_top_minus_gutter_anchor_y": round(bb(["burlan"], 1, "max") - gut[1], 4),
    "gutter_overhang_front_back": [round(bb(GUTTER_L, 2, "max") - col_z, 4), round(-BAY - bb(GUTTER_L, 2, "min"), 4)],
    "gutter_section_w_h": [round(bb(GUTTER_L, 0, "max") - bb(GUTTER_L, 0, "min"), 4),
                           round(bb(GUTTER_L, 1, "max") - bb(GUTTER_L, 1, "min"), 4)],
    "gutter_centreline_minus_anchor_x_left": round(gut_cx - gut[0], 4),
    "column_inner_face_minus_axis": round(bb(["stalp_1"], 0, "max") - col_axis, 4),
}
build_stretch("Downpipe", ["burlan"], dp, 1, extras=ex("bottom centre", "Y"))
build_fixed("DownpipeShoe", ["Cylinder004"], dp, decimate=[("COLLAPSE", 0.3)],
            extras=ex("top centre (= Downpipe bottom)"))
build_fixed("DownpipeOutlet", ["capat_burlanSTG"], (dp[0], bb(["burlan"], 1, "max"), dp[2]),
            extras=ex("bottom centre (= Downpipe top)"))
rc = (bb(["coltar_acoperis"], 0, "c"), bb(["coltar_acoperis"], 1, "min"), bb(["coltar_acoperis"], 2, "min"))
build_stretch("RidgeCap", ["coltar_acoperis"], rc, 2, extras=ex("apex, bottom of the flashing, start end", "Z"))

# Bolt: reuse the C1 template mesh (already centred, axis +Y)
bolt_me = next(o.data for o in bpy.data.objects if o.name.startswith("Bolt."))
bolt = bpy.data.objects.new("Bolt", bolt_me)  # mesh datablock is already named "Bolt"
bpy.context.scene.collection.objects.link(bolt)
bolt["kit_anchor"] = "bolt centre, axis +Y"
bolt["kit_stretch"] = ""
kit["Bolt"] = bolt

# ── fit every source instance ────────────────────────────────────────────────
INST = [("Column", ["stalp_1"], "Y"), ("Column", ["stalp_2"], "Y"),
        ("BasePlate", BASE_L, None), ("BasePlate", BASE_R, None),
        ("EaveHaunch", HAUNCH_L, None), ("EaveHaunch", HAUNCH_R, None),
        ("RidgeJoint", RIDGE, None),
        ("Gutter", GUTTER_L, "Z"), ("Gutter", GUTTER_R, "Z"),
        ("GutterEndCap", ["capat__gheabSTG"], None), ("GutterEndCap", ["capat_jgheabDR"], None),
        ("RidgeCap", ["coltar_acoperis"], "Z")]
INST += [("Purlin", [PURLINS[c]], "Z") for c in CLEATS] + [("PurlinCleat", [c], None) for c in CLEATS]
INST += [("GirtCleat", list(g), None) for g in GIRTS]
INST += [("Downpipe", [n], "Y") for n in ("burlan", "burlan_spateSTG.001", "burlanDR", "burlan_spateDR")]
INST += [("DownpipeShoe", [n], None) for n in ("Cylinder004", "Cylinder003", "Cylinder002", "Cylinder005")]
INST += [("DownpipeOutlet", [n], None) for n in
         ("capat_burlanSTG", "capat_burlan_spateSTG", "capat_burlanDR", "capat_burlan_spateDR")]
AX = {"X": 0, "Y": 1, "Z": 2}

instances = []
for piece, names, st in INST:
    # semantic rotations: left side unrotated, right side = 180 deg about Y (contract §1);
    # girt cleats may also be flipped 180 deg about X (ear above); x-symmetric drainage parts are free.
    side = "C" if piece in ("RidgeJoint", "RidgeCap") else ("L" if bb(names, 0, "c") < x0 else "R")
    if side == "C":
        rots = ["I"]
    elif piece in ("Downpipe", "DownpipeShoe", "DownpipeOutlet", "GutterEndCap"):
        rots = ["I", "RY180"]
    elif piece == "GirtCleat":  # names = (angle, ear); ear above the angle -> flipped about X
        above = bb([names[1]], 1, "c") > bb([names[0]], 1, "c")
        rots = [("RX180" if above else "I") if side == "L" else ("RZ180" if above else "RY180")]
    else:
        rots = ["I"] if side == "L" else ["RY180"]
    rk, (emax, e95), M, S = fit(kit[piece], names, rots, AX.get(st))
    instances.append({"piece": piece, "src": names, "side": side, "rot": rk, "M": M,
                      "err_mm": [round(emax * 1000, 1), round(e95 * 1000, 1)]})

# rafters: analytic placement (pitch rotation), then measured
T, Ft = piece_geom(kit["Rafter"])
for names, side in ((["stalp_sus_1"], "L"), (["stalp_sus"], "R")):
    V, Fs = src_geom(names)
    if side == "L":
        Ei, Ri = E, I3 @ Rz
    else:
        ee = V[V[:, 0] > V[:, 0].max() - 0.02]
        Ei = ee[np.argmin(ee[:, 1])].copy()
        Ei[2] = col_z
        Ri = RY @ Rz
    Ai = np.array([x0, Ei[1] + abs(Ei[0] - x0) * tp, col_z])
    M = affine(Ri, [float(np.linalg.norm(Ai - Ei)), 1, 1], Ei)
    emax, e95 = surface_err(apply(M, T), Ft, V, Fs)
    instances.append({"piece": "Rafter", "src": names, "side": side, "rot": "I" if side == "L" else "RY180", "M": M,
                      "err_mm": [round(emax * 1000, 1), round(e95 * 1000, 1)]})

# ── bolt sockets ─────────────────────────────────────────────────────────────
bolts = json.load(open(args["bolts"]))["bolts"]


def bolt_matrix(b):
    q = b["quat_xyzw"]
    R = np.array(Quaternion((q[3], q[0], q[1], q[2])).to_matrix())
    return affine(R, b["scale"], b["pos"])


def socket_sets(piece, names):
    """Bolts belonging to a source instance -> list of (side, world 4x4)."""
    if piece == "PurlinCleat":
        g = PURLINS[names[0]]
        out = []
        for b in bolts:
            if b["parent"] == g:
                near = abs(b["pos"][2] - col_z) < 0.5
                M = bolt_matrix(b)
                if not near:            # far-end pair belongs to the next frame's cleat: shift by one bay
                    M[2, 3] += BAY
                out.append(("-Z" if near else "+Z", M))
        return out
    return [("", bolt_matrix(b)) for b in bolts if b["parent"] in names]


SOCKET_TPL = {"BasePlate": BASE_L, "EaveHaunch": HAUNCH_L, "RidgeJoint": RIDGE,
              "PurlinCleat": ["suruburi_laterale004"], "GirtCleat": list(GIRTS[0])}
sockets = {}
for piece, names in SOCKET_TPL.items():
    Linv = np.eye(4)
    Linv[:3, 3] = -anchors[piece]
    lst = sorted(socket_sets(piece, names), key=lambda s: (s[0], *np.round(s[1][:3, 3], 3)))
    sockets[piece] = []
    for i, (side, Mw) in enumerate(lst):
        Ml = Linv @ Mw
        e = bpy.data.objects.new(f"{piece}_BoltSocket_{i:02d}", None)
        e.empty_display_size = 0.02
        bpy.context.scene.collection.objects.link(e)
        e.parent = kit[piece]
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.matrix_basis = CGI @ Matrix(Ml.tolist()) @ CG
        e["kit_socket"] = "Bolt"
        if side:
            e["side"] = side
        sockets[piece].append((side, Ml))

# check: predicted bolts (instance x socket) vs measured bolts, per instance (only sockets present in source)
bolt_err = {}
predicted = 0
for inst in instances:
    if inst["piece"] not in sockets:
        continue
    actual = [M for side, M in socket_sets(inst["piece"], inst["src"]) if side in ("", "-Z")]
    # every socket counts as a candidate (a rotated cleat's "+Z" pair faces the source bay)
    pred = [inst["M"] @ Ml for side, Ml in sockets[inst["piece"]]]
    predicted += len(actual)
    for Ma in actual:
        d = min(np.linalg.norm(Mp[:3, 3] - Ma[:3, 3]) for Mp in pred)
        bolt_err[inst["piece"]] = round(max(bolt_err.get(inst["piece"], 0), d * 1000), 1)
    inst["bolts"] = len(actual)

# ── C7: LOD1 variants (frames far from the camera: no bolts, simplified pieces) ─────
LOD_DISSOLVE_DEG = 20.0
LOD_COLLAPSE = 0.5
lod_err = {}
for name in [k for k in kit if k != "Bolt"]:
    src = kit[name]
    lod = bpy.data.objects.new(f"{name}_LOD1", src.data.copy())
    lod.data.name = f"{name}_LOD1"
    bpy.context.scene.collection.objects.link(lod)
    steps = [("DISSOLVE", LOD_DISSOLVE_DEG)]
    if not src.get("kit_stretch"):        # collapse would break the end planes of stretch prisms
        steps.append(("COLLAPSE", LOD_COLLAPSE))
    apply_decimate(lod, steps)
    finish(lod)
    lod["kit_anchor"] = src["kit_anchor"]
    lod["kit_stretch"] = src["kit_stretch"]
    lod["kit_lod_of"] = name
    inst0 = next(i for i in instances if i["piece"] == name)
    T0, F0 = piece_geom(src)
    T1, F1 = piece_geom(lod)
    lod_err[name] = round(surface_err(apply(inst0["M"], T0), F0, apply(inst0["M"], T1), F1)[0] * 1000, 1)
    kit[lod.name] = lod

# ── materials (C5) ───────────────────────────────────────────────────────────
for o in list(bpy.data.objects):
    if o.name not in kit and not (o.parent and o.parent.name in kit and o.type == "EMPTY"):
        bpy.data.objects.remove(o, do_unlink=True)


def material(name, base, metal, rough, maps):
    m = bpy.data.materials.new(name)
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*base, 1.0)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    for k, v in maps.items():
        m[k] = v
    return m


steel = material("Steel", (1.0, 1.0, 1.0), 1.0, 1.0, {
    "map": "/metal/metal_color.webp", "normalMap": "/metal/metal_normal.webp",
    "roughnessMap": "/metal/metal_roughness.webp", "metalnessMap": "/metal/metal_metal.webp"})
panel = material("Panel", (1.0, 1.0, 1.0), 1.0, 1.0, {
    "map": "/wall/wall_color.webp", "normalMap": "/wall/wall_normal.webp", "roughnessMap": "/wall/wall_roughness.webp"})
concrete = material("Concrete", (0.2541, 0.2541, 0.2541), 0.0, 0.9, {
    "map": "/concrete/concrete_color.webp", "normalMap": "/concrete/concrete_normal.webp",
    "roughnessMap": "/concrete/concrete_roughness.webp"})
for o in kit.values():
    o.data.materials.clear()
    o.data.materials.append(steel)


def swatch(name, mat, plane):
    V = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)] if plane == "XY" else [(0, 0, 0), (0, 0, 1), (1, 0, 1), (1, 0, 0)]
    o = make_piece(name, np.array(V, float), [[0, 1, 2, 3]], extras={"kit_anchor": f"unit quad in {plane}", "kit_stretch": ""})
    o.data.materials.append(mat)
    return o


kit["PanelSwatch"] = swatch("PanelSwatch", panel, "XY")
kit["ConcreteSwatch"] = swatch("ConcreteSwatch", concrete, "XZ")
for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)
bpy.data.orphans_purge(do_recursive=True)

# ── save, export, report ─────────────────────────────────────────────────────
C.save_blend(args["out"])
bpy.ops.export_scene.gltf(filepath=args["glb"], export_format="GLB", export_extras=True, export_yup=True,
                          export_apply=True, export_cameras=False,
                          export_lights=False)

tris = {k: C.tri_count(o) for k, o in kit.items()}
frame_tris = sum(tris[i["piece"]] for i in instances) + predicted * tris["Bolt"]
frame_tris_lod1 = sum(tris[i["piece"] + "_LOD1"] for i in instances)
ref = {
    "coords": "glTF (Y up, metres); source = one 12 m frame at z=0 + one 6 m bay of purlins/gutters",
    "constants": {
        "pitch_deg": round(math.degrees(pitch), 3), "apex_x": round(x0, 4), "hall_centre_x_from_columns": round(x0_cols, 4),
        "column_axis_x_left": round(col_axis, 4), "column_bottom_y": round(col_bot, 4), "column_top_y": round(col_top, 4),
        "eave_anchor_E_minus_haunch_anchor": r4(E - anchors["EaveHaunch"]), "apex_anchor_A": r4(A),
        "rafter_len_E_to_A": round(sigma, 4), "rafter_depth_vertical": round(d_vert, 4),
        "purlin_seats_left": [{"x": round(float(i["M"][0, 3]), 4),
                               "along_flange_from_E": round(float((i["M"][0, 3] - E[0]) / math.cos(pitch)), 4),
                               "above_rafter_top": round(float(i["M"][1, 3] - (E[1] + (i["M"][0, 3] - E[0]) * tp) - d_vert), 4)}
                              for i in instances if i["piece"] == "PurlinCleat" and i["M"][0, 3] < x0],
        "gutter_anchor_minus_haunch_anchor": r4(np.array(gut) - anchors["EaveHaunch"]),
        "downpipe_anchor_minus_haunch_anchor": r4(np.array(dp) - anchors["EaveHaunch"]),
        **DRAIN,
        "girt_cleat_anchor_minus_column_base": r4(anchors["GirtCleat"] - np.array((col_axis, col_bot, col_z))),
        "ridge_cap_anchor_minus_apex": r4(np.array(rc) - A),
    },
    "pieces": {k: {"tris": tris[k], "sockets": len(sockets.get(k, [])), "stretch": o.get("kit_stretch", ""),
                   "anchor": o.get("kit_anchor", "")} for k, o in kit.items()},
    "instances": [{"piece": i["piece"], "src": i["src"], "side": i["side"], "rot": i["rot"],
                   "t": r4(i["M"][:3, 3]), "q_xyzw": quat_xyzw(i["M"][:3, :3] / np.linalg.norm(i["M"][:3, :3], axis=0)),
                   "s": r4(np.linalg.norm(i["M"][:3, :3], axis=0)), "err_mm": i["err_mm"], "bolts": i.get("bolts", 0)}
                  for i in instances],
    "frame_tris": frame_tris, "frame_bolts": predicted, "frame_tris_lod1": frame_tris_lod1, "lod1_err_mm": lod_err,
}
with open(args["json"], "w") as fh:
    json.dump(ref, fh, indent=1)
    fh.write("\n")

worst = {}
for i in instances:
    worst[i["piece"]] = max(worst.get(i["piece"], 0), i["err_mm"][0])
C.emit({"tris": tris, "frame_tris": frame_tris, "frame_tris_lod1": frame_tris_lod1, "lod1_err_mm": lod_err, "frame_bolts": predicted, "bolt_pos_err_mm": bolt_err,
        "fit_max_err_mm": worst, "pitch_deg": ref["constants"]["pitch_deg"],
        "seats": ref["constants"]["purlin_seats_left"], "glb": args["glb"]})
