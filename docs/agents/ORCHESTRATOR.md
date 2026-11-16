# Orchestrator log

Plan: REVIEW_FINDINGS.md §8/§10. Agents run in worktrees; orchestrator merges into local main (--no-ff) and gates.
Gate: `cd industrial-configurator && pnpm install && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`
Overrides: no git-lfs (.blend + big binaries in ~/CarStar-assets/); source model ~/CarStar-assets/da.glb.

| Agent | Model/effort | Branch | Port |
|---|---|---|---|
| A | sonnet/medium | ws-a | 3001 |
| B | opus/high | ws-b | 3002 |
| C | opus/high | ws-c | 3003 |
| D | fable/high | ws-d | 3004 |
| E | opus/high | ws-e | 3005 |
| F | sonnet/medium | ws-f | 3006 |
| Q | opus/high | ws-q | 3007 |

## Events
- 2026-11-16 Step 0: committed REVIEW_FINDINGS.md + .claude/launch.json; copied da.glb to ~/CarStar-assets/.
- Wave 1 launched: A (sonnet/medium, ws-a), C part 1 (opus/high, ws-c: C0,C4a,C1,C2).
- Note: agent worktrees are created from ef6e0f9 (not local main). All later agents must `git merge --ff-only main` first.
- A done (5ddc159). Merged ws-a -> 2ce3325. Gate 1: install/tsc/test/build GREEN; lint RED = 13 pre-existing errors in app code
  (D: Configurator.tsx, LandingScene.tsx, hardwareTier.ts; F: app/page.tsx, configuration/[token]/page.tsx, ConfiguratorLayout.tsx).
  Gate policy from here: lint error count must not rise above baseline; D and F fix their own lint errors.
- Handoffs from A: B adds auth vars back to .env.example (A-owned, route via fix agent); DEFAULT_PRICES duplicated in seed.ts / api/prices / store (B/F dedupe).
