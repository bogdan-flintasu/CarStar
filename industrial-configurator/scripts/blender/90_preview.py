"""Headless preview renders (Workbench) from fixed cameras, for before/after review.

Usage (from industrial-configurator/):
  Blender -b <file.blend> -P scripts/blender/90_preview.py -- \
      --tag c2 --outdir ~/CarStar-assets/previews [--hide PereteFata,PereteSpate,...] [--views base,haunch]

Cameras are given in glTF coords (Y up) as eye / target; ~3 m from the joints
for detail views, so before/after images are directly comparable.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import _common as C  # noqa: E402

args = C.parse_args({
    "tag": "preview",
    "outdir": os.path.join(C.ASSETS_DIR, "previews"),
    "hide": "",
    "views": "base,haunch,ridge,purlin,overall",
    "res": "800x500",
})

# name: (eye_gltf, target_gltf, lens_mm)
VIEWS = {
    "base": ((-4.2, 1.4, 2.0), (-6.14, 0.1, 0.0), 35),
    "haunch": ((-4.0, 4.6, 2.0), (-6.1, 5.95, 0.0), 35),
    "ridge": ((1.6, 5.8, 2.2), (0.0, 7.2, 0.0), 35),
    "purlin": ((-2.0, 5.6, 1.8), (-4.0, 6.7, -0.5), 35),
    "overall": ((16.0, 9.0, 14.0), (0.0, 3.5, -3.0), 35),
}


def b(v):
    """glTF -> Blender coords."""
    return Vector((v[0], -v[2], v[1]))


for name in [n for n in args["hide"].split(",") if n]:
    o = bpy.data.objects.get(name)
    if o:
        o.hide_render = True

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
w, h = (int(x) for x in args["res"].split("x"))
scene.render.resolution_x, scene.render.resolution_y = w, h
scene.render.resolution_percentage = 100
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "SINGLE"
scene.display.shading.single_color = (0.62, 0.64, 0.66)
scene.display.shading.show_cavity = True
scene.display.shading.show_object_outline = False
scene.render.film_transparent = False
if scene.world is None:
    scene.world = bpy.data.worlds.new("World")

cam_data = bpy.data.cameras.new("PreviewCam")
cam = bpy.data.objects.new("PreviewCam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.clip_start = 0.01

os.makedirs(args["outdir"], exist_ok=True)
written = []
for view in args["views"].split(","):
    eye, target, lens = VIEWS[view]
    cam.location = b(eye)
    cam.rotation_euler = (b(target) - b(eye)).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = lens
    path = os.path.join(args["outdir"], f"{args['tag']}_{view}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    written.append(path)

C.emit({"written": written})
