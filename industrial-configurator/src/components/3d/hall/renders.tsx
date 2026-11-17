'use client';

/**
 * Quote pictures of the hall ("randări"): the fixed views of `RENDER_VIEWS`, rendered from the live scene into an
 * offscreen target with their own camera, so the user's view is never moved. Same pattern as snapshot.tsx:
 * `<HallRenderProvider />` sits in the canvas and registers a renderer, `renderHallViews()` is called from the UI.
 *
 * Only the render pass gets the extra quality: helpers hidden (dimension lines, placement markers, selection handles),
 * selection/conflict glows off, cladding forced on, a bigger and softer shadow map, MSAA, tone mapping and sRGB applied by an output pass.
 * Every setting is put back right after each view, in the same task, even when rendering fails, so the live view
 * never sees any of it. One view is drawn per animation frame, which keeps each blocking step short on phones.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import {
  Color,
  DirectionalLight,
  HalfFloatType,
  type Material,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  type Scene,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { getGraphicsSettings, type QualityTier } from '@/lib/hardwareTier';
import { RENDER_VIEWS, renderViewCameras, type RenderView } from '@/lib/hall/renderViews';
import type { HallLayout } from '@/lib/hall';

/** Set on any object that exists only to help the user edit (handles, markers, dimension lines): never rendered. */
export const RENDER_HIDDEN = 'renderHidden';
export const renderHiddenProps = { userData: { [RENDER_HIDDEN]: true } } as const;
/** Set on a group whose materials glow only as editing feedback (selected, conflicting): renders switch the glow off. */
export const RENDER_PLAIN = 'renderPlain';
export const renderPlainProps = { userData: { [RENDER_PLAIN]: true } } as const;

export interface HallRender {
  view: RenderView;
  blob: Blob;
  width: number;
  height: number;
}

export interface RenderQuality {
  width: number;
  height: number;
  shadowMapSize: number;
  /** PCF filter radius in shadow-map texels. */
  shadowRadius: number;
  samples: number;
}

/** Output size and quality per hardware tier: 16:10, 1600 × 1000 unless the device is weak. */
export function renderQualityFor(tier: QualityTier): RenderQuality {
  if (tier === 'low') return { width: 1120, height: 700, shadowMapSize: 2048, shadowRadius: 2, samples: 2 };
  if (tier === 'medium') return { width: 1600, height: 1000, shadowMapSize: 2048, shadowRadius: 2.5, samples: 4 };
  return { width: 1600, height: 1000, shadowMapSize: 4096, shadowRadius: 3.5, samples: 4 };
}

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
 * Hides the editing helpers, switches off editing glows and shows the cladding; returns the function that puts
 * everything back.
 */
function prepareScene(scene: Scene): () => void {
  const changed: [Object3D, boolean][] = [];
  const dimmed = new Map<Glowing, number>();
  scene.traverse((object) => {
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
  return () => {
    for (const [object, wasVisible] of changed) object.visible = wasVisible;
    for (const [material, intensity] of dimmed) material.emissiveIntensity = intensity;
  };
}

/** Bigger, softer shadow maps for the render pass; returns the function that restores the live ones. */
function sharpenShadows(scene: Scene, gl: WebGLRenderer, quality: RenderQuality): () => void {
  const size = Math.min(quality.shadowMapSize, gl.capabilities.maxTextureSize);
  const saved: { light: DirectionalLight; size: Vector2; radius: number }[] = [];
  scene.traverse((object) => {
    if (object instanceof DirectionalLight && object.castShadow) {
      saved.push({ light: object, size: object.shadow.mapSize.clone(), radius: object.shadow.radius });
    }
  });
  const reallocate = (light: DirectionalLight) => {
    // The map is created again, at the new size, by the next render.
    light.shadow.map?.dispose();
    light.shadow.map = null;
  };
  for (const { light } of saved) {
    light.shadow.mapSize.set(size, size);
    light.shadow.radius = quality.shadowRadius;
    reallocate(light);
  }
  gl.shadowMap.needsUpdate = true;
  return () => {
    for (const { light, size: liveSize, radius } of saved) {
      light.shadow.mapSize.copy(liveSize);
      light.shadow.radius = radius;
      reallocate(light);
    }
    gl.shadowMap.needsUpdate = true;
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
      const quality = renderQualityFor(getGraphicsSettings().tier);
      const { width, height } = quality;
      const cameras = renderViewCameras(layout, width / height);
      const canFloat = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');
      const target = new WebGLRenderTarget(width, height, {
        type: canFloat ? HalfFloatType : UnsignedByteType,
        samples: Math.min(quality.samples, gl.capabilities.maxSamples),
      });
      const output = new WebGLRenderTarget(width, height, { type: UnsignedByteType, depthBuffer: false });
      const outputPass = new OutputPass();
      const pixels = new Uint8Array(width * height * 4);
      const camera = new PerspectiveCamera(30, width / height, 0.1, 1000);
      const renders: HallRender[] = [];

      const drawView = (view: RenderView) => {
        const c = cameras[view];
        camera.fov = c.fov;
        camera.near = c.near;
        camera.far = c.far;
        camera.position.set(...c.position);
        camera.lookAt(...c.target);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();

        const previousTarget = gl.getRenderTarget();
        const previousClear = gl.getClearColor(new Color());
        const previousAlpha = gl.getClearAlpha();
        const restoreScene = prepareScene(scene);
        const restoreShadows = sharpenShadows(scene, gl, quality);
        try {
          gl.setRenderTarget(target);
          gl.setClearColor(BACKGROUND, 1);
          gl.clear();
          gl.render(scene, camera);
          outputPass.render(gl, output, target, 0, false);
          gl.readRenderTargetPixels(output, 0, 0, width, height, pixels);
        } finally {
          restoreShadows();
          restoreScene();
          gl.setRenderTarget(previousTarget);
          gl.setClearColor(previousClear, previousAlpha);
        }
        return pixelsToCanvas(pixels, width, height);
      };

      try {
        // Shader variants for an offscreen target differ from the live ones: compile them without blocking first.
        await nextFrame();
        abortIfNeeded(signal);
        const previousTarget = gl.getRenderTarget();
        const restoreScene = prepareScene(scene);
        let compiling: Promise<unknown>;
        try {
          gl.setRenderTarget(target);
          camera.position.set(...cameras.front.position);
          camera.lookAt(...cameras.front.target);
          camera.updateMatrixWorld();
          compiling = gl.compileAsync(scene, camera);
        } finally {
          gl.setRenderTarget(previousTarget);
          restoreScene();
        }
        await compiling.catch(() => undefined);

        for (const view of RENDER_VIEWS) {
          await nextFrame();
          abortIfNeeded(signal);
          const canvas = drawView(view);
          renders.push({ view, blob: await encodeJpeg(canvas), width, height });
          onProgress?.(renders.length);
        }
        return renders;
      } finally {
        target.dispose();
        // The live shadow map was reallocated: draw the live view again.
        invalidate();
        output.dispose();
        outputPass.dispose();
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
