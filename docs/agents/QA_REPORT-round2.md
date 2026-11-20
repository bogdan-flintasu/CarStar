# QA report: round 2 (r2-QA)

Base: main at e4bbe72 (branch `r2-qa`). App: `industrial-configurator/`, dev server on port 3017 against a copy of dev.db.
Method: gate, code review, in-app browser (1440 px desktop, 375 px phone). I reported only; no product code changed.

## 1. Gate

| Step | Result |
|---|---|
| `pnpm exec prisma generate` | OK |
| `pnpm exec tsc --noEmit` | 0 errors |
| `pnpm lint` | 0 errors, 0 warnings |
| `pnpm test` | 54 files, 840 tests, all pass |
| `pnpm build` | OK. One Turbopack warning (pre-existing): `next.config.ts` "Encountered unexpected file in NFT list" (whole project traced) plus the Node `DEP0205` deprecation notice |

Gate: GREEN.

## 2. Per-item table

| Item | Verdict | Evidence |
|---|---|---|
| T1a anchors + undo/redo | PASS | `stores/useOpeningsStore.ts` (intents are truth, `openings` derived; `setWallSpans` never writes back), `components/3d/openings/anchors.ts`, `stores/useHistoryStore.ts`. Browser: toast "3 goluri au fost mutate · Anulează" on resize; Cmd+Z reverted a whole "Repetă" in one step (10 -> 2) and Cmd+Shift+Z restored it (10); Undo/Redo buttons present. v2 migration + server schema accepting v0/v1/v2 (`lib/validation/configuration.ts:55-80`) covered by tests |
| T1b placement without plus markers | PASS | Status line "Plasezi: Fereastră · click pe perete · Esc pentru a termina" seen; bay highlight and red "nu încape" seen; tool stays active after placing; Esc ends it; first-time hint "1. Alege tipul · 2. Click pe perete · 3. Trage pentru a muta" shown and gone after the first placement; card drag onto a wall places (synthetic DragEvent with DataTransfer: 9 -> 11 with symmetry on); phone: bar "Plasezi: Fereastră · atinge o travee" + "Gata", a touch tap placed (14 -> 15). Right-click exit: code only (`PlacementPreview.tsx:157-177`) |
| T1c snapping | PASS (partly untested) | Legend "Alt/⌥ · Fără aliniere", phone "Aliniere: on" switch, "Centrează în travee" / "Centrează pe perete" buttons all present; `snapping.test.ts`. Alt-drag and guide lines not exercised in the browser |
| T1d copy / paste / repeat | PASS | "Duplică", "Copiază", paste mode ("Lipești: …" status, 3 clicks -> 3 copies, the 4th spot "nu încape"), Repetă "N bucăți, egal distanțate" (N=4: 4 windows, gaps 6.3 / 6.61 / 6.61 / 6.61 / 6.3 m, even), "În fiecare travee" (+4). "La fiecare a doua travee" not run. Cmd+D on a full wall correctly refused. Shortcuts ignore input fields (`shortcuts.ts:40`) |
| T1e symmetry | PASS | Four modes in the selector. Stânga↔Dreapta and Față↔Spate each added a linked twin. Delete dialog "Ștergi și perechea?" with "Doar acesta" (count 10, the other twin lost its link and deleted without a dialog) and "Ambele" both work. Mono-pitch twin that does not fit: a 3 x 5 m door on the high wall of a mono hall got a twin on the 4 m wall that stayed red "nu încape" + "Reașază automat", not shrunk. "Pe axa peretelui" for garage doors: worker + tests only. See findings 4 and 5 |
| T1f resize polish | PASS | Resize, undo, toast verified (see T1a); phone toast full width (worker). See findings 5 and 9 |
| T2 brand identity | PASS (partly untested) | Schema `Organization` / `BrandIdentity` / `Asset` (`prisma/schema.prisma:93-127`), migration 20261119145103; `/api/brand` returns name, logoUrl with `?v=sha8`, accent; logo route sends ETag, `nosniff`, sandbox CSP; admin routes all call `requireAdmin` (21 route files checked; 401 verified with curl on POST logo and PUT brand); magic-byte sniff + 1 MB cap + sharp decode check. PDF page 1 shows logo + company block; quote links snapshot at save (`api/configurations/route.ts:50-60`). Header logo visible. Logo upload, "Folosim culorile din logo?" and theme generator UI not clicked through (see findings 1, 6). Leftover orange: finding 11 |
| T3a drawing model | PASS | `lib/hall/drawings.ts` (pure), 46 tests. `buildDrawings` (plural) has no caller, see finding 12 |
| T3b dimensions on flat views | PASS | Dreapta/Față ortho: bay widths, total length, H / Coamă, axis bubbles 1..6 / A..B, opening chains in the accent colour. See finding 8 (label under the toolbar) |
| T3c PDF elevations | PARTIAL (not seen) | PDF has 5 pages (`/api/configurations/<token>/pdf`, 1.29 MB, 200). I could only rasterise page 1 (no PDF tool for the others); pages 2-5 verified only by `quoteDrawings.test.tsx` and the orchestrator's earlier sample |
| T3d section cut + layers | PASS | "Secțiune" (Oprită / Transv. / Longit., slider, "Capace"), "Straturi" (6 toggles + "Arată toate"). Cut at mid-length with caps showed the flat caps on the wall panels; steel is not capped (documented in `SectionCut.tsx:12`, known note confirmed). Layer "Acoperiș" hidden worked. **Quote with a cut and the roof hidden: all 4 renders and the PDF cover show the whole hall with its roof and no cut**, the live view was untouched (`renders.tsx:204-207`, `layers.ts:74-88`) |
| T4 adaptive performance | PASS (limits) | 102 m hall (20 x 102 x 6, step 1): `__hallQuality.describe()` = "auto L0 env:on shadow:2048 detail:far dpr:2", 73,9k triangles in the framed view (estimated 286k before LOD), 30 draw calls; 75 fps median 13.3 ms, p95 14 ms while orbiting. "Calitate Auto / Ridicată" toggle present (desktop and phone). The CPU-throttled behaviour and a real weak phone not tested; the plan's table was produced by `scripts/measure-perf.mjs`, which I did not re-run. Debug hooks are `NODE_ENV`-gated (`HallStatsProbe.tsx:61`, `qualityController.tsx:153`, `useHallUrlParams.ts:29`) |
| T5a lens | PASS | `CONFIGURATOR_FOV = 45` (`lib/hall/cameraViews.ts:58`), used by the engine (`ConfiguratorEngine.tsx:116`) and the CameraRig fallback |
| T5b component pick + card | PASS | Click on the front wall: highlight + card "Perete față": width, eave height, max height, area without openings, colour "Alb-gri · 9002". Opening priority and Esc/empty click verified by the worker and orchestrator; downpipe, column, rafter pick not re-tested. See finding 10 |

