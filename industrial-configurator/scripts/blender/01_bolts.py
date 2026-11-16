"""C1 - Replace every high-poly bolt with instances of ONE low-poly `Bolt` mesh.

Usage (from industrial-configurator/):
  Blender -b ~/CarStar-assets/hala_import.blend -P scripts/blender/01_bolts.py -- \
      --out ~/CarStar-assets/hala_c1_bolts.blend \
      --json assets/blender/bolts.json

Source bolts are unwelded triangle soups (~10k loose parts, ~24k tris each,
some objects hold 2 bolts). For every bolt object we:
  1. split it into loose parts and merge overlapping major parts into bolts,
  2. PCA each cluster -> shank axis, length (along axis) and head radius,
  3. replace it with linked duplicates of the shared `Bolt` mesh
     (symmetric: hex head + shank + hex nut, so head/nut side does not matter).

`Bolt` template (contract): nominal M20, length BOLT_LEN along glTF +Y, origin at
the bolt centre, head across-corners 2*BOLT_R. Instances carry rotation and a
scale (r/BOLT_R, L/BOLT_LEN, r/BOLT_R) close to 1.
Instances are named Bolt.<family>.<NNN> and keep the original parent.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402

import _common as C  # noqa: E402

args = C.parse_args({
    "out": os.path.join(C.ASSETS_DIR, "hala_c1_bolts.blend"),
    "json": "assets/blender/bolts.json",
})

BOLT_FAMILIES = ("surub", "surub_sus", "suruburi_grinzi", "suruburi_perete")
BOLT_LEN = 0.08     # nominal template length (m), along +Y
BOLT_R = 0.018      # head/nut circumradius (m) -> ~31 mm across flats
SHANK_R = 0.010     # M20 shank
HEAD_H = 0.013      # head / nut height
TOL = 0.001        # AABB overlap tolerance when merging bolt parts (m)
SNAP_COS = math.cos(math.radians(2.5))  # snap PCA axes within 2.5 deg of a world axis


def build_bolt_mesh():
    """Hex head (bottom) + 8-sided shank + hex nut (top). Blender +Z (= glTF +Y), centred."""
    bm = bmesh.new()

    def ring(n, r, y, phase=0.0):
        return [bm.verts.new((r * math.cos(phase + 2 * math.pi * i / n),
                              r * math.sin(phase + 2 * math.pi * i / n),
                              y)) for i in range(n)]

    def prism(n, r, y0, y1, caps=True):
        a, b = ring(n, r, y0), ring(n, r, y1)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
        if caps:
            bm.faces.new(list(reversed(a)))
            bm.faces.new(b)

    h = BOLT_LEN / 2
    prism(6, BOLT_R, -h, -h + HEAD_H)                    # head
    prism(8, SHANK_R, -h + HEAD_H, h - HEAD_H, caps=False)  # shank
    prism(6, BOLT_R, h - HEAD_H, h)                      # nut
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    me = bpy.data.meshes.new("Bolt")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    return me


def loose_part_labels(me):
    """Label every vertex with its edge-connected loose part (numpy union-find)."""
    n = len(me.vertices)
    e = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", e)
    a, b = e[0::2], e[1::2]
    lab = np.arange(n)
    while True:
        m = np.minimum(lab[a], lab[b])
        new = lab.copy()
        np.minimum.at(new, a, m)
        np.minimum.at(new, b, m)
        new = new[new]  # pointer jumping
        if np.array_equal(new, lab):
            return lab
        lab = new


def clusters(obj):
    """World-space vertex arrays, one per physical bolt.

    The soups contain thousands of loose parts. The "major" parts (threaded
    body, nut, head: >= 5 % of the largest part) whose AABBs overlap are merged
    into one bolt; every remaining vertex joins the nearest bolt.
    """
    me = obj.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    mw = np.array(obj.matrix_world)
    co = co @ mw[:3, :3].T + mw[:3, 3]
    lab = loose_part_labels(me)
    ids, counts = np.unique(lab, return_counts=True)
    major = ids[counts >= max(50, 0.05 * counts.max())]
    boxes = [(co[lab == i].min(axis=0) - TOL, co[lab == i].max(axis=0) + TOL) for i in major]
    group = list(range(len(major)))

    def root(i):
        while group[i] != i:
            group[i] = group[group[i]]
            i = group[i]
        return i

    for i in range(len(major)):
        for j in range(i + 1, len(major)):
            if np.all(boxes[i][0] <= boxes[j][1]) and np.all(boxes[j][0] <= boxes[i][1]):
                group[root(i)] = root(j)
    roots = sorted({root(i) for i in range(len(major))})
    cents = []
    for r in roots:
        mask = np.isin(lab, [major[i] for i in range(len(major)) if root(i) == r])
        cents.append(co[mask].mean(axis=0))
    cents = np.array(cents)
    nearest = np.argmin(((co[:, None, :] - cents[None, :, :]) ** 2).sum(axis=2), axis=1)
    return [co[nearest == k] for k in range(len(roots))]


def fit(pts):
    """-> centre(Vector), axis(Vector, unit), length, head radius."""
    c = pts.mean(axis=0)
    d = pts - c
    w, v = np.linalg.eigh(np.cov(d.T))  # ascending eigenvalues
    axis = v[:, 2]
    if w[1] / w[2] > 0.5:
        # squat cluster (big washer): PCA is ambiguous -> longest AABB extent
        axis = np.zeros(3)
        axis[int(np.argmax(np.ptp(pts, axis=0)))] = 1.0
    t = d @ axis
    radial = np.linalg.norm(d - np.outer(t, axis), axis=1)
    lo, hi = float(t.min()), float(t.max())
    centre = c + axis * (lo + hi) / 2
    # snap near-cardinal axes (PCA noise) so instances are clean
    a = Vector(axis.tolist())
    for i in range(3):
        if abs(a[i]) > SNAP_COS:
            a = Vector([0, 0, 0])
            a[i] = 1.0
    return Vector(centre.tolist()), a.normalized(), hi - lo, float(np.percentile(radial, 98))


src_bolts = sorted((o for o in C.mesh_objects() if C.family_of(o.name) in BOLT_FAMILIES),
                   key=lambda o: o.name)
tris_before = sum(C.tri_count(o) for o in src_bolts)
scene_before = C.scene_tris()

bolt_me = build_bolt_mesh()
bolt_tris = sum(len(p.vertices) - 2 for p in bolt_me.polygons)
coll = bpy.context.scene.collection

placements = []
per_family = {}
counter = {}
y_up = Vector((0, 0, 1))  # Blender +Z == glTF +Y (template axis)
n_oblique = 0
for obj in src_bolts:
    fam = C.family_of(obj.name)
    parent = obj.parent
    users = list(obj.users_collection) or [coll]
    for pts in clusters(obj):
        centre, axis, length, radius = fit(pts)
        # template axis is Blender +Y; bolts are axis-symmetric so sign is irrelevant
        if axis.dot(y_up) < 0:
            axis = -axis
        rot = y_up.rotation_difference(axis)
        s_r = max(0.5, min(1.6, radius / BOLT_R))
        s_l = max(0.3, min(2.0, length / BOLT_LEN))
        idx = counter.get(fam, 0)
        counter[fam] = idx + 1
        inst = bpy.data.objects.new(f"Bolt.{fam}.{idx:03d}", bolt_me)
        for c in users:
            c.objects.link(inst)
        inst.matrix_world = Matrix.LocRotScale(centre, rot, Vector((s_r, s_r, s_l)))
        if max(abs(axis[i]) for i in range(3)) < 0.999:
            n_oblique += 1
        if parent is not None:
            mw = inst.matrix_world.copy()
            inst.parent = parent
            inst.matrix_world = mw
        q = rot  # Blender-space quaternion -> glTF space (x, z, -y)
        placements.append({
            "name": inst.name,
            "family": fam,
            "source": obj.name,
            "parent": parent.name if parent else None,
            "pos": C.to_gltf(centre),
            "quat_xyzw": [round(q.x, 5), round(q.z, 5), round(-q.y, 5), round(q.w, 5)],
            "scale": [round(s_r, 4), round(s_l, 4), round(s_r, 4)],
            "len": round(length, 4),
            "r": round(radius, 4),
        })
        f = per_family.setdefault(fam, {"src_objects": 0, "bolts": 0})
        f["bolts"] += 1
    per_family.setdefault(fam, {"src_objects": 0, "bolts": 0})["src_objects"] += 1
    old_me = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if old_me.users == 0:
        bpy.data.meshes.remove(old_me)

bpy.context.view_layer.update()
n_inst = len(placements)
with open(args["json"], "w") as fh:
    json.dump({
        "coords": "glTF/three.js, Y up, metres",
        "template": {"mesh": "Bolt", "axis": "+Y", "origin": "bolt centre",
                     "length": BOLT_LEN, "head_circumradius": BOLT_R, "tris": bolt_tris},
        "bolts": placements,
    }, fh, indent=1)
C.save_blend(args["out"])

C.emit({
    "bolt_tris_template": bolt_tris,
    "src_bolt_objects": len(src_bolts),
    "bolt_instances": n_inst,
    "bolt_tris_before": tris_before,
    "bolt_tris_after": n_inst * bolt_tris,
    "scene_tris_before": scene_before,
    "scene_tris_after": C.scene_tris(),
    "per_family": per_family,
    "len_range": [min(p["len"] for p in placements), max(p["len"] for p in placements)],
    "r_range": [min(p["r"] for p in placements), max(p["r"] for p in placements)],
    "oblique_axes": n_oblique,
})
