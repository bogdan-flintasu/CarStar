# Plan: interior walk-through of the hall ("Intră în hală")

Status: **planned, not started.** Stages 1–2 come after the current feature round (docs/plans/next-features.md) and
**before** AR (docs/plans/ar.md); they need nothing from the other plans. Stage 3 needs the GPU render server
(docs/plans/gpu-render-server.md) and is done with it.

## Goal

The customer walks inside the configured hall, at eye height, in the browser: they feel the clear height, see the
frame and the roof from below, the light through the windows, where the doors are, and how much room a forklift and
pallet racks take. It complements AR: AR shows how the hall sits on the real plot (outdoors, on a phone); the
walk-through shows what it is like to stand inside (anywhere, desktop or phone).

It runs on the customer's device, like the configurator. No pixel streaming (rejected in the GPU plan: input lag, a GPU
per visitor). The scene is the one the configurator already draws, so a device that runs the configurator runs this.

## What the user does

1. "Intră în hală" in the 3D view (and on the saved configuration page). The camera glides to the main door (the
   largest garage door, else a door, else the middle of the front wall), turns to face inside and drops to eye height.
2. Moves around inside (and out through any door), looks up at the roof, opens and closes doors.
3. "Ieși" or Esc: the camera glides back to the orbit view it left. Editing is off while walking.

## Controls

- **Desktop:** click into the view to look with the mouse (pointer lock); WASD or the arrows to move; Shift to run;
  Esc leaves pointer lock, a second Esc (or "Ieși") leaves the walk-through. A one-line hint on entry.
- **Phone / tablet:** a joystick on the left half of the screen to move, drag on the right half to look. Landscape
  suggested, portrait works.
- Eye height 1.70 m above the floor slab; walking speed about 1.5 m/s, running about 4 m/s; smooth acceleration.
- **Teleport points** for people who do not like WASD: entrance, centre, each door, the far corner. Tap on the floor to
  walk there (a short glide, collision-checked).
- **Mini-map** (corner, collapsible): the plan from `lib/hall/drawings.ts` with the user's position and view direction;
  tap to teleport.

## Collision: from the layout, not from the meshes

The engine knows the hall exactly, so collision is a small 2D model built from `HallLayout` and the openings, with no
raycasting against triangles. Pure TypeScript in `lib/hall/walkPlan.ts`, unit-tested:

- **Walls** (`layout.walls`): solid segments along the inner face of the cladding, with the user as a 0.25 m circle.
- **Openings** (`components/3d/openings/types.ts`): `door` and `garageDoor` cut a gap in their wall's segment that the
  user can pass when the door is open; `window` never cuts a gap (its sill is above the floor).
