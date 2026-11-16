"""C0 - Baseline import + inventory.

Usage (from industrial-configurator/):
  Blender -b -P scripts/blender/00_import_inventory.py -- \
      --src ~/CarStar-assets/da.glb \
      --blend ~/CarStar-assets/hala_import.blend \
      --json assets/blender/inventory.json

Writes per-object inventory (name, parent, type, tris, world bbox / origin /
dimensions in glTF coords) plus a family summary. Prints only the summary.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import _common as C  # noqa: E402

args = C.parse_args({
    "src": os.path.join(C.ASSETS_DIR, "da.glb"),
    "blend": os.path.join(C.ASSETS_DIR, "hala_import.blend"),
    "json": "assets/blender/inventory.json",
})

C.clear_scene()
C.import_glb(args["src"])
bpy.context.view_layer.update()

objects = []
families = {}
total = 0
for obj in sorted(bpy.data.objects, key=lambda o: o.name):
    tris = C.tri_count(obj)
    total += tris
    mn, mx = C.world_bbox(obj)
    bb = C.bbox_gltf(mn, mx)
    dims = [round(bb["max"][i] - bb["min"][i], 4) for i in range(3)]
    fam = C.family_of(obj.name)
    objects.append({
        "name": obj.name,
        "family": fam,
        "parent": obj.parent.name if obj.parent else None,
        "type": obj.type,
        "mesh": obj.data.name if obj.type == "MESH" else None,
        "tris": tris,
        "origin": C.to_gltf(obj.matrix_world.translation),
        "dims": dims,
        "bbox": bb,
    })
    f = families.setdefault(fam, {"count": 0, "tris": 0, "min": [1e9] * 3, "max": [-1e9] * 3})
    f["count"] += 1
    f["tris"] += tris
    if obj.type == "MESH":
        f["min"] = [min(f["min"][i], bb["min"][i]) for i in range(3)]
        f["max"] = [max(f["max"][i], bb["max"][i]) for i in range(3)]

meshes = [o for o in objects if o["type"] == "MESH"]
scene_min = [min(o["bbox"]["min"][i] for o in meshes) for i in range(3)]
scene_max = [max(o["bbox"]["max"][i] for o in meshes) for i in range(3)]

fam_sorted = dict(sorted(families.items(), key=lambda kv: -kv[1]["tris"]))
inventory = {
    "source": os.path.basename(args["src"]),
    "coords": "glTF/three.js, Y up, metres",
    "objects_total": len(objects),
    "mesh_objects": len(meshes),
    "tris_total": total,
    "scene_bbox": {"min": scene_min, "max": scene_max},
    "materials": [m.name for m in bpy.data.materials],
    "images": len(bpy.data.images),
    "families": fam_sorted,
    "objects": objects,
}

os.makedirs(os.path.dirname(os.path.abspath(args["json"])), exist_ok=True)
with open(args["json"], "w") as fh:
    json.dump(inventory, fh, indent=1)
C.save_blend(args["blend"])

C.emit({
    "objects": len(objects),
    "tris_total": total,
    "scene_bbox": inventory["scene_bbox"],
    "materials": inventory["materials"],
    "families": {k: [v["count"], v["tris"]] for k, v in fam_sorted.items()},
})
