# Round 2 — summary

Final gate on main (8ff71d3): `pnpm install`, `prisma generate`, `tsc --noEmit`, lint (0 errors, 0 warnings),
843/843 tests (54 files) and build are all green. The only build warning is the old Turbopack NFT one.
Branches were merged locally with `--no-ff`. Nothing was pushed. Contract: `docs/plans/next-features.md`.
Full log: `ORCHESTRATOR-round2.md`. QA: `QA_REPORT-round2.md`. Briefs: `r2-*.md`.

## Per track
- **T1a, anchors + undo:** each opening is stored as an intent anchored to a bay, the gable axis or the wall start. A
  resize never overwrites it, so shrinking and growing the hall back returns every opening to its spot. A toast "N goluri
  au fost mutate · Anulează" and "Reașază automat" handle items that no longer fit. Undo/redo keeps 100 steps; a drag counts
  as one step.
- **T1b+c, placement and snapping:** a live preview shows the bay band and a red "nu încape" when the opening doesn't
  fit. There's a status line (a "Gata" bar on phones) and a type card can be dragged onto a wall. Openings snap to the bay
  centre, the wall middle, equal gaps and the sill; Alt/⌥ places freely.
- **T1d, copy/paste/repeat:** ⌘/Ctrl C/V/D work, plus "Duplică" and "Copiază". After a copy, each click places another one
  (paste mode). "Repetă" fills every bay, every second bay or N evenly spaced spots, and reports "copii + perechi adăugate
  · X nu au încăput".
- **T1e, symmetry:** "Simetrie" offers Stânga↔Dreapta, Față↔Spate and "Pe axa peretelui". New items get a linked twin;
  moving or resizing one moves the other in the same undo step. Deleting asks "Ștergi și perechea?". A twin that doesn't
  fit stays red and is never shrunk.
- **T1f, resize polish:** "Reașază automat" on a twin re-mirrors the other, or unlinks the pair with a message when the
  mirrored spot doesn't fit. The moved-openings toast now fits phones. The whole flow (place, copy, mirror, resize smaller
  and larger, undo/redo, delete a pair) was tested in the browser.
- **T2, brand identity:** an Organization with a BrandIdentity (display name, logo, colours, theme) via a migration. Admins
  can upload a logo (PNG/JPG/SVG, 1 MB, magic bytes checked, SVG sanitised). The company name and logo appear in the
  configurator header, the admin header, the PDF quote, the emails and the favicon.
- **T3a–c, drawings:** a pure drawing model, `buildDrawings`. Flat views get dimension chains in the accent colour at a
  constant screen size. The PDF quote gains 2 drawing pages (front + busiest side, plan + section) with a scale note.
- **T3d, section cut + layers:** "Secțiune" cuts across the hall (Transversală) or along it (Longitudinală), moved with a
  drag handle or a slider, with optional filled caps. "Straturi" has 6 layer toggles; hidden or cut-away parts can't be
  clicked. Quote renders always show the whole hall.
- **T4, performance:** a quality governor (shadows → far detail → resolution), LOD and bolts in chunks. The 102 m hall
  went from 212k to 83k triangles in the framed view and runs at about 75 fps. The "Calitate Auto/Ridicată" toggle sits
  next to undo/redo.
- **T5a, lens:** a 45° field of view, with framing adjusted for desktop and phone.
- **T5b, component details:** clicking a column, rafter, purlin, wall, roof or gutter highlights it and opens an info card
  (sizes labelled as exterior, area, colour + RAL).

## QA and fixes
- QA found no blockers, 1 major, 9 minor and 3 nit. The fix round fixed all of them except two:
  - #6 was left for you: a manual pass in admin.
  - #12 was kept on purpose: `buildDrawings` has no caller yet, but the DXF phase needs it.
- The major one: SVG logos that contain a `<style>` element failed to upload. That's fixed, and a test now runs such a
  file through sharp.
- Also fixed:
  - CSS escapes are rejected in SVGs.
  - The footer conflict text now covers both overlaps and "nu încape".
  - The step indicator can't jump past openings that are red.
  - Flat views leave room for the dimension chains next to the toolbar.
  - On phones the recommendation banner hides while you place an opening.
  - Leftover orange tints are gone.
  - The typing check now lives in one helper.
- The orchestrator found and fixed one bug: a plain click left the fixed view and hid its dimensions.

## Not verified / open
- **Logo upload and colours (manual, for you):** the logo upload, "Folosim culorile din logo?" and the theme generator
  were never clicked through in admin. The in-app browser can't pick a file. Try an SVG logo that contains a `<style>`
  element.
- **PDF drawing pages:** pages 2–5 were not looked at in the final build.
- **Not exercised in the browser:**
  - Alt-drag snapping, right-click to leave paste mode, and "La fiecare a doua travee".
  - The fix-round changes #3, #4 and #7. They're covered by tests and code review only.
  - Clicking a column, rafter, purlin, gutter or downpipe was only checked by the T5b worker, not in QA.
- **Weak phones:** the governor's thresholds were never tried on a real weak phone or with CPU throttling.
- **Known limits:**
  - Steel members aren't filled in at the section cut.
  - The flat-view overlay shows briefly during the camera glide.
  - Layer and section state isn't saved between visits.
  - The landing page and the root title still say "CarStar".
- **Process:** both wave 3 workers stopped once mid-run, with no commits. They were relaunched in the same worktrees and
  their work was kept. Worktrees from this round are still on disk; clean them up when you're happy.
