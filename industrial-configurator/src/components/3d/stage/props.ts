'use client';

/**
 * Props of the quote renders, placed from a prop plan (src/lib/hall/propPlan.ts). The 3D models (CC-BY, Sketchfab; see
 * public/render/CREDITS.md) are loaded once, normalised to real-world size with their base at the origin and their
 * long axis along +Z, and cloned for each placement. Trees and distant buildings are built here: a tree is a trunk and a
 * crown of leaf cards (about a thousand triangles), so dozens of them stay cheap.
 */
import {
  type Bone,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  SkinnedMesh,
  type Texture,
  TextureLoader,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seededRandom, TREE_VARIANTS, type Prop } from '@/lib/hall/propPlan';

const BASE = '/render/props/';

/** Real-world sizes the models are scaled to (metres). */
const SIZE = { van: { length: 5.3 }, forklift: { length: 3.4 }, pallet: { length: 1.2 }, worker: { height: 1.78 } } as const;

export interface PropAssets {
  cars: Object3D[];
  van: Object3D;
  forklift: Object3D;
  pallet: Object3D;
  bush: Object3D;
  worker: Object3D;
  trees: { trunk: BufferGeometry; leaves: BufferGeometry }[];
  treeMaterials: { bark: MeshStandardMaterial; leaves: MeshStandardMaterial };
  buildingMaterials: MeshStandardMaterial[];
  roofMaterial: MeshStandardMaterial;
  windowMaterial: MeshStandardMaterial;
  plinthMaterial: MeshStandardMaterial;
}

function shadows(object: Object3D): void {
  object.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = child.receiveShadow = true;
      if (child instanceof SkinnedMesh) child.frustumCulled = false;
    }
  });
}

/**
 * Wraps `object` so its base sits at the origin, centred, with its longer horizontal side along +Z, scaled to `length`
 * (longer horizontal side) or `height`.
 */
export function normalise(object: Object3D, target: { length?: number; height?: number }): Group {
  object.updateMatrixWorld(true);
  const turn = new Group();
  turn.add(object);
  let box = new Box3().setFromObject(turn, true);
  let size = box.getSize(new Vector3());
  if (size.x > size.z) {
    turn.rotation.y = Math.PI / 2;
    turn.updateMatrixWorld(true);
    box = new Box3().setFromObject(turn, true);
    size = box.getSize(new Vector3());
  }
  const scale = target.height ? target.height / size.y : (target.length ?? Math.max(size.x, size.z)) / Math.max(size.x, size.z);
  const centre = box.getCenter(new Vector3());
  const shift = new Group();
  shift.add(turn);
  turn.position.set(-centre.x, -box.min.y, -centre.z);
  const result = new Group();
  result.add(shift);
  shift.scale.setScalar(scale);
  shadows(result);
  return result;
}

/**
 * The car pack holds eight cars as loose meshes (a body and four wheels each) parked in a circle. Each body is taken with
 * the wheels under it, turned so its axle line runs along +Z, and normalised.
 */
