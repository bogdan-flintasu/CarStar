'use client';

/**
 * Quote pictures of the hall ("randări"): the fixed views of `RENDER_VIEWS`, rendered from the live scene into an
 * offscreen target with their own camera, so the user's view is never moved. Same pattern as snapshot.tsx:
 * `<HallRenderProvider />` sits in the canvas and registers a renderer, `renderHallViews()` is called from the UI.
 *
 * Only the render pass gets the "photo" treatment (src/components/3d/stage): helpers hidden (dimension lines, placement
 * markers, selection handles), selection/conflict glows off, cladding forced on, a summer-midday sky as background and
 * light, the sun placed per view with a large soft shadow map, a site with asphalt, parking and road, ambient
 * occlusion, MSAA, tone mapping, and a light colour grade. Every setting is put back right after each view, in the same
 * task, even when rendering fails, so the live view never sees any of it. Quality is the same on every device (a phone
 * just takes longer); one view is drawn per animation frame.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import {
  Box3,
  Color,
  HalfFloatType,
  type Material,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  type Scene,
  UnsignedByteType,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RENDER_VIEWS, renderViewCameras, sunForView, type RenderView } from '@/lib/hall/renderViews';
import { planSite } from '@/lib/hall/sitePlan';
import { planProps } from '@/lib/hall/propPlan';
import type { HallLayout } from '@/lib/hall';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { loadRenderSky } from '@/components/3d/stage/sky';
import { buildSite, disposeSite } from '@/components/3d/stage/site';
import { buildProps, disposeProps, loadPropAssets } from '@/components/3d/stage/props';
import { applyStaging } from '@/components/3d/stage/staging';
import { GradePass } from '@/components/3d/stage/gradePass';
import { quoteRenderState, type LayerNode } from './layers';

/** Set on any object that exists only to help the user edit (handles, markers, dimension lines): never rendered. */
export const RENDER_HIDDEN = 'renderHidden';
export const renderHiddenProps = { userData: { [RENDER_HIDDEN]: true } } as const;
/** Set on a group whose materials glow only as editing feedback (selected, conflicting): renders switch the glow off. */
export const RENDER_PLAIN = 'renderPlain';
export const renderPlainProps = { userData: { [RENDER_PLAIN]: true } } as const;
/** Set on a door leaf's hinge group (it turns while the user walks through the hall): renders draw every door shut. */
export const DOOR_HINGE = 'doorHinge';
export const doorHingeProps = { userData: { [DOOR_HINGE]: true } } as const;

export interface HallRender {
  view: RenderView;
  blob: Blob;
  width: number;
  height: number;
}

/** Output size and quality: the same on every device, so every customer gets the same pictures. */
export const RENDER_QUALITY = {
  width: 1600,
  height: 1000,
  /** Capped by the GPU's largest texture. */
  shadowMapSize: 4096,
  /** PCF filter radius in shadow-map texels. */
  shadowRadius: 2.5,
  samples: 4,
} as const;

/** Ambient occlusion: contact shadows where walls meet the ground, under cars, in corners (metres). */
const AO = { radius: 1.6, distanceExponent: 1.2, thickness: 1.5, scale: 1, samples: 16, blend: 0.85 } as const;

/** JPEG qualities tried in turn until a picture is under `TARGET_RENDER_BYTES`. */
const JPEG_QUALITIES = [0.85, 0.78, 0.7, 0.6];
export const TARGET_RENDER_BYTES = 350 * 1024;
const BACKGROUND = new Color('#dddddd');

type RenderAll = (options: { signal?: AbortSignal; onProgress?: (done: number) => void }) => Promise<HallRender[]>;
let renderAll: RenderAll | null = null;
const waiting = new Set<() => void>();

/**
 * Renders every view of the hall now on screen. Resolves with one JPEG per view, in `RENDER_VIEWS` order.
 * Waits (up to `timeoutMs`) for the 3D view to mount if it has not yet.
 */