## 3. Findings

Counts: blocker 0, major 1, minor 9, nit 3 (13 items).

1. **major / T2 / `lib/validation/brand.ts` `sanitizeSvg` (the `</style>` branch, about lines 168-175)**: any SVG that contains a `<style>` element is sanitized into broken XML, so the upload fails. The opening tag is already pushed when the element starts, and on the closing tag the code pushes `<style>text</style>` again, giving `<style><style>…</style>`. `sharp(...).metadata()` in `app/api/admin/brand/logo/route.ts:34` then throws "Opening and ending tag mismatch" and the admin sees "Imaginea nu poate fi citită". Repro: `sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:red}</style><rect class="a" width="5" height="5"/></svg>')` returns the doubled tag; run sharp on it. Illustrator, Inkscape and Figma exports commonly use `<style>`. Fix: on a safe close push only `${styleText}</style>`, not a second opening tag; add a test with a `<style>` SVG that also round-trips through sharp.
2. **minor / T2 / `lib/validation/brand.ts` `UNSAFE_CSS`**: CSS escapes bypass the check: `fill:u\72l(http://evil/x)` and `@\69mport "…"` come out unchanged (ran `sanitizeSvg`). Low impact (the file is served as an image with `sandbox` CSP, and images in `<img>` cannot fetch), but the PDF path rasterises it with sharp/librsvg. Fix: reject any `\` in style text and style attributes (or drop `<style>` support), after fixing finding 1.
3. **minor / T1 / `components/configurator/ConfigFooter.tsx:41`**: when the only conflict is "nu încape" (an opening or a mono-pitch twin that no longer fits), the footer still says "Golurile se suprapun: mutați-le pentru a continua." (overlap). The panel text is correct ("nu mai încape"). Repro: mono hall, Stânga↔Dreapta symmetry, 3 x 5 m industrial door on the high wall. Fix: use the wording that covers all conflict kinds ("Unele goluri nu sunt valide…") or pick the text by conflict kind.
4. **minor / T1 / `components/configurator/steps/ClosingsStep.tsx` ("Repetă" result) and `stores/useOpeningsStore.ts` `repeatOpening`**: with symmetry on, "Repetă" adds copies and their twins, but the result line reports only the copies ("4 copii adăugate" while the Geamuri count went 2 -> 10, so 8 were added). Known note confirmed. Also the result text stays visible after selecting another opening ("3 copii adăugate" was still shown for a different selected window). Fix: report `added` including twins ("4 copii + 4 perechi") and clear the result when the selection changes.
5. **minor / T1 / `stores/useOpeningsStore.ts:396-403` (`autoPlaceOpening`)**: when the mirrored spot does not fit, the pair is unlinked silently (`unlinkPair`), no message. Known note confirmed. Fix: call `showMessage('Perechea a fost desfăcută: poziția oglindită nu încape')`. The store also has no test for the unlink branch (`useOpeningsStore.test.ts`); add one.
6. **minor / T2 / not testable here**: logo upload UI, the "Folosim culorile din logo?" dialog and the theme generator were not clicked through (the in-app browser cannot pick a file, and I did not log in to /admin). Covered only by `brandColors.test.ts`, `themeGenerator.test.ts`, `brand.test.ts`. A manual pass is still needed, with an SVG that has `<style>` (finding 1).
7. **minor / T1 / `components/configurator/StepIndicator.tsx:30` + `ConfiguratorLayout.tsx:137`**: the step indicator calls `setStep` directly, so with red openings a user can jump to "Sumar" and send a quote without passing the "Continuă" gate (`ConfigFooter.tsx:52`). The server accepts any anchors. Fix: gate `onStepClick` for steps above 3 with the same `selectHasOpeningConflicts`, or accept and say so.
8. **minor / T3 / `components/3d/hall/CameraRig.tsx` framing**: on an ortho flat view at desktop width the height chain ("H = 5 m / Coamă") at the right edge sits under the view toolbar (seen in Dreapta at 1440 px). Known (annotation extent ignored). Fix: add the annotation margin and the toolbar width to the framing.
9. **minor / T1 / UX on 375 px**: with the "Plasezi … Gata" bar, the "Pentru experiența completă…" banner, the quality toggle, the undo buttons and the view bar, only about 120 px of the 3D view stays free above the sheet; placing worked but is cramped. Fix: dismiss the banner while a tool is active, or put the quality toggle in the sheet.
10. **minor / T5 / `components/3d/hall/ComponentPicker` card**: the card for a 12 m wide hall says "Lățime 12,92 m" and "Înălțime la streașină 5,33 m" for h = 5 (outer cladding sizes). Probably intended, but a customer will compare it with the numbers they typed. Fix: label it "dimensiune exterioară" or show the axis sizes.
11. **nit / T1 / `components/configurator/steps/ClosingsStep.tsx:190,509` and `SummaryStep.tsx:313`**: leftover orange: `bg-orange-50` on the selected opening-type card (visible beside a blue brand), and `hover:bg-orange-55` is not a Tailwind class (no effect). Fix: use a theme-variable tint; drop the dead class.
12. **nit / T3 / `lib/hall/drawings.ts:558` `buildDrawings`**: no caller outside tests (the code uses `buildDrawing`). Dead until the DXF phase; keep or delete.
13. **nit / T1 / duplicated `isTyping`**: four copies (`HistoryButtons.tsx:7`, `PlacementStatus.tsx:19`, `ViewToolbar.tsx:32`, and `isTypingTarget` in `openings/shortcuts.ts:40`). Fix: import `isTypingTarget`.

Also seen, not logged as findings: dimension chain labels overlap where windows are close ("1,5 m" over each other in Față at 15 m); the "Vedere spate" render is mostly trees; the PDF footer link uses `APP_BASE_URL` (localhost:3000 here, by configuration); landing page and root layout still say "CarStar" (out of T2 scope per the log); no keyboard or 3D delete for openings (known).

Contract checks (anchors, drawings, section, picking, LOD): no break found. Hidden layers are `visible=false`, so pickers skip them and quote renders restore them (`layers.ts`, `renders.tsx`); `ComponentPicker` filters cut-away hits; the pick mapping is tested against `placeKit`; quote drawings use the placed rectangles (`quoteModel.ts:191`); offscreen renders draw every bolt chunk. Security of the T2 routes: all admin routes guarded (`requireAdmin`), logo upload checked by magic bytes + size + decode, session cookie `sameSite: strict`, logo served with `nosniff` and a sandbox CSP; only finding 2 is open.

## 4. What I could not test

- Real mouse hover/click on the canvas: with the in-app browser's synthetic mouse, hover and click did not reach the 3D canvas (no preview, no placement), while DOM clicks and keys worked. I drove the canvas with dispatched PointerEvents, DragEvents (card drop) and touch-type PointerEvents (phone). I could not tell whether the real-mouse failure is the harness or the app; worth one manual check.
- Alt-drag snapping and guide lines, right-click exit, "La fiecare a doua travee", "Pe axa peretelui".
- Admin UI (login not used), logo upload, colour extraction, theme generator, favicon, emails with the logo.
- PDF pages 2-5 (drawings), no PDF rasteriser available; only page 1 was looked at.
- Governor under CPU throttling and on a real weak phone; `scripts/measure-perf.mjs` not re-run.
- Pick of column, rafter, purlin, gutter, downpipe (only the wall pick re-tested).
- Viewport: the pane renders at about 710 x 444 px, so 1440 px checks were done with an emulated 1440 x 900 viewport and scaled screenshots; the 375 px check was emulated.
