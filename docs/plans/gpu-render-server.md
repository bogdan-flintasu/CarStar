# Plan: GPU render server for HD renders, videos and AR files

Status: **planned, not started.** Comes **after AR** (docs/plans/ar.md): it reuses AR's server-side 3D export.

## Decision

The live 3D configurator stays in the customer's browser (no cost per visitor). A GPU machine produces the heavy
outputs **in the background**, through a job queue: photorealistic stills, flythrough videos, and (stage 2 of AR) the AR
files. Live pixel streaming from our servers was considered and rejected for now (see "Rejected alternative").

On weak devices the live view still lowers its quality to stay smooth (docs/plans/next-features.md, track T4);
geometry, dimensions and prices never change. Quote pictures stop depending on the customer's device once this exists.

## Pluses and minuses

Pluses:
- Quality far beyond the browser: Blender Cycles (path tracing) with real panel profiles, bolts, glass, soft shadows,
  vegetation and people.
- The same pictures for every customer, whatever their device.
- No fixed cost at the start when the GPU is rented per second.
- A natural Pro-plan feature ("randări HD + video + AR").
- Isolated: a crashed or slow render never affects the website.

Minuses:
- Not instant: about 1–3 minutes for a set of stills, longer for video. The instant browser renders stay as the
  immediate result; HD versions arrive later (email, company inbox, configuration page).
- More moving parts: queue, worker, file storage, callbacks.
- Most of the cost is development: a material library, lighting and the Blender pipeline (2–4 weeks), tuned once.
- Cold start of a rented worker: about 20–60 s before the first job after an idle period.
- Licences to check for every texture and HDRI used (Blender itself is GPL and fine on a server).

## Where it runs

Not on the web server (the Hetzner VPS of the startup plan has no GPU). The worker is one Docker image that runs in
either place:

| | Rented per second (e.g. RunPod serverless) | Dedicated GPU server (e.g. Hetzner GEX44, RTX 4000 SFF Ada 20 GB) |
|---|---|---|
| Fixed cost | €0 | about €184–234 / month plus a setup fee (sources disagree; check hetzner.com) |
| Per use | about $0.7–1.1 per GPU-hour, billed per second | included |
| Peaks | several workers in parallel | one GPU |
| Use when | starting out, irregular traffic | steady heavy use |

Start rented. Switch to dedicated when the rented bill passes the dedicated price: around 200 GPU-hours a month
(about 6–7 hours of rendering a day). Switching is a configuration change, because it is the same image.

## Cost estimates (to confirm with a benchmark in step 1)

- 4 HD stills, 1600×1000, Cycles with OptiX denoising: about 1–2 GPU-minutes, about **€0.02–0.05 per quote**.
- 10 s flythrough video: EEVEE about €0.10–0.30; Cycles about €1+. Offer as Pro or on request.
- AR conversion: CPU only, no GPU.
- Storage (S3-compatible, e.g. Cloudflare R2): cents per month for thousands of images.
- Example: 500 quotes a month with HD stills ≈ €10–25.

## Load: 100 users at the same time

- Browsing costs the GPU nothing: the live 3D runs on the visitor's device. The GPU works only when a quote is sent
  (or an HD render is requested).
- Bursts are absorbed by the queue. With rented workers capped at, say, 10 in parallel, 100 simultaneous quotes finish
  in about 15 minutes; one dedicated GPU would take over 2 hours, which is why rented workers come first.
- Limits: renders per company per plan, per-visitor rate limits, cache by spec hash (an identical configuration and
  spec version reuses earlier renders), and a maximum run time per job.
- Security: the worker receives only our validated specification and files we generated from it, never user-uploaded
  files or scripts (Blender runs Python). It has no database access: it gets short-lived signed URLs to download its
  input and upload its output.

## Implementation steps

1. **Benchmark.** Export three halls (12 m, 40 m, 102 m) with AR's exporter; render them with a first Blender script
   on a rented 4090/L4. Record time, VRAM and cost per image in this file. Go / no-go on the numbers.
2. **Server-side export** (shared with AR stage 2): spec → glTF in Node, from the same engine code as the
   configurator. Output is versioned with the spec.
3. **Job queue** on the web server (pg-boss, as in the startup plan): job kinds `renders`, `video`, `ar`, with
   `configurationId`, `specVersion`, `specHash`, `companyId`, priority by plan.
4. **Worker image:** Blender (headless) + our Python script:
   - import the glTF; apply the material library (sandwich panels, trapezoidal sheet, steel, glass, concrete, asphalt);
   - HDRI sky and sun from `lib/hall/renderViews.ts` (`sunForView`), the same camera views as the quote
     (`renderViewCameras`), so HD and browser renders frame the hall identically;
   - render, encode JPEG/MP4, upload through signed URLs, call back.
5. **Dispatcher:** sends jobs to the rented endpoint (or the dedicated worker pulls them); retries with backoff;
   timeouts; dead-letter list shown in the super-admin.
6. **Delivery:** results stored with the configuration (frozen with the quote); the company inbox and the customer get
   a notification; the configuration page swaps the browser renders for the HD ones; the PDF can be regenerated.
7. **Plans and limits:** HD renders in Pro, video on request or Engineering; per-company quotas.

## Monitoring: when to upgrade

Every job writes a `RenderJob` row: queued at, started at, finished at, GPU seconds, cost, worker type, result, error
(for example "CUDA out of memory"). The super-admin dashboard shows p50/p95 wait time, GPU hours and cost per month,
failure rate, and jobs per company. A dedicated server also exports GPU load, VRAM and temperature (NVIDIA DCGM
exporter → Prometheus → Grafana). Errors go to the error monitor of the startup plan.

Upgrade signals:
- p95 wait above the target (e.g. 10 minutes): raise the worker cap or add a GPU.
- A dedicated GPU above ~70 % load for hours a day: add a second one.
- Out-of-memory errors on large halls: a card with more VRAM (e.g. 48 GB class).
- Rented bill above the dedicated price: switch to dedicated.

## Rejected alternative: live pixel streaming

Rendering the live configurator on our GPUs and streaming video to the browser: each visitor holds a share of a GPU
for the whole visit (about 2–6 visitors per GPU), so 50 simultaneous visitors need 10–25 GPUs; it needs a stable
5–15 Mbps connection and degrades badly on mobile data; the cost grows with every visitor, including the many who
never ask for a quote. It does not fit the launch budget. Reconsider only as a paid "Premium" option for large clients.

## Sources (checked November 2026; prices change)

- Hetzner GEX44: https://bex.co/blog/2026/07/13/hetzner-gex44-gpu-pricing-break-even ,
  https://www.hetzner.com/pressroom/new-gpu-server/ ,
  https://hosting.gallery/companies/hetzner-com/dedicated-servers/gex44-nvidia-rtx-4000
- RunPod serverless: https://www.runpod.io/product/serverless , https://omidsaffari.com/blog/runpod-pricing ,
  https://checkthat.ai/brands/runpod/pricing
