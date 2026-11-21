# Plan: AR presentation of the hall ("Vezi în AR")

Status: **stage 1 implemented (2026-11-21), device matrix not yet run.** Comes after the interior walk-through, stages
1–2 (docs/plans/walkthrough.md), and **before** the GPU render server (docs/plans/gpu-render-server.md), which reuses
this plan's 3D export.

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

## Stage 1 as built

- Exporter: `components/3d/ar/arScene.ts` (pure three.js, no DOM: copies the hall and openings groups, drops helpers,
  invisible materials, `Bolts`/`Bolt`/`PurlinCleat`/`GirtCleat`, bakes instances, merges per material, origin at the
  footprint centre on the ground) and `components/3d/ar/arExport.tsx` (canvas provider; scene in quote state only for
  the synchronous copy; textures copied to canvases ≤ 1024 px; GLTFExporter + USDZExporter loaded on first use; USDZ
  gets real back faces since Quick Look has no double-sided materials).
- Upload: `configurator/hallAr.ts` exports and uploads in the background right after a configuration is saved, or on
  "Vezi în AR". `POST /api/configurations/[token]/ar` (fields `glb`, `usdz`): magic-byte checks
  (`lib/validation/arModels.ts`), size caps, rate limit, **once per configuration** (409 after) and **only within 24 h
  of saving** (410 after that, so an old link cannot be given a different model). Stored in `ConfigurationArModel` via
  `api/_lib/arStore.ts`.
- Serve: `GET /api/configurations/[token]/ar/hall.glb|hall.usdz` (a `[file]` segment rather than `ar.glb`, which
  would clash with the upload route's folder). `GET /api/configurations/[token]` returns `ar: { glb, usdz, pageUrl }`
  or null.
- AR page `/configuration/[token]/ar`: model-viewer 4.4 (dynamic import, separate chunk), poster = front render, modes,
  dimensions, "Cere oferta" (company email with the link, else phone, else the configuration page), QR on desktop.
  "Machetă" = `ar-scale="auto"` (user pinches it down; Scene Viewer / Quick Look open at 1:1 and allow scaling);
  "Mărime reală" = `ar-scale="fixed"` + `#allowsContentScaling=0` on the USDZ. The native viewers cannot be told to
  open at a reduced scale, so the table model starts life-size and is scaled by hand.
- Entry points: summary step card (phone → AR page; desktop → QR), configuration page button, PDF footer QR
  ("Scanează pentru a vedea hala în AR", on every page when AR files exist).
- Metrics: `Configuration.arViews`, incremented by `POST /api/configurations/[token]/ar/view` (rate-limited); visible
  in the admin configurations list (not yet shown in the admin UI).

Measured (desktop Chrome, 102 × 20 × 6 m, panels, foundation, one industrial door): 60 274 triangles, 10 meshes,
GLB 4.2 MB, USDZ 11.4 MB; 30 × 12 × 5 m: GLB 2.0 MB, USDZ 10.3 MB (the USDZ is mostly its PNG textures and
ASCII geometry: the first thing to shrink for the 4G target). Unit test: steel + walls of the largest hall plus a
200-opening allowance < 300k.

### Device matrix (to fill in)

| Device | Result |
|---|---|
| iPhone, Safari, Quick Look | not tested |
| Android with ARCore, Chrome, Scene Viewer / WebXR | not tested |
| Android without ARCore (3D fallback) | not tested |
| Desktop (QR code) | OK (Chrome, 2026-11-21) |

Open: the 4G < 5 s target for a 30 m hall is not measured yet; the USDZ is ASCII USD and about 2.7× the GLB.

## Later (not in this plan)

- Placing the hall at the plot's real GPS position (WebXR / geospatial anchors).
- Animated doors in AR.
- Interior walk-through: its own plan (docs/plans/walkthrough.md).

## Rough effort

Stage 1: 1.5–2.5 weeks (exporter and optimisation, upload/serve, AR page, entry points, device testing).
Stage 2: about 1 week, done together with the GPU render server.
