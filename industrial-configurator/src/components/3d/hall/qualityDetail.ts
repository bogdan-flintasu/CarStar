'use client';

/**
 * Applies the level of detail of qualityLod.ts to the scene, once per render and for the camera being rendered with.
 *
 * Small pieces (bolt chunks) register here. The scene's `onBeforeRender` runs at the start of every
 * `renderer.render(scene, camera)`, before three.js culls and draws, so visibility is decided for the very camera of
 * that render:
 * - into the canvas (no render target): each chunk is shown if its pieces would be big enough on screen;
 * - into a render target (quote renders, snapshots, AO passes): every chunk is shown, and the time is noted so the
 *   quality governor holds still while such renders run (`offscreenBusy`).
 */
import { OrthographicCamera, PerspectiveCamera, Sphere, Vector3, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { QUALITY_TUNING } from './quality';
import { MIN_DETAIL_PX, detailVisible, type DetailView } from './qualityLod';
import { farDetailNow } from './qualityStore';

interface DetailEntry {
  object: Object3D & { boundingSphere?: Sphere | null };
  sizeM: number;
}

const registries = new WeakMap<Scene, Set<DetailEntry>>();

/** Counters for scripted checks (dev hook `__hallQuality.detail()`): chunks drawn by the last live / offscreen render. */
export const detailStats = { live: { shown: 0, total: 0 }, offscreen: { shown: 0, total: 0, renders: 0 } };
let lastOffscreenAt = -Infinity;

/** An offscreen render ran within the last `offscreenHoldMs`. */
export function offscreenBusy(now = performance.now()): boolean {
  return now - lastOffscreenAt < QUALITY_TUNING.offscreenHoldMs;
}

const sphere = new Sphere();
const cameraPosition = new Vector3();

function viewOf(camera: Camera, renderer: WebGLRenderer): DetailView | null {
  const viewportHeightPx = renderer.domElement.clientHeight || renderer.domElement.height;
  if (camera instanceof PerspectiveCamera) return { kind: 'perspective', fovDeg: camera.fov, zoom: camera.zoom, viewportHeightPx };
  if (camera instanceof OrthographicCamera) {
    return { kind: 'orthographic', frustumHeight: camera.top - camera.bottom, zoom: camera.zoom, viewportHeightPx };
  }
  return null;
}

function applyDetail(entries: Set<DetailEntry>, renderer: WebGLRenderer, camera: Camera, offscreen: boolean) {
  const view = offscreen ? null : viewOf(camera, renderer);
  const minPx = farDetailNow() ? MIN_DETAIL_PX.full : MIN_DETAIL_PX.reduced;
  camera.getWorldPosition(cameraPosition);
  let shown = 0;
  for (const { object, sizeM } of entries) {
    if (!view || !object.boundingSphere) {
      object.visible = true;
    } else {
      sphere.copy(object.boundingSphere).applyMatrix4(object.matrixWorld);
      const distance = Math.max(0, cameraPosition.distanceTo(sphere.center) - sphere.radius);
      object.visible = detailVisible(sizeM, distance, view, minPx);
    }
    if (object.visible) shown++;
  }
  const stats = offscreen ? detailStats.offscreen : detailStats.live;
  stats.shown = shown;
  stats.total = entries.size;
  if (offscreen) detailStats.offscreen.renders++;
}

function installedRegistry(scene: Scene): Set<DetailEntry> {
  let entries = registries.get(scene);
  if (entries) return entries;
  const registry = new Set<DetailEntry>();
  entries = registry;
  registries.set(scene, registry);
  const previous = scene.onBeforeRender;
  scene.onBeforeRender = function onBeforeRender(this: Scene, renderer, renderedScene, camera, renderTarget, ...rest) {
    previous.call(this, renderer, renderedScene, camera, renderTarget, ...rest);
    const offscreen = renderTarget != null;
    if (offscreen) lastOffscreenAt = performance.now();
    if (registry.size > 0) applyDetail(registry, renderer, camera, offscreen);
  } as Scene['onBeforeRender'];
  return registry;
}

/** Starts watching the scene's renders (offscreen detection) even before any detail is registered. */
export function watchSceneRenders(scene: Scene): void {
  installedRegistry(scene);
}

/** Draws `object` only when pieces `sizeM` across, at its nearest point, are big enough on screen. */
export function registerDetail(scene: Scene, object: DetailEntry['object'], sizeM: number): () => void {
  const entries = installedRegistry(scene);
  const entry = { object, sizeM };
  entries.add(entry);
  return () => {
    entries.delete(entry);
    object.visible = true;
  };
}
