'use client';

/**
 * Turns the live scene into the "photo" scene of one quote picture, and back: summer sky as background and light,
 * the sun placed for this view with a large soft shadow map covering the whole site, distant haze, the site's ground
 * instead of the live grass. `applyStaging` returns the function that restores every setting it changed; callers run
 * both in the same task, so the live view never sees the staging.
 */
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Euler,
  Fog,
  type FogExp2,
  type Group,
  HemisphereLight,
  type Object3D,
  type Scene,
  type Texture,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { SiteRect } from '@/lib/hall/sitePlan';
import type { ViewSun } from '@/lib/hall/renderViews';
import { SKY_HORIZON, type RenderSky } from './sky';

/** Midday sun, slightly warm, and how much the sky's own light adds. Tuned with ACES tone mapping. */
const SUN_COLOR = new Color('#fff6e8');
const SUN_INTENSITY = 3.2;
const SKY_LIGHT_INTENSITY = 0.85;
/** The live scene's flat ambient light is replaced by the sky light. */
const AMBIENT_SCALE = 0.15;
/** Haze starts this far beyond the hall and is complete this far beyond it (metres): only the distance fades. */
const HAZE = { near: 250, far: 1100 } as const;

export interface Staging {
  sky: RenderSky;
  sun: ViewSun;
  /** The site's ground (and later props), added only while the picture is drawn. */
  site: Group;
  /** Distance from the camera to the hall. */
  cameraDistance: number;
  /** Area that must get crisp shadows (the yard). */
  shadowArea: SiteRect;
  shadowMapSize: number;
  shadowRadius: number;
}

export function applyStaging(scene: Scene, gl: WebGLRenderer, staging: Staging): () => void {
  const undo: (() => void)[] = [];

  // Sky: background picture and image-based light, both turned so their sun matches this view's sun.
  const saved = {
    background: scene.background,
    backgroundRotation: scene.backgroundRotation.clone(),
    backgroundIntensity: scene.backgroundIntensity,
    environment: scene.environment as Texture | null,
    environmentRotation: scene.environmentRotation.clone(),
    environmentIntensity: scene.environmentIntensity,
    fog: scene.fog as Fog | FogExp2 | null,
  };
  undo.push(() => {
    scene.background = saved.background;
    scene.backgroundRotation.copy(saved.backgroundRotation);
    scene.backgroundIntensity = saved.backgroundIntensity;
    scene.environment = saved.environment;
    scene.environmentRotation.copy(saved.environmentRotation);
    scene.environmentIntensity = saved.environmentIntensity;
    scene.fog = saved.fog;
  });
  const rotation = new Euler(0, staging.sun.skyRotationY, 0);
  scene.background = staging.sky.background;
  scene.backgroundRotation.copy(rotation);
  scene.backgroundIntensity = 1;
  scene.environment = staging.sky.environment;
  scene.environmentRotation.copy(rotation);
  scene.environmentIntensity = SKY_LIGHT_INTENSITY;
  scene.fog = new Fog(SKY_HORIZON, staging.cameraDistance + HAZE.near, staging.cameraDistance + HAZE.far);

  // Lights: the first shadow-casting directional light is the sun; flat ambient light is turned down.
  const { shadowArea: a } = staging;
  const centre = new Vector3((a.x0 + a.x1) / 2, 0, (a.z0 + a.z1) / 2);
  const radius = Math.hypot(a.x1 - a.x0, a.z1 - a.z0) / 2 + 4;
  const size = Math.min(staging.shadowMapSize, gl.capabilities.maxTextureSize);
  let sunDone = false;
  const lights: Object3D[] = [];
  scene.traverse((object) => lights.push(object));
  for (const object of lights) {
    if (object instanceof DirectionalLight && object.castShadow && !sunDone) {
      sunDone = true;
      const light = object;
      const shadowCamera = light.shadow.camera;
      const before = {
        position: light.position.clone(),
        target: light.target.position.clone(),
        intensity: light.intensity,
        color: light.color.clone(),
        mapSize: light.shadow.mapSize.clone(),
        radius: light.shadow.radius,
        bias: light.shadow.bias,
        normalBias: light.shadow.normalBias,
        frustum: [shadowCamera.left, shadowCamera.right, shadowCamera.top, shadowCamera.bottom, shadowCamera.near, shadowCamera.far],
      };
      const reallocate = () => {
        light.shadow.map?.dispose();
        light.shadow.map = null;
      };
      const update = () => {
        light.updateMatrixWorld();
        light.target.updateMatrixWorld();
        shadowCamera.updateProjectionMatrix();
        gl.shadowMap.needsUpdate = true;
      };
      undo.push(() => {
        light.position.copy(before.position);
        light.target.position.copy(before.target);
        light.intensity = before.intensity;
        light.color.copy(before.color);
        light.shadow.mapSize.copy(before.mapSize as Vector2);
        light.shadow.radius = before.radius;
        light.shadow.bias = before.bias;
        light.shadow.normalBias = before.normalBias;
        [shadowCamera.left, shadowCamera.right, shadowCamera.top, shadowCamera.bottom, shadowCamera.near, shadowCamera.far] = before.frustum;
        reallocate();
        update();
      });
      const [dx, dy, dz] = staging.sun.direction;
      light.position.set(centre.x + dx * (radius + 30), centre.y + dy * (radius + 30), centre.z + dz * (radius + 30));
      light.target.position.copy(centre);
      light.intensity = SUN_INTENSITY;
      light.color.copy(SUN_COLOR);
      light.shadow.mapSize.set(size, size);
      light.shadow.radius = staging.shadowRadius;
      light.shadow.bias = -0.0003;
      light.shadow.normalBias = 0.04;
      shadowCamera.left = shadowCamera.bottom = -radius;
      shadowCamera.right = shadowCamera.top = radius;
      shadowCamera.near = 1;
      shadowCamera.far = 2 * radius + 60;
      reallocate();
      update();
    } else if (object instanceof AmbientLight || object instanceof HemisphereLight) {
      const light = object;
      const intensity = light.intensity;
      undo.push(() => (light.intensity = intensity));
      light.intensity = intensity * AMBIENT_SCALE;
    } else if (object.name === 'Ground' && object.visible) {
      // The live grass: the site brings its own ground.
      undo.push(() => (object.visible = true));
      object.visible = false;
    }
  }

  scene.add(staging.site);
  undo.push(() => scene.remove(staging.site));

  return () => {
    // In reverse, so each setting returns to exactly what it was.
    for (const step of undo.reverse()) step();
  };
}
