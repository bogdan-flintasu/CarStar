# Brief r2-T5a — narrower lens (round 2, wave 1)

You are one worker in a multi-agent round on the industrial hall configurator (Next.js 16 + React Three Fiber, app in
`industrial-configurator/`). You have no memory of earlier discussions; this brief is the whole contract. Model: sonnet.
Small task: keep the diff small.

## Setup
1. In your worktree: `git merge --ff-only main`, then `git checkout -b r2-t5a` (if taken: `r2-t5a-2`).
2. `cd industrial-configurator && pnpm install`.

## Goal
The configurator's 3D view uses a 75° vertical field of view, which distorts the hall. Change the default to **45°**,
defined as **one constant**, and keep the camera framing correct (framing already adapts through `src/lib/hall/cameraViews.ts`).

## Files you own
- `src/lib/hall/cameraViews.ts` (add and export e.g. `export const CONFIGURATOR_FOV = 45;`) and `src/lib/hall/cameraViews.test.ts`
- `src/components/3d/hall/CameraRig.tsx`: only the `FALLBACK_FOV` constant → use the new constant
- `src/components/configurator/ConfiguratorEngine.tsx`: only the `camera={{ fov: 75, … }}` line → the constant.
  This file is shared with other tracks: change that single line plus the import, nothing else.
Do NOT change `src/components/3d/hall/renders.tsx` (quote renders keep their own fixed cameras) nor `LandingScene.tsx`.

## Tasks
1. Add the constant, use it in the two places above.
2. Check the initial camera position in `ConfiguratorEngine` (`position: [-6, 7, 13]`) and anything in `CameraRig.tsx` /
   `cameraViews.ts` that assumed 75° (distances, fill factors, zoom ↔ distance in the orthographic switch, min/max
   distance of the orbit controls): with a narrower lens the camera must stand further back so the hall still fills the
   view the same way. Framing goes through `frameView(...)`/`cameraViewPose(...)` with `viewport.fov`, so it should already
   adapt; verify, and fix only what actually assumed 75° (e.g. `maxDistance` too small for a 102 m hall at 45°).
3. Update the tests: viewport `fov` → the constant; add a test that the 102×20×6 hall and the 12×12×4 hall are fully
   inside the frustum for every fixed view at 45° (both a wide 1200×800 and a phone 375×700 viewport), and that the
   perspective ↔ orthographic switch keeps the apparent size (zoom ↔ distance round trip at 45°).

## Acceptance
Gate green from `industrial-configurator/`: `pnpm install && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`,
lint 0/0. `git diff --stat main` shows only the files above. No dev server on port 3000 (not needed).

## Report back (short)
Branch + commit, what assumed 75° and what you changed, tests added, gate. End commit messages with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
