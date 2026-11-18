'use client';

/**
 * Last touch of a quote picture, on the final sRGB image: a little contrast and saturation (the "summer photo" look)
 * and a soft vignette.
 */
import { ShaderMaterial, type Texture, type WebGLRenderTarget, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export const GRADE = { contrast: 1.06, saturation: 1.05, vignette: 0.28 } as const;

export class GradePass {
  private readonly material = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null as Texture | null },
      contrast: { value: GRADE.contrast },
      saturation: { value: GRADE.saturation },
      vignette: { value: GRADE.vignette },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float contrast;
      uniform float saturation;
      uniform float vignette;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        c = (c - 0.5) * contrast + 0.5;
        float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(luma), c, saturation);
        vec2 d = vUv - 0.5;
        c *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.0, 0.8)) * 1.4);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  private readonly quad = new FullScreenQuad(this.material);

  render(gl: WebGLRenderer, target: WebGLRenderTarget, source: WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = source.texture;
    gl.setRenderTarget(target);
    this.quad.render(gl);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
