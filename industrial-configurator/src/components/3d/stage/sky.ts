'use client';

/**
 * Sky of the quote renders: a summer-midday sky photo (Poly Haven, CC0; see public/render/CREDITS.md) as the
 * background, and its HDR version as image-based light. Loaded once, the first time pictures are rendered.
 */
import {
  EquirectangularReflectionMapping,
  HalfFloatType,
  PMREMGenerator,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

export const SKY_BACKGROUND_URL = '/render/sky/sky_4k.jpg';
export const SKY_LIGHT_URL = '/render/sky/sky_1k.hdr';
/** Haze at the horizon of that sky (sRGB): distant ground fades into it. */
export const SKY_HORIZON = '#b3bbca';

export interface RenderSky {
  background: Texture;
  environment: Texture;
}

let loading: Promise<RenderSky> | null = null;

export function loadRenderSky(gl: WebGLRenderer): Promise<RenderSky> {
  loading ??= (async () => {
    const [background, hdr] = await Promise.all([
      new TextureLoader().loadAsync(SKY_BACKGROUND_URL),
      // Half floats filter linearly on every WebGL2 device; full floats need an extension phones often lack.
      new HDRLoader().setDataType(HalfFloatType).loadAsync(SKY_LIGHT_URL),
    ]);
    background.mapping = EquirectangularReflectionMapping;
    background.colorSpace = SRGBColorSpace;
    // Converted to a cube map here, once, rather than by the first picture that shows sky.
    const cube = new WebGLCubeRenderTarget(background.image.height / 2).fromEquirectangularTexture(gl, background);
    background.dispose();
    const pmrem = new PMREMGenerator(gl);
    const environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();
    return { background: cube.texture, environment };
  })();
  // A failed download may succeed next time.
  loading.catch(() => (loading = null));
  return loading;
}
