# Orchestrator log — round 2

Plan: docs/plans/next-features.md (the contract; nothing under "Not in this round"). Method as in ORCHESTRATOR.md:
workers in isolated worktrees, each starts with `git merge --ff-only main`, commits on its own branch; the orchestrator
reviews the diff, merges into local main with `--no-ff`, runs the gate, logs it. No pushes / PRs unless the user asks.
Gate: `cd industrial-configurator && pnpm install && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`
(lint 0 errors, 0 warnings). At most 3 workers at once. Browser checks (desktop + 375 px) by the orchestrator after each wave.

| Track | Model | Branch | Brief |
|---|---|---|---|
| T1a anchors + undo | opus | r2-t1a | r2-t1a.md |
| T2 brand identity | sonnet | r2-t2 | r2-t2.md |
| T3a drawing model | opus | r2-t3a | r2-t3a.md |
| T5a narrower lens | sonnet | r2-t5a | r2-t5a.md |

## Ownership notes (decided by the orchestrator, within the plan's table)
- T2 "leftovers to theme" in 3D files owned by T1/T3 (`DimensionLines`, placement preview, selected opening): T2 only
  provides the accent value (`--ui-accent` / a `useAccentColor()` hook); T3b and T1b adopt it in their own files.
- T2 also owns `api/_lib/quoteForToken.ts`, `api/configurations/route.ts` (branding snapshot at save) and
  `app/configuration/[token]/page.tsx` (accent colour) — no other track touches them in this round.
- T5a owns `lib/hall/cameraViews.ts` (constant), `CameraRig.tsx` fallback, the `fov` line in `ConfiguratorEngine.tsx`.
- T1a keeps the metric fields (`offsetX`, `sill`, `width`, `height`) on every `Opening` the store exposes, so the
  other readers (renders, quote model, server price, wall holes) keep working unchanged.

## Events
- 2026-11-19 Wave 0: main 3ab2490 clean; gate GREEN (tsc, lint 0/0, 479 tests, build; 1 pre-existing Turbopack warning).
  No CLAUDE.md files in the repo. Briefs for wave 1 written.
- Wave 1 launched: T1a (opus), T2 (sonnet), T3a (opus). T5a (sonnet) waits for the first free slot (max 3 workers).
- T3a done (7690746; drawings.ts, drawingsFormat.ts, 46 tests). Reviewed: own files only, tests check behaviour. Merged r2-t3a -> c2a8bc7.
  Gate GREEN (tsc, lint 0/0, 525 tests, build). API: buildDrawings(layout, openings?) -> Record<DrawingViewId, Drawing>;
  formatMetres ("7,5 m"). Handoffs: T3b switch DimensionLines labels to formatMetres, grid dashed, steel on elevations as
  hidden lines, offset text from labelAt; T1 pass placed rects (offsetX/sill/width/height) to buildDrawings.
- T5a launched (sonnet) in the freed slot.
- T5a done (caeeec7). CONFIGURATOR_FOV = 45 in cameraViews.ts, used by CameraRig fallback and the engine; initial camera
  moved back to [-11, 13, 24] (accepted: only thing that assumed 75°). 24 frustum tests. Merged r2-t5a -> 0b3738f.
  Gate GREEN (tsc, lint 0/0, 550 tests, build).
- T2 done (b2b2d9d schema, 04e4108 rest). Schema reviewed by orchestrator: OK (Configuration rebuilt with all columns
  copied; INSERT OR IGNORE default org + BrandIdentity.theme copied from AppSetting uiTheme; AppSetting kept; logoAssetId
  deliberately not a relation, snapshots reference assets). Security: magic bytes, 1 MB, allow-list SVG sanitizer, logo
  route nosniff + sandbox CSP, admin routes requireAdmin (401 tests). Outside list, accepted: send-email route (+7, DB
  branding), favicon.ico moved src/app -> public (metadata.icons), configurations route test.
  Merged r2-t2 -> bdf7e0d. First gate RED: stale Prisma client (pnpm install skipped postinstall) -> `prisma generate`.
  Main dev.db backed up to ~/CarStar-assets/dev.db.bak-before-brand-identity, then `prisma migrate deploy` applied.
  Gate GREEN (tsc, lint 0/0, 600 tests, build). Gate note: after a schema merge run `pnpm exec prisma generate` too.
  Handoffs: useAccentColor()/useBrand() in UiThemeScope.tsx -> T1b (placement preview, selected opening), T3b (DimensionLines).
  Landing page + root layout title/siteName still say "CarStar" (not in T2 scope; left as is).
  Dev server must be restarted (schema change).
