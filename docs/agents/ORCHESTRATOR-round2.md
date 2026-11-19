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