export async function renderHallViews(
  options: { signal?: AbortSignal; onProgress?: (done: number) => void; timeoutMs?: number } = {},
): Promise<HallRender[]> {
  if (!renderAll) {
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        waiting.delete(done);
        resolve();
      };
      const timer = setTimeout(() => {
        waiting.delete(done);
        reject(new Error('3D view not available'));
      }, options.timeoutMs ?? 15000);
      waiting.add(done);
    });
  }
  return renderAll!(options);
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Rendering cancelled', 'AbortError');
}

type Glowing = Material & { emissiveIntensity: number };
const glows = (material: Material): material is Glowing =>
  'emissiveIntensity' in material && typeof material.emissiveIntensity === 'number';

/**
 * Hides the editing helpers, switches off editing glows, shows the cladding and shuts every door (one may still be
 * open, or closing, after a walk-through); returns the function that puts everything back. Used by the quote renders
 * and the AR export (src/components/3d/ar/arExport.tsx).
 */
export function prepareScene(scene: Scene): () => void {
  const changed: [Object3D, boolean][] = [];
  const dimmed = new Map<Glowing, number>();
  const hinges: [Object3D, number, number][] = [];
  scene.traverse((object) => {
    if (object.userData[DOOR_HINGE]) hinges.push([object, object.rotation.x, object.rotation.y]);
    if (object.userData[RENDER_HIDDEN] && object.visible) changed.push([object, true]);
    else if (object.name === 'Cladding' && !object.visible) changed.push([object, false]);
    if (object.userData[RENDER_PLAIN]) {
      object.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        for (const material of [child.material].flat() as Material[]) {
          if (glows(material) && !dimmed.has(material)) dimmed.set(material, material.emissiveIntensity);
        }
      });
    }
  });
  for (const [object, wasVisible] of changed) object.visible = !wasVisible;
  for (const material of dimmed.keys()) material.emissiveIntensity = 0;
  for (const [hinge] of hinges) hinge.rotation.set(0, 0, hinge.rotation.z);
  return () => {
    for (const [object, wasVisible] of changed) object.visible = wasVisible;
    for (const [material, intensity] of dimmed) material.emissiveIntensity = intensity;
    for (const [hinge, x, y] of hinges) hinge.rotation.set(x, y, hinge.rotation.z);
  };
}

/** Rows come out of WebGL bottom-up: flip them into a canvas. */
function pixelsToCanvas(pixels: Uint8Array, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  context.putImageData(image, 0, 0);
  return canvas;
}

async function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  let blob: Blob | null = null;
  for (const quality of JPEG_QUALITIES) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('JPEG encoding failed');
    if (blob.size <= TARGET_RENDER_BYTES) break;
  }
  return blob!;
}