- T1a done (78e180d). Own files only (16). Intents {anchor: bay|axis|wallStart, sill, width, height, linkId?} are the
  persisted truth (store v2), `openings` derived with metric fields + anchor; 'fit' conflict; autoPlace ("Reașază automat");
  useHistoryStore (100 entries, 400 ms coalescing, drag commits on end); HistoryButtons + MovedOpeningsToast mounted in
  ConfiguratorLayout; server openingSchema accepts v0/v1/v2 (strict anchor; legacy rejects anchor). 49 tests.
  Merged r2-t1a -> 7fa94ff. Gate GREEN (tsc, lint 0/0, 643 tests, build). Not browser-checked by the worker.
  Handoffs: T1b use addOpening(rect) + placement[id].fits; T1c addOpening(rect, {free:true}); T1e linkId reserved.
- Wave 1 merged (T1a, T2, T3a, T5a). Browser verification pending: port 3000 occupied, waiting for the user's OK.
- Wave 1 browser check (orchestrator). Port 3000 = the user's dev server from this checkout (Next refuses a 2nd server in
  the same dir), so I verified on a detached worktree of main (.claude/worktrees/verify, own copy of dev.db) on port 3011
  (launch config "dev-verify"). Results:
  - T1a PASS: window placed on the right wall at L=30 (stored anchor {bay 4, offset 2.19}, v2); L=12 -> toast
    "1 gol a fost mutat · Anulează", anchor unchanged; L=30 again -> window back on the same spot; ⌘Z 30->12, ⌘⇧Z ->30;
    buttons disabled correctly; titles show the shortcut.
  - T5a PASS: 45° lens, framing fine on desktop and phone.
  - T2 PASS: /api/brand, /api/brand/icon (307 to favicon without logo), /api/brand/logo 404 without logo, admin PUT
    unauthenticated 401; admin "Interfață" company section renders, no console errors; saved display name "Hale Test"
    (verify DB only) shows in the configurator header. Logo upload + "Folosim culorile din logo?" not clicked through
    (the built-in browser cannot pick a file).
  - 375 px: no horizontal scroll, header fits.
  - ISSUES: (1) T2 ConfigHeader: a long name ("Configurator hale", the default) is clipped and runs into the step
    indicator at 1440 and 800 px (needs truncate + room). (2) T1a HistoryButtons on phones sit on top of the admin
    models bar (admins only). (3) T1a toast overlaps the admin bar at desktop (minor). -> small fix before/with wave 2.
- Wave 1 layout fixes (orchestrator, small): ConfigHeader md+ grid (name truncates, title tooltip), StepIndicator labels
  lg+, HistoryButtons phone bottom-left above the view bar, toast bottom centre. Checked at 1440, 820 and 375 px with a
  38-character name (verify DB). Gate GREEN (tsc, lint 0/0, 643 tests, build). User OK'd wave 2 after these fixes.
- Wave 2 plan: batch A now = T1b+c (opus, r2-t1bc), T3b+c (opus, r2-t3bc), T4 measure+design+build (opus, r2-t4).
  Batch B after T4 merges = T5b pick mapping (opus; needs KitInstances, which T4 owns) -> T5b UI/info card (sonnet),
  and T4 tuning (sonnet). Worker dev-server ports: T1 3014, T3 3015, T4 3016 (Chrome via CDP, temp profile).
  Gate now includes `pnpm exec prisma generate` (stale client after a schema merge).
- Batch A launched: T1b+c, T3b+c, T4 (all opus).
- T3b+c done (5d9db40 T3b, b8d2c14 T3c). Own files only (12). FlatViewDimensions (ortho fixed views, constant screen size,
  accent colour, hidden in perspective/after orbit, inside renderHiddenProps); DimensionLines takes `color`, formatMetres.
  PDF: 2 drawing pages (front + busiest side, plan + section), scale note; QuoteModel.drawings. Reviewed sample page
  (gable 52x16): chains sum, bubbles, dashed hidden steel OK. Merged r2-t3bc -> 77d824d. Gate GREEN (671 tests).
  Known limits: text wider than its segment is not drawn; CameraRig framing ignores annotation extent (can sit under the
  toolbar on small screens) -> candidate for T3d/T1f-time fix in CameraRig (unowned this round; orchestrator decides);
  quote now 5 pages.
