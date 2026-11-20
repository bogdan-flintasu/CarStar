'use client';

/**
 * The section cut in the live view (T3d), as chosen in the view toolbar ("Secțiune"):
 *   - one shared clipping plane on the materials of the groups marked `sectionClipProps` (the hall and the openings),
 *     per material, so the terrain, the sky and the editing helpers are never cut. Materials are synced in a frame
 *     callback (no allocation; it only writes when a material is new or the cut was switched on or off), so pieces
 *     that get new materials (a colour change, a selected opening) are cut too. Dragging moves the plane only: no
 *     shader recompiles while dragging;
 *   - a handle in the accent colour: an outline of the cut and a bar above the roof to drag (pointer capture, the
 *     orbit controls disabled while dragging); the toolbar has a slider for touch;
 *   - optional caps ("Capace"): the cut faces of the wall panels (minus their openings), the roof panel and the slab,
 *     filled flat from the layout (section.ts `sectionCaps`); steel members are not capped.
 * Mount it inside the editing-helpers group (renderHiddenProps): quote renders never show the handle or the caps, and
 * renders.tsx switches the clipping off for its pass.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  type Material,
  type Mesh,
  type Object3D,
  Plane,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three';
import type { HallLayout, Vec3 } from '@/lib/hall';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useViewStore } from '@/stores/useViewStore';
import type { LayerVisibility } from './layers';
import {
  closestOnAxis,
  sectionCaps,
  sectionExtents,
  sectionFraction,
  sectionPlane,
  type SectionHole,
  type SectionPlane,
} from './section';
import { SECTION_CLIP, setLivePickPlane } from './sectionPick';

interface SectionCutProps {
  layout: HallLayout;
  holes: readonly SectionHole[];
  claddingVisible: boolean;
  layers: LayerVisibility;
  color: string;
}

/** Caps sit this far in front of the cut (towards the removed side), over the hollow insides of the cut panels. */
const CAP_OFFSET = 0.003;
const noRaycast = () => {};

/**
 * Keeps the live materials of the clipped groups on the cut (null = no cut). One three.js Plane in one list, shared by
 * every material: moving the cut only rewrites that plane.
 */
function useClippedMaterials(plane: SectionPlane | null) {
  const scene = useThree((s) => s.scene);
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const list = useRef<Plane[]>([new Plane()]);
  const current = useRef<Plane[] | null>(null);
  const touched = useRef(new Set<Material>());

  // Stable callbacks: the frame callback allocates nothing.
  const visit = useMemo(() => {
    const apply = (material: Material) => {
      const wanted = current.current;
      if (material.clippingPlanes === wanted) return;
      material.clippingPlanes = wanted;
      material.clipShadows = wanted !== null;
      touched.current.add(material);
    };
    return (object: Object3D) => {
      const material = (object as Mesh).material as Material | Material[] | undefined;
      if (!material) return;
      if (Array.isArray(material)) for (let i = 0; i < material.length; i++) apply(material[i]);
      else apply(material);
    };
  }, []);

  useLayoutEffect(() => {
    const planes = list.current;
    if (plane) {
      planes[0].normal.set(...plane.normal);
      planes[0].constant = plane.constant;
    }
    current.current = plane ? planes : null;
    invalidate();
  }, [plane, invalidate]);

  useFrame(() => {
    const children = scene.children;
    for (let i = 0; i < children.length; i++) if (children[i].userData[SECTION_CLIP]) children[i].traverse(visit);
  });

  useEffect(() => {
    const gl = get().gl;
    const previous = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    const materials = touched.current;
    return () => {
      gl.localClippingEnabled = previous;
      for (const material of materials) {
        material.clippingPlanes = null;
        material.clipShadows = false;
      }
      materials.clear();
    };
  }, [get]);
}

function outlineGeometry(u0: number, u1: number, y0: number, y1: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([u0, y0, 0, u1, y0, 0, u1, y1, 0, u0, y1, 0], 3));
  return geometry;
}

function capsGeometry(layout: HallLayout, plane: SectionPlane, options: Parameters<typeof sectionCaps>[2]): BufferGeometry | null {
  const polygons = sectionCaps(layout, plane, options);
  if (polygons.length === 0) return null;
  return new ShapeGeometry(polygons.map((polygon) => new Shape(polygon.map(([u, y]) => new Vector2(u, y)))));
}