- **Columns** (`layout.columns`): solid rectangles of the column section.
- **Outside:** the user can walk out through a door onto the site, inside a limit around the hall (the yard of
  `lib/hall/sitePlan.ts` when the scenery is loaded, else the hall's bounds plus 15 m), so nobody gets lost on the plain.
- **Floor height:** the slab top inside, the terrain outside, with a short ramp at door thresholds. A later mezzanine
  (not in the engine today) would add stairs as ramps here.
- Sliding along walls instead of stopping dead; the model is rebuilt only when the layout or openings change.

## Doors

- Door state lives in a small store, all open by default when entering so the hall is never a closed box.
- Click or tap a door (or press E facing it) to toggle it: the garage door's panels slide up, the personnel door swings.
  The 2D model follows the state (a closed door blocks its gap).
- Walking into a closed personnel door opens it.

## Look: what makes the inside read as real

An enclosed hall drawn with the live lighting is almost black inside. Stage 1 lights it properly; stage 3 bakes it.

- **Lighting (stage 1):** reuse the quote render's staging (`components/3d/stage/staging.ts`, `sky.ts`): the summer sky
  as background and image-based light, the sun with a fixed midday direction. `applyStaging` is already written to be
  applied and undone, so entering applies it and leaving restores the live view, with live-friendly settings
  (below). Plus a soft interior fill light so the far end of a long hall without windows is not dark.
- **Inside faces:** wall and roof panels show their liner colour from inside; the steel frame lit from below; no
  missing back faces or z-fighting at panel joints, trims and the slab edge (things that never show in the orbit
  view). A checklist pass on the 12, 40 and 102 m halls.
- **Scale cues:** people, a forklift and pallets at real size, so "6 m clear height" means something.

## Scenery: the quote render's models

The quote pictures already load a summer site (`components/3d/stage/props.ts`, `site.ts`; credits in
`public/render/CREDITS.md`): sky (1.7 MB), cars, van, two workers, forklift, pallets, bushes, trees and distant
buildings. About 5.5 MB once, about 200–300k triangles: fine on current phones and easy on desktop. Today they load only
for the quote pictures; the walk-through is their first live use.

- **Loaded after entering**, behind the first frame: the user starts walking at once and the site fades in.
- **Interior props (new):** `lib/hall/propPlan.ts` places everything outside today. Add an interior plan: a forklift and
  pallets near the main garage door, a row of pallet racks along one long wall (a simple procedural rack, no new
  download), one or two workers. Kept clear of doors, walk lines and teleport points; seeded, so the same hall always
  looks the same.
- **Worker model:** 54k triangles for one person; decimate to about 8k (no visible difference at walking distance).
- **Credits:** the CC BY 4.0 line shown under the walk-through while the scenery is loaded.

## Performance: the live quality ladder, not the render's settings

The quote renders use settings meant for a few stills (4096 shadow map over the whole yard, 16-sample GTAO, 4× MSAA on
half-float targets). Live, the walk-through uses the T4 quality system (`components/3d/hall/quality.ts`,
`qualityController.tsx`) with a walk-through profile:

- Shadow map 2048 (1024/512 down the ladder) whose frustum follows the user (about 40 m around them), not the yard.
- Ambient occlusion at half resolution and fewer samples on high tiers, off on low tiers: it matters most indoors
  (corners, under the frame), so it is the last effect after the shadows to go.
- MSAA 2× or a cheap edge filter; DPR steps and floor as in T4.
- Inside, culling does more work than in the orbit view (most of the site is behind walls); far trees and buildings at
  low detail; bolts and cleats only near the camera (T4's LOD already does this).
- Continuous rendering only while walking or looking; on demand otherwise, like the live view.
- Budget: 30 fps or more on the 102 m hall at 4× CPU throttling and on a mid-range Android phone; the same frame-time
  watcher lowers quality step by step.

## Stage 3 (with the GPU render server): baked lighting

Real-time lighting cannot match the path-traced look; baked lighting comes close at almost no cost to the device. The
hall does not change while walking, so the expensive light is computed once per configuration revision:

- The GPU worker (same queue, same server-side export as AR stage 2 and the HD renders) path-traces the lighting into
  lightmaps for the slab, walls, roof and frame: bounced light, soft shadows, sun through windows and skylights.
- Job kind `lightmap`, results stored with the configuration and frozen with the quote, served like the AR files.
- The browser shows them as textures: as cheap as normal rendering, so phones get the realistic look too.
- Limits: a saved configuration or sent quote only (not live editing); the sun is fixed; opening a door does not
  change the light; a few MB of textures per hall. Without lightmaps (editing, or not yet baked) the stage 1 lighting is
  used.
- The GPU plan's flythrough video is the fallback for devices that cannot run the walk-through at all.

Optional desktop extra: refine when standing still (path-trace the current view in the browser after about 1 s
without input, a photoreal picture in a few seconds; back to real time on the first movement).

## Implementation status (2026-11-21, branch `feat/walkthrough`)

Stages 1–2 built: `lib/hall/walkPlan.ts` (+ tests), `stores/useWalkStore.ts`, `components/3d/walk/WalkRig.tsx` and
`WalkStaging.tsx`, `components/configurator/WalkOverlay.tsx`, door leaves in `WallOpening.tsx`, "Intră în hală" in the
view toolbar, interior props and racks in `propPlan.ts` / `props.ts`, worker model 53.7k → 9.0k triangles.
Checked in the browser (12 × 24 × 5 m hall): enter/leave glides, walking, an industrial door stopping the walker when
closed and passable when open, interior lighting and props, mini-map and teleports.

Differences from the plan above, still open:
- No entry on the saved configuration page: that page has no 3D view yet.
- The shadow map covers the hall plus 10 m (not a box following the walker); no live ambient-occlusion pass.
- Not measured yet: the performance rows (`scripts/measure-perf.mjs`) and the device matrix (phones, Safari, Firefox).
- Doors cannot be clicked in the 3D view; they are toggled with E or the on-screen button.

## Not in this plan

- VR headsets (Quest via WebXR): later, from the same scene and controls.
- Mezzanine, interior offices and partitions: when the engine has them.
- Measuring tools inside (a height readout to the frame or to a door's top could come with stage 2 if cheap).
- Multiplayer (salesperson and customer walking together).

## Tests and acceptance

- Unit (`walkPlan`): cannot cross a wall or a window; can pass an open door's gap, not a closed one; columns block;
  the spawn point is inside, in front of the main door; the outside limit holds; the model follows layout and opening
  changes; sliding along a wall keeps the parallel movement.
- Unit (interior props): nothing inside a door's sweep, on a teleport point or overlapping a column.
- Performance: `scripts/measure-perf.mjs` extended with a walk-through row (a scripted path through the 12, 40 and
  102 m halls), numbers recorded in this file, against the budget above.
- Manual device matrix (recorded here): desktop Chrome, Safari, Firefox; iPhone Safari; mid-range Android Chrome; a
  low-end Android (lowest quality level still usable).
- Done when: a customer enters from the 3D view or the saved configuration, walks the whole hall and out through a door
  without passing through a wall, opens and closes doors, and the inside reads as a real hall (lit, liner colours,
  scale props) at the budget's frame rate.

## Metrics

Count walk-through entries and time spent per configuration and per company, next to AR opens: a usage signal for the
company's dashboard.

## Rough effort

- Stage 1 (controls, collision, doors, entry/exit, lighting and inside-face pass, mini-map, teleports): 1.5–2 weeks.
- Stage 2 (scenery live, interior props, worker decimation, performance profile and measurements): about 1 week.
- Stage 3 (lightmap bake on the GPU worker, storage and loading): 1–1.5 weeks, with the GPU render server.