export function splitCarPack(root: Object3D): Object3D[] {
  root.updateMatrixWorld(true);
  // Each car is a body node (paint, glass and lights as child meshes) and four wheel nodes.
  const nodes: Object3D[] = [];
  root.traverse((child) => nodes.push(child));
  const bodies = nodes.filter((n) => /body$/i.test(n.name.trim()));
  const wheels = nodes.filter((n) => /^wheel_[a-z]\d*$/i.test(n.name.trim()));
  const meshesOf = (node: Object3D) => {
    const list: Mesh[] = [];
    node.traverse((child) => {
      if (child instanceof Mesh) list.push(child);
    });
    return list;
  };
  const centreOf = (node: Object3D) => new Box3().setFromObject(node, true).getCenter(new Vector3());
  return bodies.map((body) => {
    const area = new Box3().setFromObject(body, true).expandByVector(new Vector3(0.3, 1, 0.3));
    const own = wheels.filter((w) => area.containsPoint(centreOf(w)));
    // Long axis from the wheel centres (principal direction in the ground plane).
    const centres = own.map(centreOf);
    const mx = centres.reduce((s, c) => s + c.x, 0) / Math.max(1, centres.length);
    const mz = centres.reduce((s, c) => s + c.z, 0) / Math.max(1, centres.length);
    let [sxx, szz, sxz] = [0, 0, 0];
    for (const c of centres) {
      sxx += (c.x - mx) ** 2;
      szz += (c.z - mz) ** 2;
      sxz += (c.x - mx) * (c.z - mz);
    }
    const heading = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const car = new Group();
    for (const part of [body, ...own].flatMap(meshesOf)) {
      // The exact world matrix (decomposing it would lose the shear of mirrored, scaled parents).
      const copy = new Mesh(part.geometry, part.material);
      copy.name = part.name;
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(part.matrixWorld);
      car.add(copy);
    }
    // Rotate about the car's own centre so its long axis (angle `heading` from +X) lies along +Z.
    const pivot = new Group();
    pivot.add(car);
    car.position.set(-mx, 0, -mz);
    pivot.rotation.y = heading - Math.PI / 2;
    return normalise(pivot, {});
  });
}

/**
 * The worker comes in a T-pose (its one animation starts in it too): lower the arms to the sides, elbows slightly bent,
 * by turning the upper arms about the body's forward axis until the hands hang below the shoulders.
 */
function poseWorker(scene: Object3D): Object3D {
  scene.updateMatrixWorld(true);
  const bone = (pattern: RegExp) => {
    let found: Object3D | undefined;
    scene.traverse((o) => {
      if (!found && (o as Bone).isBone && pattern.test(o.name)) found = o;
    });
    return found;
  };
  const turnInWorld = (b: Object3D, axis: Vector3, angle: number) => {
    const parentWorld = new Quaternion();
    b.parent!.getWorldQuaternion(parentWorld);
    const world = new Quaternion();
    b.getWorldQuaternion(world);
    const turned = new Quaternion().setFromAxisAngle(axis, angle).multiply(world);
    b.quaternion.copy(parentWorld.invert().multiply(turned));
    b.updateMatrixWorld(true);
  };
  const forward = new Vector3(0, 0, 1);
  for (const side of ['Left', 'Right']) {
    const arm = bone(new RegExp(`${side}Arm_`));
    const hand = bone(new RegExp(`${side}Hand_`));
    const foreArm = bone(new RegExp(`${side}ForeArm_`));
    if (!arm || !hand) continue;
    const shoulder = arm.getWorldPosition(new Vector3());
    // Try one direction; if the hand ends up above the shoulder, it was the other one.
    turnInWorld(arm, forward, 1.25);
    if (hand.getWorldPosition(new Vector3()).y > shoulder.y) turnInWorld(arm, forward, -2.5);
    if (foreArm) turnInWorld(foreArm, new Vector3(1, 0, 0), -0.25);
  }
  return scene;
}

/** Image areas of the three fronds in the leaf texture (u0, v0, u1, v1) and their width / height. */
const FRONDS = [
  { uv: [0.156, 0.531, 0.986, 0.971], aspect: 1.89 },
  { uv: [0.0, 0.307, 0.43, 0.678], aspect: 1.16 },
  { uv: [0.244, 0.014, 1.0, 0.414], aspect: 1.89 },
] as const;

