# Brief r2-fix — fix round after QA (round 2)

You fix findings from `docs/agents/QA_REPORT-round2.md` (section 3) in the industrial hall configurator (`industrial-configurator/`).
UI text is Romanian. Model: sonnet. Read the report first; each finding has file:line, repro and a suggested fix.

## Setup
In your worktree: `git merge --ff-only main`, `git checkout -b r2-fix`, `cd industrial-configurator && pnpm install && pnpm exec prisma generate`.

## Fix (one commit per finding or small group; tests for logic)
1. (major) `sanitizeSvg` doubled `<style>` tag. Test with a `<style>` SVG that also passes `sharp(...).metadata()`.
2. CSS escapes: reject any `\` in style text and style attributes (test both).
3. Footer conflict wording covers "nu încape" (pick text by conflict kind, or a wording that covers all).
4. "Repetă" result counts twins too (e.g. "4 copii + 4 perechi adăugate"; keep "X nu au încăput") and clears when the selection changes.
5. `autoPlaceOpening` unlink: show a message ("Perechea a fost desfăcută: poziția oglindită nu încape") + store test for the unlink branch.
7. Step indicator: jumping beyond the openings step is blocked while `selectHasOpeningConflicts` is true (same rule as "Continuă").
8. Ortho flat-view framing in `CameraRig.tsx` leaves room for the dimension annotations and the view toolbar (height chain not under the toolbar at 1440 px). Keep the existing fixed-view/plain-click behaviour intact.
9. 375 px: free more of the 3D view while a placement tool is active (e.g. hide the "Pentru experiența completă…" banner while a tool is active). Small change only.
10. Component info card: label the sizes as outer dimensions ("exterior") — wording only.
11. Leftover orange tints in `ClosingsStep.tsx` / `SummaryStep.tsx` → theme variable tint; drop the dead `hover:bg-orange-55`.
13. Replace the duplicated `isTyping` helpers with `isTypingTarget` from `components/3d/openings/shortcuts.ts`.
Not in scope: 6 (manual admin pass for the user), 12 (`buildDrawings` kept for the DXF phase).

## Acceptance
- Gate green from `industrial-configurator/`: `pnpm install && pnpm exec prisma generate && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`, lint 0/0.
- No new dependencies. Only files the findings name (plus their tests).
- Quick browser check of 3, 4, 7, 8, 9 (dev server port 3018 from your worktree after copying `.env*` and `prisma/dev.db` from
  `/Users/bogdan/Projects/WebNest/Hala/CarStar/industrial-configurator/`; never that database; never port 3000). Few screenshots.
- End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.

## Report back (short)
Branch + commits; per finding: fixed / not fixed (why); tests; gate; browser results.
