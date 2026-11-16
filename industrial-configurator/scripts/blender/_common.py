"""Shared helpers for the CarStar Blender pipeline (scripts/blender/NN_*.py).

All scripts run headless:
  Blender -b [in.blend] -P scripts/blender/NN_name.py -- --key value ...
and print ONE compact JSON summary prefixed with "RESULT ".

Coordinates reported to the web side are glTF / three.js (Y up, metres):
  gltf = (bx, bz, -by) for a Blender Z-up point (bx, by, bz).
"""
import json
import os
import re
import sys

import bpy
from mathutils import Vector

ASSETS_DIR = os.path.expanduser("~/CarStar-assets")


def parse_args(defaults):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = dict(defaults)
    i = 0
    while i < len(argv):
        key = argv[i].lstrip("-").replace("-", "_")
        if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            out[key] = argv[i + 1]
            i += 2
        else:
            out[key] = True
            i += 1
    for k, v in out.items():
        if isinstance(v, str) and v.startswith("~"):
            out[k] = os.path.expanduser(v)
    return out


def emit(result):
    print("RESULT " + json.dumps(result, indent=1))


def to_gltf(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def tri_count(obj):
    if obj.type != "MESH":
        return 0
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def world_bbox(obj):
    """World-space AABB in Blender coords: (min Vector, max Vector)."""
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def bbox_gltf(mn, mx):
    """Blender AABB -> glTF AABB {min,max} (Y up, Z = -blender Y)."""
    return {
        "min": [round(mn.x, 4), round(mn.z, 4), round(-mx.y, 4)],
        "max": [round(mx.x, 4), round(mx.z, 4), round(-mn.y, 4)],
    }


_FAMILY_RE = re.compile(r"(\.\d+|\d+|_)+$")


def family_of(name):
    """surub_sus012.003 -> surub_sus ; PereteFata -> PereteFata."""
    fam = _FAMILY_RE.sub("", name)
    return fam or name


def mesh_objects():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def scene_tris():
    return sum(tri_count(o) for o in mesh_objects())


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)


def save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
