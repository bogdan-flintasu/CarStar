'use client';

/**
 * AR export of the hall in the browser (docs/plans/ar.md, stage 1). `<ArExportProvider />` sits in the canvas and
 * registers an exporter; `exportHallAr()` is called from the UI and returns a GLB (Android Scene Viewer, model-viewer)
 * and a USDZ (iOS AR Quick Look) of the hall now on screen.
 *
 * The scene is put in its quote state (helpers hidden, glows off, cladding and every layer shown) only for the
 * synchronous copy made by `buildArScene`, then put back in the same task, so the live view never sees it. The
 * exporters are loaded on first use, so the configurator's bundle does not grow.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { CanvasTexture, Mesh, MeshStandardMaterial, type Object3D, type Scene, type Texture } from 'three';
import type { HallLayout } from '@/lib/hall';
import { prepareScene } from '@/components/3d/hall/renders';
import { quoteRenderState, type LayerNode } from '@/components/3d/hall/layers';
import { addBackFaces, arOrigin, buildArScene, disposeArScene, type ArSceneStats } from './arScene';

/** Largest texture side in the AR files (plan: 1024 px). */
export const AR_MAX_TEXTURE = 1024;

export interface HallArExport {
  glb: Blob;
  usdz: Blob;
  stats: ArSceneStats;
}

type Exporter = () => Promise<HallArExport>;
let exporter: Exporter | null = null;
const waiting = new Set<() => void>();

/** Exports the hall now on screen. Waits (up to `timeoutMs`) for the 3D view to mount if it has not yet. */
export async function exportHallAr({ timeoutMs = 15000 }: { timeoutMs?: number } = {}): Promise<HallArExport> {
  if (!exporter) {
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        waiting.delete(done);
        resolve();
      };
      const timer = setTimeout(() => {
        waiting.delete(done);
        reject(new Error('3D view not available'));
      }, timeoutMs);
      waiting.add(done);
    });
  }
  return exporter!();
}

/**
 * A canvas copy of `texture`, at most `max` px a side, with the same sampling settings. Both exporters read canvases;
 * the USDZ exporter cannot read DataTextures (the generated cladding profiles), and both write smaller files this way.
 */
function canvasCopy(texture: Texture, max: number): Texture | null {
  const image = texture.image as { width: number; height: number; data?: ArrayLike<number> } | null;
  if (!image || !image.width || !image.height) return null;
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  let source: CanvasImageSource;
  if (image.data) {
    // DataTexture: its rows as stored (row 0 = v 0, flipY false), kept in that order.
    const raw = document.createElement('canvas');
    raw.width = image.width;
    raw.height = image.height;
    const pixels = new Uint8ClampedArray(image.width * image.height * 4);
    pixels.set(image.data as ArrayLike<number>);
    raw.getContext('2d')!.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
    source = raw;
  } else {
    source = image as unknown as CanvasImageSource;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(source, 0, 0, width, height);
  const copy = new CanvasTexture(canvas);
  copy.flipY = texture.flipY;
  copy.wrapS = texture.wrapS;
  copy.wrapT = texture.wrapT;
  copy.repeat.copy(texture.repeat);
  copy.offset.copy(texture.offset);
  copy.rotation = texture.rotation;
  copy.center.copy(texture.center);
  copy.colorSpace = texture.colorSpace;
  copy.channel = texture.channel;
  copy.needsUpdate = true;
  return copy;
}

/** Replaces every map of the AR model with a resized canvas copy (one per source texture); returns the copies. */
function resizeTextures(scene: Scene, max: number): Texture[] {
  const copies = new Map<string, Texture | null>();
  const copyOf = (texture: Texture) => {
    const key = `${texture.uuid}`;
    if (!copies.has(key)) copies.set(key, canvasCopy(texture, max));
    return copies.get(key)!;
  };
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const material = object.material as MeshStandardMaterial;
    if (material.map) material.map = copyOf(material.map);
    if (material.normalMap) material.normalMap = copyOf(material.normalMap);
    material.needsUpdate = true;
  });
  return [...copies.values()].filter((t): t is Texture => t !== null);
}

/** The roots of the AR model in the live scene: the hall and the openings ("Goluri" layer). */
function arRoots(scene: Scene): Object3D[] {
  return [scene.getObjectByName('Hall'), scene.getObjectByName('Layer:openings')].filter((o): o is Object3D => !!o);
}

export function ArExportProvider({ layout }: { layout: HallLayout }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    let busy: Promise<unknown> = Promise.resolve();

    const run: Exporter = async () => {
      const [{ GLTFExporter }, { USDZExporter }] = await Promise.all([
        import('three/examples/jsm/exporters/GLTFExporter.js'),
        import('three/examples/jsm/exporters/USDZExporter.js'),
      ]);

      // The copy is made in one synchronous step with the scene in its quote state, then the live state is back.
      const restoreScene = prepareScene(scene);
      const nodes: LayerNode[] = [];
      scene.traverse((object) => nodes.push(object));
      const restoreLayers = quoteRenderState(nodes, gl);
      let built: ReturnType<typeof buildArScene>;
      try {
        const roots = arRoots(scene);
        if (roots.length === 0) throw new Error('No hall in the scene');
        built = buildArScene(roots, { origin: arOrigin(layout.bounds, layout.groundY) });
      } finally {
        restoreLayers();
        restoreScene();
      }

      const { scene: model, stats } = built;
      const textures = resizeTextures(model, AR_MAX_TEXTURE);
      try {
        const glb = (await new GLTFExporter().parseAsync(model, {
          binary: true,
          onlyVisible: true,
          maxTextureSize: AR_MAX_TEXTURE,
        })) as ArrayBuffer;
        // Quick Look draws front faces only: double-sided sheet metal and glass get real back faces.
        addBackFaces(model);
        const usdz = await new USDZExporter().parseAsync(model, {
          quickLookCompatible: true,
          maxTextureSize: AR_MAX_TEXTURE,
          ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
        });
        return {
          glb: new Blob([glb], { type: 'model/gltf-binary' }),
          usdz: new Blob([usdz as BlobPart], { type: 'model/vnd.usdz+zip' }),
          stats,
        };
      } finally {
        textures.forEach((t) => t.dispose());
        disposeArScene(model);
      }
    };

    // One export at a time.
    exporter = () => {
      const next = busy.then(run);
      busy = next.catch(() => undefined);
      return next;
    };
    for (const resolve of [...waiting]) resolve();
    return () => {
      exporter = null;
    };
  }, [gl, scene, layout]);

  return null;
}

