# Plan: AR presentation of the hall ("Vezi în AR")

Status: **planned, not started.** Comes after the current feature round (docs/plans/next-features.md) and **before** the GPU
render server (docs/plans/gpu-render-server.md), which reuses this plan's 3D export.

## Goal

A customer (or the company's salesperson) opens the configured hall in augmented reality on a phone: on a table as a
model, or full size on the real plot. No app to install, no streaming, no GPU of ours.

## How AR works without our own hardware

Phones show 3D files in AR natively. We only have to produce the files and link to them:

| Platform | Viewer | File | How it opens |
|---|---|---|---|
| iPhone / iPad (Safari) | AR Quick Look | `.usdz` | `<a rel="ar" href="…usdz">` |
| Android (Chrome, ARCore) | Scene Viewer | `.glb` | `intent://arvr.google.com/scene-viewer/1.2?file=<https url>&mode=ar_preferred…` |
| Desktop | — | — | QR code that opens the AR page on the phone (`qrcode` is already a dependency) |

`@google/model-viewer` wraps all of this (AR button, 3D fallback when AR is unavailable). It is loaded only on the AR
page, so the configurator's bundle does not grow.

## Pipeline

1. **Export (stage 1: in the browser).** The live scene is already built from the engine (HallLayout + hall kit GLB).
   three.js ships `GLTFExporter` and `USDZExporter` (`three/examples/jsm/exporters`). When the customer sends the quote
   (or presses "Vezi în AR"), the browser exports the hall:
   - skip editing helpers (`userData.renderHidden`, see `components/3d/hall/renders.tsx`), the site and props;
   - collapse instanced pieces into merged meshes per material; drop bolts and cleats (invisible at AR distance);
   - textures at most 1024 px (2048 for the panel profile if needed);
   - real scale in metres, origin at the hall's centre on the ground, +Y up;
   - budgets: GLB ≤ 15 MB, USDZ ≤ 25 MB, ≤ 300k triangles (checked by a unit test on the largest hall, L = 102 m).
2. **Upload and store.** `POST /api/configurations/[token]/ar` (two files), validated like the renders
   (`api/_lib/renderStore.ts`): magic bytes (`glTF` / zip header), size caps, rate limit. Stored with the configuration,
   frozen with the quote. Behind the same storage interface as renders, so it moves to S3 with them.
3. **Serve.** `GET /api/configurations/[token]/ar.glb|.usdz` with the right MIME types (`model/gltf-binary`,
   `model/vnd.usdz+zip`), long cache headers, and `Access-Control-Allow-Origin: *` (Scene Viewer fetches the file from
   Google's app, not from our page).
4. **AR page.** `/configuration/[token]/ar`: model-viewer with the GLB, iOS link to the USDZ, the company's branding,
   two modes:
   - **Machetă** (table model): scaled down, rotates freely;
   - **Mărime reală** (full size): 1:1, the user walks around it on the plot.
   The page also shows the main dimensions and a "Cere oferta" button.
5. **Entry points.** "Vezi în AR" in the summary step and on the saved configuration page; a QR code on desktop and in
   the PDF quote ("Scanează pentru a vedea hala în AR").
6. **Stage 2 (with the GPU plan): export on the server.** The same exporter runs in Node from the spec (no browser),
   so AR files exist for quotes made through the future API and the files are identical for every client. This is the
   export the GPU render server needs; doing AR first builds it.

## Security and data

- AR files contain geometry and colours only, no personal data. URLs use the configuration token (unguessable).
- Upload is accepted only for an existing token, once per configuration revision; size and type checked server-side.
- Uploaded files are never executed or parsed beyond the header check.

## Tests and acceptance

- Unit: exporter output for small, typical and largest halls: bounds match `layout.bounds`, scale in metres, triangle
  and size budgets, no helper objects.
- Device matrix (manual, recorded in this file): iPhone (Safari, Quick Look), Android with ARCore (Chrome, Scene
  Viewer), Android without ARCore (3D fallback), desktop (QR code).
- Done when: a sent quote has working AR on both platforms, opens in under 5 s on 4G for a 30 m hall, and looks like
  the configured hall (colours, openings, roof type).

## Metrics

Count AR opens per company and per configuration: a sales argument and a usage signal for the company's dashboard.

## Later (not in this plan)

- Placing the hall at the plot's real GPS position (WebXR / geospatial anchors).
- Animated doors in AR.
- Interior walk-through: its own plan.

## Rough effort

Stage 1: 1.5–2.5 weeks (exporter and optimisation, upload/serve, AR page, entry points, device testing).
Stage 2: about 1 week, done together with the GPU render server.