- T1b+c done (e5692e1 T1b, 0f7211c T1c). Own files + 1 mount line for PlacementStatus in ConfiguratorLayout (HTML, can't
  live in the Canvas; accepted). Plus markers deleted -> PlacementPreview (bay band, red "nu încape", status line / phone
  "Gata" bar, first-time hint, drag card onto wall), snap() 0.30 m (bay centre, wall middle never on a column, equal gaps,
  sill), Alt/⌥ or phone switch -> wallStart, "Centrează în travee/pe perete"; new store API moveOpening, centreOpening,
  snapEnabled, snapGuides. 32 tests. Merged r2-t1bc -> d1ccc51 (engine auto-merged with T3's lines). Gate GREEN (703 tests).
  Not browser-checked by worker: card drop, Alt-drag, touch tap, right-click exit -> orchestrator's wave-2 check.
  Pre-existing: OrbitControls can rotate slightly at the start of an opening drag (CameraRig); legend cramped at ~800 px.
- T5b split: T5b-map (opus, r2-t5b-map) starts now — own raycast picker + pure mapping, no edits to T4's Hall/KitInstances/Steel (relies on T4's instance-order contract). T5b-ui (sonnet) after T4 + T5b-map merge.
- T5b-map done (f914057, 153k tokens). Own files + 2 engine lines (import + mount inside renderHiddenProps). Pure
  resolvePick / pickFromHits / highlightTarget / resolveKey / componentColor; useComponentSelection (mutually exclusive
  with opening selection); raycast picker on gl.domElement (5/10 px click slop). Instance-order contract tested against
  placeKit — T4's LOD must keep it (check at T4 review: culling must not reorder/compact instances without a mapping).
  37+4 tests. Not browser-checked (nothing drawn yet). Merged -> see next line.
- T5b-ui (sonnet, r2-t5b-ui) launched now: own highlight overlay + card, no T4 files; browser check required (port 3018).
- T4 done (ea784c7 baseline + script, 1f26662 governor/LOD/toggle; 237k tokens). Own files only. M5 already met target
  before changes (60 fps cap); 102 m hall 212k -> 83k tris at framed view; 4x: 58-60 fps. Governor ladder env -> shadow
  2048/1024/512 -> far detail -> DPR -0.25 to 1; constants in quality.ts (QUALITY_TUNING, TRIANGLE_BUDGET). Bolts in 12 m
  chunks, screen-size cull, offscreen renders draw all (quote renders pixel-compared L0 vs L8: same). Picking contract
  kept: name + userData.kitPiece, instance i = placement i; only bolts chunked (not pickable).
  Merged r2-t4 -> 5c9b6a2 (engine + layout auto-merged). Gate GREEN (771 tests, incl. T5b-map contract test vs placeKit).
  T4 tuning (sonnet) SKIPPED: target met (user asked to save tokens; 38% of the 5 h window used, keep 20%).
  Open: thresholds untested on a real weak phone; phone toggle can sit under the relayout toast while it shows.
- Budget decision (user at 38%, must keep 20%): finish wave 2 (T5b-ui + lean browser check), then STOP before wave 3.
- T5b-ui done (0b003e6, sonnet, 132k tokens). Own files + 2+2 mount lines. Worker browser-checked column, rafter, purlin,
  wall, roof, gutter picks, opening priority, Esc/empty/× clear, 375 px. Merged r2-t5b-ui -> bee10b0. Gate GREEN (771).
- Wave 2 browser check (orchestrator, verify worktree on main bee10b0, port 3010, 1440 px + 375 px):
  - T3b PASS: Dreapta ortho shows bays 5,71 m … L = 40 m, H / Coamă, axis bubbles 1..8, opening chain.
  - T1b PASS: window tool -> status "Plasezi: Fereastră …", preview centred in bay, click -> {bay 0, offset 'centre'},
    first-time hint gone, Esc ends tool.
  - T5b PASS: wall click -> card "Peretele lateral dreapta" (length, height, area, colour + RAL) + highlight.
  - T4 PASS: "Calitate Auto/Ridicată" next to undo/redo; phone: stacked above undo above the view bar, no h-scroll.
  - BUG found + FIXED (orchestrator, CameraRig.tsx): any click on the canvas left the fixed view (OrbitControls 'start'),
    so clicking a component/opening on a flat view hid its dimensions. Now leaves only on the first 'change' after 'start'.
    Verified: click keeps Dreapta + chains; drag still leaves. Gate GREEN (tsc, lint 0/0, 771 tests, build).
  - Minor, open: flat-view overlay shows during the 0.65 s glide before the camera arrives (floats briefly) -> T3d/T1f;
    first click after placing only deselects the new opening (by design: new openings start selected).
  - Not checked: card drop onto wall, Alt-drag, real touch, downpipe pick, governor on a real weak phone.
- STOP after wave 2 (user budget: keep 20% of the 5 h window). Next session: wave 3 = T1d, T1e, T1f, T3d, then QA
  (sonnet), fix round, final gate, SUMMARY-round2.md. Worktrees of this round are still on disk (not cleaned).
