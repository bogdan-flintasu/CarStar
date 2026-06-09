## Plan: Fix Roof Through Blender Hierarchy

The valid fix here is to remove the roof/gutter assemblies from the width-scaled support chain in Blender, not to keep fighting it in code. `AcoperisSTG` and `AcoperisDR` are direct children of `stalp_sus_1` and `stalp_sus` in the GLTF export, so when those supports scale in X the roof inherits the scale and the `jgheab`/`burlan` pieces inherit the resulting pitch and angle. The runtime can stay mostly unchanged after the model hierarchy is corrected.

**Steps**
1. In Blender, inspect the parent tree for `AcoperisSTG`, `AcoperisDR`, `jgheabSTG`, `jgheabDR`, `burlan_spateSTG`, and `burlan_spateDR` and confirm they are parented under `stalp_sus` / `stalp_sus_1` or another width-scaled node.
2. Reparent the roof and gutter assemblies to a neutral parent such as the model root or a dedicated empty that does not receive width scaling.
3. Apply transforms on the new parent chain so the meshes keep their world position and pitch but their local scale becomes stable.
4. Verify the pivot/origin of each roof piece is correct so the angle is preserved without inheriting support-beam scale.
5. Re-export the GLTF and test width changes only against the support beams; the roof should keep its size while the angle stays visually correct.
6. If any roof pieces still need runtime adjustment, limit code to position/rotation sync only; do not use parent-scale compensation as the primary fix.

**Relevant files**
- /home/bogdan/VScode_projects/CarStar/CarStar/industrial-configurator/public/models/jgheaburi-2.gltf — source of the broken parent-child hierarchy.
- /home/bogdan/VScode_projects/CarStar/CarStar/industrial-configurator/src/components/3d/Configurator.tsx — reference for current runtime behavior and the roof/gutter names that need to be preserved.

**Verification**
1. After re-export, move the width slider from min to max and back; the roof should not grow or shrink.
2. Check that `jgheab` and `burlan` keep their intended angle and do not tilt more as width increases.
3. Confirm the roof remains aligned at the eaves and does not drift when height changes.
4. If needed, compare world transforms in Blender before export and after import to verify the hierarchy is clean.

**Decisions**
- Primary fix: Blender hierarchy cleanup.
- Secondary fix: keep runtime code only for simple position/visibility synchronization if something still needs to be driven procedurally.
- Excluded scope: deeper UI changes and unrelated material or clipping behavior.

**Further Considerations**
1. If the roof must remain linked to width in some controlled way, use a separate neutral control empty for angle only, not the width-scaled beams.
2. If you want, the next step can be a concrete Blender checklist with exact reparent/apply-transform actions for each named object.
3. If the legacy JS scene is still used anywhere, it should be treated as read-only until the exported model is fixed, because the root cause is in the hierarchy.