/** One tree shape: a slightly leaning trunk with a few limbs, and a rounded crown of leaf cards. */
function treeGeometry(variant: number): { trunk: BufferGeometry; leaves: BufferGeometry } {
  const random = seededRandom(1000 + variant * 77);
  const trunkHeight = 2.6 + random() * 1.2;
  const lean = (random() - 0.5) * 0.12;
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.12, 0.2, trunkHeight + 1.2, 9, 1);
  trunk.translate(0, (trunkHeight + 1.2) / 2, 0);
  trunk.rotateZ(lean);
  parts.push(trunk);
  for (let i = 0; i < 4; i++) {
    const limb = new CylinderGeometry(0.05, 0.09, 2.2, 6, 1);
    limb.translate(0, 1.1, 0);
    limb.rotateZ(0.7 + random() * 0.4);
    limb.rotateY((i / 4) * Math.PI * 2 + random());
    limb.translate(0, trunkHeight - 0.2 + random() * 0.8, 0);
    parts.push(limb);
  }
  const crown = { y: trunkHeight + 2, rx: 2.5 + random() * 0.6, ry: 2.2 + random() * 0.6, rz: 2.5 + random() * 0.6 };

  const cards: BufferGeometry[] = [];
  const dummy = new Matrix4();
  for (let i = 0; i < 340; i++) {
    const frond = FRONDS[Math.floor(random() * FRONDS.length)];
    const length = 1.3 + random() * 0.7;
    const card = new PlaneGeometry(length, length / frond.aspect);
    const [u0, v0, u1, v1] = frond.uv;
    const uv = card.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
    // A point in the crown, biased to its surface, and a card facing roughly outwards.
    const dir = new Vector3(random() - 0.5, random() - 0.35, random() - 0.5).normalize();
    const depth = 0.55 + Math.sqrt(random()) * 0.45;
    const at = new Vector3(dir.x * crown.rx * depth, crown.y + dir.y * crown.ry * depth, dir.z * crown.rz * depth);
    const facing = dir.clone().add(new Vector3((random() - 0.5) * 0.8, 0.3, (random() - 0.5) * 0.8)).normalize();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), facing);
    q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), random() * Math.PI * 2));
    dummy.compose(at, q, new Vector3(1, 1, 1));
    card.applyMatrix4(dummy);
    // A little colour variation between cards: sunlit tips, darker inner leaves.
    const shade = 0.75 + depth * 0.25 + (random() - 0.5) * 0.12;
    const colors = new Float32Array(card.getAttribute('position').count * 3).fill(shade);
    card.setAttribute('color', new Float32BufferAttribute(colors, 3));
    cards.push(card);
  }
  const trunkGeometry = mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
  const leaves = mergeGeometries(cards.map((g) => g.toNonIndexed()))!;
  return { trunk: trunkGeometry, leaves };
}

let loading: Promise<PropAssets> | null = null;

export function loadPropAssets(): Promise<PropAssets> {
  loading ??= (async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const textures = new TextureLoader();
    const [cars, van, forklift, pallet, bush, worker, leafMap, barkMap, barkNormal] = await Promise.all([
      loader.loadAsync(`${BASE}cars.glb`),
      loader.loadAsync(`${BASE}van.glb`),
      loader.loadAsync(`${BASE}forklift.glb`),
      loader.loadAsync(`${BASE}pallet.glb`),
      loader.loadAsync(`${BASE}bush.glb`),
      loader.loadAsync(`${BASE}worker.glb`),
      textures.loadAsync(`${BASE}leaves.webp`),
      textures.loadAsync(`${BASE}bark.webp`),
      textures.loadAsync(`${BASE}bark_normal.webp`),
    ]);
    leafMap.colorSpace = barkMap.colorSpace = SRGBColorSpace;
    for (const t of [barkMap, barkNormal] as Texture[]) {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.repeat.set(2, 3);
    }
    const leaves = new MeshStandardMaterial({ map: leafMap, color: '#a3b884', alphaTest: 0.45, side: DoubleSide, roughness: 0.8, vertexColors: true });
    const bark = new MeshStandardMaterial({ map: barkMap, normalMap: barkNormal, roughness: 0.95 });
    const buildingMaterials = ['#b9bec2', '#a9afb4', '#c4bfb3', '#97a0a7'].map((c) => new MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.1 }));
    return {
      cars: splitCarPack(cars.scene),
      van: normalise(van.scene, SIZE.van),
      forklift: normalise(forklift.scene, SIZE.forklift),
      pallet: normalise(pallet.scene, SIZE.pallet),
      bush: normalise(bush.scene, { length: 1 }),
      worker: normalise(poseWorker(worker.scene), SIZE.worker),
      trees: Array.from({ length: TREE_VARIANTS }, (_, i) => treeGeometry(i)),
      treeMaterials: { bark, leaves },
      buildingMaterials,
      roofMaterial: new MeshStandardMaterial({ color: '#5d6166', roughness: 0.8, metalness: 0.2 }),
      windowMaterial: new MeshStandardMaterial({ color: '#2f363d', roughness: 0.15, metalness: 0.6 }),
      plinthMaterial: new MeshStandardMaterial({ color: '#8f8c86', roughness: 0.95 }),
    };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