export default function SectionCut({ layout, holes, claddingVisible, layers, color }: SectionCutProps) {
  const mode = useViewStore((s) => s.sectionMode);
  const fraction = useViewStore((s) => s.sectionFraction);
  const capsOn = useViewStore((s) => s.sectionCaps);
  const get = useThree((s) => s.get);
  const controlsOf = () => get().controls as unknown as { enabled: boolean } | null;

  const extents = useMemo(() => sectionExtents(layout), [layout]);
  useEffect(() => useViewStore.getState().setSectionExtents(extents), [extents]);
  // Leaving the configurator resets the cut and the layers; so does "Resetează" (or loading a configuration), seen as
  // the hall being replaced wholesale (several dimensions in one store update, as the engine's framing rule).
  useEffect(() => {
    const unsubscribe = useConfiguratorStore.subscribe((now, before) => {
      const changed = [now.width !== before.width, now.height !== before.height, now.length !== before.length];
      if (changed.filter(Boolean).length > 1) {
        const view = useViewStore.getState();
        view.resetSection();
        view.showAllLayers();
      }
    });
    return () => {
      unsubscribe();
      const view = useViewStore.getState();
      view.resetSection();
      view.showAllLayers();
      view.setSectionExtents(null);
    };
  }, []);

  const plane = useMemo(() => sectionPlane(mode, fraction, extents), [mode, fraction, extents]);
  useLayoutEffect(() => setLivePickPlane(plane), [plane]);
  useEffect(() => () => setLivePickPlane(null), []);
  useClippedMaterials(plane);

  // The handle's frame: local x runs along the cut face (world X across, world Z along), local +z towards the removed side.
  const axis = plane?.axis ?? 'z';
  const [u0, u1] = axis === 'z' ? extents.x : extents.z;
  const y0 = layout.groundY;
  const top = layout.bounds.max[1];
  const span = Math.max(u1 - u0, top - y0);
  const margin = Math.max(0.3, span * 0.03);
  const barY = top + margin * 1.6;
  const barThickness = Math.max(0.08, span * 0.006);
  const hitHeight = Math.max(0.8, span * 0.06);

  const outline = useMemo(() => outlineGeometry(u0 - margin, u1 + margin, y0, top + margin), [u0, u1, y0, top, margin]);
  useEffect(() => () => outline.dispose(), [outline]);

  const caps = useMemo(
    () => (plane && capsOn ? capsGeometry(layout, plane, { holes, layers, claddingVisible }) : null),
    [plane, capsOn, layout, holes, layers, claddingVisible],
  );
  useEffect(() => () => caps?.dispose(), [caps]);

  // Dragging the bar.
  const drag = useRef<{ controlsWere: boolean } | null>(null);
  const setCursor = (cursor: string) => {
    get().gl.domElement.style.cursor = cursor;
  };
  type Capturing = { setPointerCapture(id: number): void; releasePointerCapture(id: number): void };
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as unknown as Capturing).setPointerCapture(e.pointerId);
    const controls = controlsOf();
    drag.current = { controlsWere: controls?.enabled ?? true };
    if (controls) controls.enabled = false;
    setCursor('grabbing');
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current || !plane) return;
    e.stopPropagation();
    const { origin, direction } = e.ray;
    const through: Vec3 = axis === 'z' ? [(u0 + u1) / 2, barY, 0] : [0, barY, (u0 + u1) / 2];
    const coordinate = closestOnAxis([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z], axis, through);
    if (coordinate !== null) useViewStore.getState().setSectionFraction(sectionFraction(axis, coordinate, extents));
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    e.stopPropagation();
    (e.target as unknown as Capturing).releasePointerCapture(e.pointerId);
    const controls = controlsOf();
    if (controls) controls.enabled = drag.current.controlsWere;
    drag.current = null;
    setCursor('grab');
  };
  // Switched off or unmounted mid-drag: give the controls back.
  const cutOn = plane !== null;
  useEffect(
    () => () => {
      if (!cutOn) return;
      const controls = get().controls as unknown as { enabled: boolean } | null;
      if (drag.current && controls) controls.enabled = drag.current.controlsWere;
      drag.current = null;
      get().gl.domElement.style.cursor = '';
    },
    [cutOn, get],
  );

  if (!plane) return null;
  const position: [number, number, number] = axis === 'z' ? [0, 0, plane.coordinate] : [plane.coordinate, 0, 0];
  return (
    <group name="SectionCut" position={position} rotation-y={axis === 'z' ? 0 : -Math.PI / 2}>
      <lineLoop geometry={outline} raycast={noRaycast}>
        <lineBasicMaterial color={color} transparent opacity={0.9} depthTest={false} />
      </lineLoop>
      <mesh position={[(u0 + u1) / 2, barY, 0]} raycast={noRaycast} renderOrder={2}>
        <boxGeometry args={[u1 - u0 + 2 * margin, barThickness, barThickness]} />
        <meshBasicMaterial color={color} depthTest={false} transparent />
      </mesh>
      {/* The bar's grab area: larger than the bar, invisible. */}
      <mesh
        name="SectionHandle"
        position={[(u0 + u1) / 2, barY, 0]}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerOver={() => !drag.current && setCursor('grab')}
        onPointerOut={() => !drag.current && setCursor('')}
      >
        <boxGeometry args={[u1 - u0 + 2 * margin, hitHeight, hitHeight]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {caps && (
        <mesh name="SectionCaps" geometry={caps} position-z={CAP_OFFSET} raycast={noRaycast}>
          <meshBasicMaterial color={color} side={DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      )}
    </group>
  );
}
