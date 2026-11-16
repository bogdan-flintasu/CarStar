"""C2 - Remove walls, roof panels and the concrete slab: the frame asset is steel only.

Usage (from industrial-configurator/):
  Blender -b ~/CarStar-assets/hala_c1_bolts.blend -P scripts/blender/02_strip_cladding.py -- \
      --out ~/CarStar-assets/hala_c2_frame.blend

Walls, roof and slab are sized by L/W/H, so WS-D generates them procedurally
(flat boxes / gable ShapeGeometry + public/wall, public/concrete textures).
Children of removed objects are re-parented to the removed object's parent,
keeping their world transform. Orphan meshes are purged.
"""
import os
import sys

sys.dont_write_bytecode = True  # no __pycache__ in the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

import _common as C  # noqa: E402

args = C.parse_args({"out": os.path.join(C.ASSETS_DIR, "hala_c2_frame.blend")})

CLADDING = {
    "PereteFata": "end wall (front), 113k tris corrugation geometry",
    "PereteSpate": "end wall (back), 113k tris corrugation geometry",
    "PereteDR": "side wall right",
    "PereteSTG": "side wall left",
    "AcoperisDR": "roof panel right",
    "AcoperisSTG": "roof panel left",
    "beton": "concrete slab",
}

before = C.scene_tris()
removed, reparented, missing = {}, [], []
for name in CLADDING:
    obj = bpy.data.objects.get(name)
    if obj is None:
        missing.append(name)
        continue
    for child in list(obj.children):
        mw = child.matrix_world.copy()
        child.parent = obj.parent
        child.matrix_world = mw
        reparented.append(child.name)
    removed[name] = C.tri_count(obj)
    me = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if me is not None and me.users == 0:
        bpy.data.meshes.remove(me)

bpy.data.orphans_purge(do_recursive=True)
bpy.context.view_layer.update()

fam = {}
for o in C.mesh_objects():
    f = C.family_of(o.name)
    if o.name.startswith("Bolt."):
        f = "Bolt"
    fam[f] = fam.get(f, 0) + C.tri_count(o)
top = dict(sorted(fam.items(), key=lambda kv: -kv[1])[:12])

C.save_blend(args["out"])
C.emit({
    "removed": removed,
    "missing": missing,
    "reparented_children": reparented,
    "scene_tris_before": before,
    "frame_tris_after": C.scene_tris(),
    "mesh_objects": len(C.mesh_objects()),
    "unique_meshes": len({o.data.name for o in C.mesh_objects()}),
    "top_families_tris": top,
})
