'use client';

/**
 * Click (tap) a hall component to select it (T5b). Renders nothing: it listens to the canvas element itself, raycasts
 * the scene with its own Raycaster and resolves the nearest hit with `pickFromHits` (ComponentPicker.map.ts, which
 * documents the instance-order contract and what is pickable). It needs nothing from Hall, Steel or KitInstances.
 *
 * Rules:
 *   - a click is one pointer, down and up within CLICK_SLOP_PX: an orbit drag or a pinch is never a click;
 *   - ignored while an opening tool is active, while an opening is being dragged or resized, and when the nearest
 *     hit is an opening (WallOpening selects it, which clears the component through the selection store);
 *   - invisible objects (the cladding hidden in step 1) and editing helpers are never picked;
 *   - a click on empty space (ground, sky, a bolt, a flashing) clears; so does Esc, unless the user is typing;
 *   - a change of the hall re-reads the selection (`resolveKey`): fresh sizes, or cleared when the element is gone.
 * Mount it inside the editing-helpers group (renderHiddenProps): it is never part of a quote render.
 */
import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, Vector2, type Intersection, type Object3D } from 'three';
import type { HallLayout } from '@/lib/hall';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { useComponentSelection } from '@/stores/useComponentSelection';
import { RENDER_HIDDEN, RENDER_PLAIN } from './renders';
import { isCladdingKind, isClickGesture, pickFromHits, resolveKey, type SceneHit } from './ComponentPicker.map';

interface ComponentPickerProps {
  layout: HallLayout;
  /** Walls, roof and rainwater shown: when hidden, a selected wall/roof/gutter/downpipe is cleared. */
  claddingVisible: boolean;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const el = target;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Drawn: the object and all its ancestors are visible (three's Raycaster does not check this). */
function isShown(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function hasFlag(object: Object3D, flag: string): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (o.userData[flag]) return true;
  return false;
}

/**
 * Openings are the groups WallOpening marks `renderPlain` (their glows switch off in renders); their pick targets and
 * handles inside are `renderHidden`, so the opening flag is checked first.
 */
function toSceneHit({ object, instanceId, point }: Intersection): SceneHit {
  return {
    objectName: object.name,
    instanceId,
    point: [point.x, point.y, point.z],
    opening: hasFlag(object, RENDER_PLAIN),
    helper: hasFlag(object, RENDER_HIDDEN),
  };
}

export default function ComponentPicker({ layout, claddingVisible }: ComponentPickerProps) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const raycaster = useMemo(() => new Raycaster(), []);

  // Clicks on the canvas.
  useEffect(() => {
    const element = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let multiTouch = false;
    let draggedOpening = false;

    // An opening drag can start and end inside one press (WallOpening's handlers): remember it for this gesture.
    const unsubscribe = useOpeningsStore.subscribe((s) => {
      if (s.isDragging && pointers.size > 0) draggedOpening = true;
    });

    const onDown = (e: PointerEvent) => {
      if (pointers.size === 0) {
        multiTouch = false;
        draggedOpening = false;
      } else {
        multiTouch = true;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      multiTouch = true; // the rest of this gesture is not a click
    };
    const onUp = (e: PointerEvent) => {
      const down = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (!down || e.button !== 0) return;
      const { activeTool, isDragging } = useOpeningsStore.getState();
      if (activeTool !== null || isDragging || draggedOpening) return;
      if (!isClickGesture(down, { x: e.clientX, y: e.clientY }, e.pointerType, { multiTouch })) return;

      const rect = element.getBoundingClientRect();
      const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster
        .intersectObjects(scene.children, true)
        .filter((hit) => isShown(hit.object))
        .map(toSceneHit);
      const outcome = pickFromHits(hits, layout);
      const selection = useComponentSelection.getState();
      if (outcome.kind === 'component') selection.select(outcome.picked);
      else if (outcome.kind === 'empty') selection.clear();
      // 'opening': WallOpening's own click handler selects it.
    };

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onCancel);
    return () => {
      unsubscribe();
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onCancel);
    };
  }, [gl, camera, scene, raycaster, layout]);

  // Esc clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isTyping(e.target)) return;
      if (useComponentSelection.getState().selected) useComponentSelection.getState().clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The hall changed: keep the selection on the same element with its new sizes, or drop it.
  useEffect(() => {
    const { selected, select, clear } = useComponentSelection.getState();
    if (!selected) return;
    const fresh = resolveKey(selected.key, layout);
    if (!fresh || (!claddingVisible && isCladdingKind(fresh.kind))) clear();
    else select(fresh);
  }, [layout, claddingVisible]);

  // Nothing is drawn here.
  // UI: the highlight goes here (or next to this component): read `useComponentSelection((s) => s.selected)` and draw
  //     `highlightTarget(selected, layout)` (instances: overlay copies of the kit geometry at `matrix`; face: a flat
  //     polygon a few mm out along `normal`), inside renderHiddenProps so quote renders never show it.
  // UI: the info card lives outside the Canvas: `selected.label`, `selected.details`, and
  //     `componentColor(selected, colors, palette)` (useConfiguratorStore) for the colour name + RAL; a close button
  //     calls `clear()`.
  return null;
}
