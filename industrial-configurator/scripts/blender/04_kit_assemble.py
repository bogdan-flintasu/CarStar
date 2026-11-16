"""C3/C6 check - Re-assemble the source frame from the SHIPPING kit GLB using kit_reference.json.

Usage (from industrial-configurator/):
  Blender -b -P scripts/blender/04_kit_assemble.py -- \
      --glb public/models/hall-kit.glb --json assets/blender/kit_reference.json \
      --out ~/CarStar-assets/hala_c3_assembled.blend
(--lod 1 assembles the C7 far variant: `<Piece>_LOD1`, no bolts), then render with 90_preview.py (--tag c3) and compare with 91_contact_sheet.py (--a orig --b c3).

Every instance = kit piece placed with the glTF TRS from kit_reference.json; bolts = instance x
<Piece>_BoltSocket_NN read back from the GLB (so sockets, origins and units are all exercised the
way WS-D will use them). PurlinCleat sockets are rendered only on the side that faces the source bay
(world -Z), as an end frame would.
"""
import json
import os
import sys

sys.dont_write_bytecode = True  # no __pycache__ in the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402

import _common as C  # noqa: E402

args = C.parse_args({
    "glb": "public/models/hall-kit.glb",
    "json": "assets/blender/kit_reference.json",
    "out": os.path.join(C.ASSETS_DIR, "hala_c3_assembled.blend"),
    "lod": "0",   # 1 -> <Piece>_LOD1 meshes and no bolts (C7 far-frame variant)
})
LOD = args["lod"] == "1"

CG = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))  # Blender -> glTF
CGI = CG.inverted()

C.clear_scene()
C.import_glb(os.path.abspath(args["glb"]))
ref = json.load(open(args["json"]))

kit = {o.name: o for o in bpy.data.objects if o.parent is None and o.type == "MESH"}
for o in kit.values():
    if o.matrix_world != Matrix.Identity(4):
        raise SystemExit(f"{o.name}: non-identity transform after import")


def g2b(t, q, s):
    M = Matrix.Translation(t) @ Quaternion((q[3], q[0], q[1], q[2])).to_matrix().to_4x4() @ Matrix.Diagonal((*s, 1))
    return CGI @ M @ CG


placed, bolts = 0, 0
coll = bpy.data.collections.new("Assembled")
bpy.context.scene.collection.children.link(coll)
for i in ref["instances"]:
    src = kit[i["piece"]]
    inst = bpy.data.objects.new(f"{i['piece']}.{placed:03d}", kit[i["piece"] + "_LOD1"].data if LOD else src.data)
    inst.matrix_world = g2b(i["t"], i["q_xyzw"], i["s"])
    coll.objects.link(inst)
    placed += 1
    for sock in sorted(src.children, key=lambda c: c.name):
        if LOD or not sock.name.startswith(f"{i['piece']}_BoltSocket_"):
            continue
        Mw = inst.matrix_world @ sock.matrix_local
        if i["piece"] == "PurlinCleat":
            local_z = (CG @ sock.matrix_local).translation.z
            world_dz = (CG @ (inst.matrix_world.to_3x3().to_4x4()) @ CGI @ Vector((0, 0, local_z))).z
            if world_dz > 0:
                continue
        b = bpy.data.objects.new(f"Bolt.{bolts:03d}", kit["Bolt"].data)
        b.matrix_world = Mw
        coll.objects.link(b)
        bolts += 1

for o in list(bpy.data.objects):  # drop the templates at the origin (and their socket empties)
    if o.users_collection and coll not in o.users_collection:
        bpy.data.objects.remove(o, do_unlink=True)

C.save_blend(args["out"])
C.emit({"lod": int(LOD), "instances": placed, "bolts": bolts, "bolts_expected": ref["frame_bolts"],
        "scene_tris": C.scene_tris(), "frame_tris_ref": ref["frame_tris"], "out": args["out"]})
