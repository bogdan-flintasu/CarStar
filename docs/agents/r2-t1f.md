# Brief r2-T1f — resize polish + full-flow browser test (round 2, wave 3)

You are one worker in a multi-agent round on the industrial hall configurator (Next.js 16 + React Three Fiber + zustand,
app in `industrial-configurator/`). This brief is the whole contract. UI text is **Romanian**. Model: sonnet.

## Setup
1. In your worktree: `git merge --ff-only main`, then `git checkout -b r2-t1f`.
2. `cd industrial-configurator && pnpm install && pnpm exec prisma generate`.
3. Read `docs/plans/next-features.md` (T1, esp. T1a and T1f), the round log `docs/agents/ORCHESTRATOR-round2.md` (T1a, T1b+c,
   T1d+e, T3d entries), then `src/stores/useOpeningsStore.ts`, `src/components/3d/openings/**`,
   `src/components/configurator/{MovedOpeningsToast,HistoryButtons,PlacementStatus,OpeningsShortcuts,OpeningsSymmetry}.tsx`,
   `src/components/configurator/steps/ClosingsStep.tsx`.

## Goal
Finish the resize behaviour across everything T1a–T1e added, and browser-test the whole openings flow.
- The "N goluri au fost mutate · Anulează" toast, "Reașază automat" and the conflict states (`'fit'`, overlaps, red
  preview) must behave consistently for: single items, pasted/duplicated/repeated items, and linked twins (incl. a twin
  that does not fit on a mono-pitch gable). "Reașază automat" on a twin: decide whether it also re-mirrors the other (keep
  the pair consistent; document the choice).
- Delete the pair confirm ("Ștergi și perechea?") must also apply to any other delete path that exists (keyboard Delete /
  Backspace on a selected opening, if present; 3D view delete, if present). If none exist, say so.
- Fix any bug you find in the flow below within your owned files.

## Full flow to test in the browser (desktop 1440 and 375 px)
Place a window and a door → copy + paste mode (2 clicks, Esc) → duplicate → "Repetă" (every bay, N even) → symmetry
Stânga↔Dreapta and Pe axa peretelui with a garage door on a gable → resize the hall smaller (toast, moved items, red items)
→ larger again (items return to their anchors) → undo/redo through it all → delete one twin ("Doar acesta" / "Ambele").
Also: a mono-pitch hall, Față↔Spate twin that does not fit stays red. Keep screenshots few.

## Files you own
`src/stores/useOpeningsStore.ts` (+test), `src/stores/useHistoryStore.ts`, `src/components/3d/openings/**`,
`src/components/3d/WallOpening*.tsx`, `src/components/3d/PlacementMarkers.tsx`, `src/components/configurator/Openings*.tsx`,
`MovedOpeningsToast.tsx`, `HistoryButtons.tsx`, `PlacementStatus.tsx`, `steps/ClosingsStep.tsx`, the legend block in
`ConfiguratorLayout.tsx`. Do NOT edit hall/**, ViewToolbar, drawings, lib/hall, api, prisma.

## Acceptance
- Gate green from `industrial-configurator/`: `pnpm install && pnpm exec prisma generate && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`, lint 0/0.
- Tests for any logic you change. `git diff --stat main...HEAD` only owned files. No new dependencies.
- Dev server on port 3014 from your worktree (copy `.env*` and `prisma/dev.db` from
  `/Users/bogdan/Projects/WebNest/Hala/CarStar/industrial-configurator/` first; never touch the main checkout's database; never port 3000).
- Commit as you go. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.

## Report back (short)
Branch + commits; flow results step by step (pass/fail); bugs fixed; decisions; tests; gate; anything left for QA.