export function HallRenderProvider({ layout }: { layout: HallLayout }) {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    let busy: Promise<unknown> = Promise.resolve();

    const run: RenderAll = async ({ signal, onProgress }) => {
      const quality = RENDER_QUALITY;
      const { width, height } = quality;
      const cameras = renderViewCameras(layout, width / height);
      const plan = planSite(layout, useOpeningsStore.getState().openings);
      const [sky, site, propAssets] = await Promise.all([loadRenderSky(gl), buildSite(plan, layout.groundY), loadPropAssets()]);
      abortIfNeeded(signal);
      // Cars, people, trees and neighbours ride along with the site's ground.
      const viewpoints = Object.values(cameras).map((c) => [c.position[0], c.position[2]] as [number, number]);
      const props = buildProps(planProps(plan, viewpoints), propAssets, layout.groundY);
      site.add(props);

      const canFloat = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');
      const floatType = canFloat ? HalfFloatType : UnsignedByteType;
      const target = new WebGLRenderTarget(width, height, {
        type: floatType,
        samples: Math.min(quality.samples, gl.capabilities.maxSamples),
      });
      const occluded = new WebGLRenderTarget(width, height, { type: floatType, depthBuffer: false });
      const output = new WebGLRenderTarget(width, height, { type: UnsignedByteType, depthBuffer: false });
      const graded = new WebGLRenderTarget(width, height, { type: UnsignedByteType, depthBuffer: false });
      const camera = new PerspectiveCamera(30, width / height, 0.1, 1000);
      const gtao = new GTAOPass(scene, camera, width, height);
      gtao.updateGtaoMaterial({ radius: AO.radius, distanceExponent: AO.distanceExponent, thickness: AO.thickness, scale: AO.scale, samples: AO.samples });
      gtao.blendIntensity = AO.blend;
      gtao.setSceneClipBox(new Box3(new Vector3(plan.yard.x0, layout.groundY - 1, plan.yard.z0), new Vector3(plan.yard.x1, layout.bounds.max[1] + 5, plan.yard.z1)));
      const outputPass = new OutputPass();
      const grade = new GradePass();
      const pixels = new Uint8Array(width * height * 4);
      const renders: HallRender[] = [];

      const stage = (view: RenderView) => {
        const restoreScene = prepareScene(scene);
        // Every layer shown and the section cut off (T3d), whatever the live view shows.
        const layerNodes: LayerNode[] = [];
        scene.traverse((object) => layerNodes.push(object));
        const restoreLayers = quoteRenderState(layerNodes, gl);
        const restoreStaging = applyStaging(scene, gl, {
          sky,
          sun: sunForView(cameras[view], layout),
          cameraDistance: Math.hypot(...cameras[view].position.map((p, i) => p - cameras[view].target[i])),
          site,
          shadowArea: plan.yard,
          shadowMapSize: quality.shadowMapSize,
          shadowRadius: quality.shadowRadius,
        });
        return () => {
          restoreStaging();
          restoreLayers();
          restoreScene();
        };
      };

      const aim = (view: RenderView) => {
        const c = cameras[view];
        camera.fov = c.fov;
        camera.near = c.near;
        camera.far = c.far;
        camera.position.set(...c.position);
        camera.lookAt(...c.target);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
      };

      const drawView = (view: RenderView) => {
        aim(view);
        const previousTarget = gl.getRenderTarget();
        const previousClear = gl.getClearColor(new Color());
        const previousAlpha = gl.getClearAlpha();
        const restore = stage(view);
        try {
          gl.setRenderTarget(target);
          gl.setClearColor(BACKGROUND, 1);
          gl.clear();
          gl.render(scene, camera);
          gtao.render(gl, occluded, target, 0, false);
          outputPass.render(gl, output, occluded, 0, false);
          grade.render(gl, graded, output);
        } finally {
          restore();
          gl.setRenderTarget(previousTarget);
          gl.setClearColor(previousClear, previousAlpha);
        }
      };

      /** Reads the finished picture back; done a frame after drawing it, so the GPU has finished and the read is quick. */
      const readView = () => {
        gl.readRenderTargetPixels(graded, 0, 0, width, height, pixels);
        return pixelsToCanvas(pixels, width, height);
      };

      try {
        // Shader variants for the staged scene (fog, sky light, offscreen target) differ from the live ones:
        // compile them without blocking first.
        await nextFrame();
        abortIfNeeded(signal);
        const previousTarget = gl.getRenderTarget();
        let compiling: Promise<unknown>;
        aim('front');
        const restore = stage('front');
        try {
          gl.setRenderTarget(target);
          compiling = gl.compileAsync(scene, camera);
        } finally {
          gl.setRenderTarget(previousTarget);
          restore();
        }
        await compiling.catch(() => undefined);

        for (const view of RENDER_VIEWS) {
          await nextFrame();
          abortIfNeeded(signal);
          drawView(view);
          await nextFrame();
          const canvas = readView();
          renders.push({ view, blob: await encodeJpeg(canvas), width, height });
          onProgress?.(renders.length);
        }
        return renders;
      } finally {
        for (const t of [target, occluded, output, graded]) t.dispose();
        gtao.dispose();
        outputPass.dispose();
        grade.dispose();
        site.remove(props);
        disposeProps(props);
        disposeSite(site);
        // The live shadow map was reallocated: draw the live view again.
        invalidate();
      }
    };

    // One batch at a time: a second request waits for the first to finish.
    renderAll = (options) => {
      const next = busy.then(() => run(options));
      busy = next.catch(() => undefined);
      return next;
    };
    for (const resolve of [...waiting]) resolve();
    return () => {
      renderAll = null;
    };
  }, [gl, scene, invalidate, layout]);

  return null;
}
