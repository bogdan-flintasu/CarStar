"""Combine before/after preview PNGs into one side-by-side contact sheet (no PIL needed).

Usage:
  Blender -b -P scripts/blender/91_contact_sheet.py -- \
      --a orig --b c2 --views base,haunch,ridge,purlin,overall \
      --dir ~/CarStar-assets/previews --out ~/CarStar-assets/previews/sheet_orig_c2.png --half
Rows = views, left column = A, right column = B.
"""
import os
import sys

sys.dont_write_bytecode = True  # no __pycache__ in the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402

import _common as C  # noqa: E402

args = C.parse_args({
    "a": "orig", "b": "c2",
    "views": "base,haunch,ridge,purlin,overall",
    "dir": os.path.join(C.ASSETS_DIR, "previews"),
    "out": "",
})


def load(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    if args.get("half"):
        px = px[: h - h % 2, : w - w % 2].reshape(h // 2, 2, w // 2, 2, 4).mean(axis=(1, 3))
    return px


rows = []
for v in args["views"].split(","):
    a = load(os.path.join(args["dir"], f"{args['a']}_{v}.png"))
    b = load(os.path.join(args["dir"], f"{args['b']}_{v}.png"))
    sep = np.ones((a.shape[0], 4, 4), dtype=np.float32)
    rows.append(np.concatenate([a, sep, b], axis=1))
    rows.append(np.ones((4, rows[-1].shape[1], 4), dtype=np.float32))
# Blender pixel rows run bottom-up: reverse so the first view ends up on top
sheet = np.concatenate(rows[:-1][::-1], axis=0)
h, w = sheet.shape[:2]
out = args["out"] or os.path.join(args["dir"], f"sheet_{args['a']}_{args['b']}.png")
img = bpy.data.images.new("sheet", w, h, alpha=True)
img.pixels[:] = sheet.ravel()
img.filepath_raw = out
img.file_format = "PNG"
img.save()
C.emit({"sheet": out, "size": [w, h]})