function building(prop: Prop, assets: PropAssets): Group {
  const { w, d, h } = prop.size!;
  const group = new Group();
  const body = new Mesh(new BoxGeometry(w, h, d), assets.buildingMaterials[prop.variant % assets.buildingMaterials.length]);
  body.position.y = h / 2;
  const roof = new Mesh(new BoxGeometry(w + 0.4, 0.35, d + 0.4), assets.roofMaterial);
  roof.position.y = h + 0.17;
  // A strip of windows and a concrete plinth: enough to read as a neighbouring unit from far away.
  const windows = new Mesh(new BoxGeometry(w + 0.06, 1.1, d + 0.06), assets.windowMaterial);
  windows.position.y = h * 0.62;
  const plinth = new Mesh(new BoxGeometry(w + 0.08, 0.6, d + 0.08), assets.plinthMaterial);
  plinth.position.y = 0.3;
  group.add(body, roof, windows, plinth);
  group.userData.ownsGeometry = true;
  return group;
}

/** The props as one group (clones share the loaded geometry and materials; `disposeProps` frees only what was made here). */
export function buildProps(props: readonly Prop[], assets: PropAssets, groundY: number): Group {
  const group = new Group();
  group.name = 'RenderProps';
  for (const prop of props) {
    let object: Object3D;
    switch (prop.kind) {
      case 'car':
        object = assets.cars[prop.variant % assets.cars.length].clone();
        break;
      case 'van':
        object = assets.van.clone();
        break;
      case 'forklift':
        object = assets.forklift.clone();
        break;
      case 'worker':
        object = cloneSkinned(assets.worker);
        break;
      case 'pallets': {
        object = new Group();
        for (let i = 0; i <= prop.variant; i++) {
          const pallet = assets.pallet.clone();
          pallet.position.y = i * 0.15;
          object.add(pallet);
        }
        break;
      }
      case 'bush': {
        object = assets.bush.clone();
        object.scale.set(1.5 + prop.variant * 0.2, 1.05, 1.3);
        object.position.y = -0.1;
        break;
      }
      case 'tree': {
        const shape = assets.trees[prop.variant % assets.trees.length];
        object = new Group();
        const trunk = new Mesh(shape.trunk, assets.treeMaterials.bark);
        const leaves = new Mesh(shape.leaves, assets.treeMaterials.leaves);
        trunk.castShadow = trunk.receiveShadow = leaves.castShadow = leaves.receiveShadow = true;
        object.add(trunk, leaves);
        break;
      }
      case 'building':
        object = building(prop, assets);
        break;
    }
    const holder = new Group();
    holder.add(object);
    holder.position.set(prop.x, groundY, prop.z);
    holder.rotation.y = prop.rotation;
    holder.scale.multiplyScalar(prop.scale);
    group.add(holder);
  }
  return group;
}

/** Frees the buildings' own boxes; everything else is shared with the cached assets. */
export function disposeProps(group: Group): void {
  group.traverse((object) => {
    if (object.userData.ownsGeometry) {
      object.traverse((child) => {
        if (child instanceof Mesh) (child.geometry as BufferGeometry).dispose();
      });
    }
  });
}
