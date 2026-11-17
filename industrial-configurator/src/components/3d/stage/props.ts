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
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
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
import { seededRandom, type Prop } from '@/lib/hall/propPlan';

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
  trees: { trunk: BufferGeometry; leaves: BufferGeometry; radius: number }[];
  treeMaterials: { bark: MeshStandardMaterial; leaves: MeshStandardMaterial };
  contactShadow: { geometry: PlaneGeometry; material: MeshBasicMaterial };
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

/**
 * Tree species, roughly: crown size and shape (ellipsoid radii, or a cone), trunk height and thickness, how many leaf
 * cards and how big, and the leaf tint (multiplied with the photo texture).
 */
interface TreeShape {
  trunk: number;
  radius: number;
  crown: { rx: number; ry: number; rz: number; lift: number; lobes: number; cone?: boolean };
  cards: number;
  card: [min: number, max: number];
  tint: [number, number, number];
}

export const TREE_SHAPES: readonly TreeShape[] = [
  // Round deciduous (lime, maple): the everyday street tree.
  { trunk: 3, radius: 0.2, crown: { rx: 2.7, ry: 2.4, rz: 2.7, lift: 2, lobes: 1 }, cards: 360, card: [1.3, 2], tint: [1, 1, 1] },
  // Large broad tree (oak, walnut): wide, tall crown, thick trunk.
  { trunk: 3.6, radius: 0.38, crown: { rx: 4.8, ry: 3.6, rz: 4.6, lift: 3, lobes: 3 }, cards: 760, card: [1.7, 2.6], tint: [0.86, 0.95, 0.82] },
  // Poplar: narrow and tall.
  { trunk: 2, radius: 0.22, crown: { rx: 1.5, ry: 5, rz: 1.5, lift: 4.5, lobes: 1 }, cards: 420, card: [1.1, 1.6], tint: [0.92, 1.02, 0.9] },
  // Young tree: small and light.
  { trunk: 2.2, radius: 0.1, crown: { rx: 1.6, ry: 1.5, rz: 1.6, lift: 1.4, lobes: 1 }, cards: 170, card: [0.9, 1.3], tint: [1.08, 1.08, 0.92] },
  // Multi-stem birch-like cluster: several smaller crowns.
  { trunk: 3.4, radius: 0.16, crown: { rx: 2.2, ry: 2.6, rz: 2.2, lift: 2.4, lobes: 4 }, cards: 520, card: [1.1, 1.7], tint: [1.05, 1.06, 0.88] },
  // Dark cypress / conifer: a cone, dark and dense.
  { trunk: 1, radius: 0.18, crown: { rx: 2.2, ry: 5.5, rz: 2.2, lift: 4.5, lobes: 1, cone: true }, cards: 560, card: [1, 1.5], tint: [0.55, 0.7, 0.6] },
];

/** One tree: a trunk flaring into the ground, a few limbs, and a crown of leaf cards (one or more lobes). */
function treeGeometry(variant: number): { trunk: BufferGeometry; leaves: BufferGeometry; radius: number } {
  const shape = TREE_SHAPES[variant % TREE_SHAPES.length];
  const random = seededRandom(1000 + variant * 77);
  const parts: BufferGeometry[] = [];
  const stemTop = shape.trunk + shape.crown.lift;
  // Trunk: tapered, sunk 0.3 m into the ground, with a wider foot so it reads as rooted.
  const trunk = new CylinderGeometry(shape.radius * 0.55, shape.radius, stemTop + 0.3, 10, 1);
  trunk.translate(0, (stemTop + 0.3) / 2 - 0.3, 0);
  trunk.rotateZ((random() - 0.5) * 0.08);
  const foot = new CylinderGeometry(shape.radius * 1.05, shape.radius * 1.9, 0.55, 10, 1);
  foot.translate(0, 0.12, 0);
  parts.push(trunk, foot);
  for (let i = 0; i < 5; i++) {
    const length = shape.crown.rx * (0.6 + random() * 0.3);
    const limb = new CylinderGeometry(shape.radius * 0.25, shape.radius * 0.5, length, 6, 1);
    limb.translate(0, length / 2, 0);
    limb.rotateZ(0.6 + random() * 0.5);
    limb.rotateY((i / 5) * Math.PI * 2 + random());
    limb.translate(0, shape.trunk - 0.2 + random() * shape.crown.lift * 0.6, 0);
    parts.push(limb);
  }

  // Crown lobes: one ellipsoid, or several overlapping smaller ones around the top.
  const { rx, ry, rz, lobes, cone } = shape.crown;
  const centres: Vector3[] = [];
  for (let l = 0; l < lobes; l++) {
    const a = (l / lobes) * Math.PI * 2 + random();
    const off = lobes > 1 ? rx * 0.45 : 0;
    centres.push(new Vector3(Math.cos(a) * off, stemTop + (lobes > 1 ? (random() - 0.5) * ry * 0.5 : 0), Math.sin(a) * off));
  }
  const lobeScale = lobes > 1 ? 0.75 : 1;

  const cards: BufferGeometry[] = [];
  const dummy = new Matrix4();
  for (let i = 0; i < shape.cards; i++) {
    const frond = FRONDS[Math.floor(random() * FRONDS.length)];
    const length = shape.card[0] + random() * (shape.card[1] - shape.card[0]);
    const card = new PlaneGeometry(length, length / frond.aspect);
    const [u0, v0, u1, v1] = frond.uv;
    const uv = card.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
    // A point in the crown, biased to its surface, and a card facing roughly outwards.
    const centre = centres[i % centres.length];
    const dir = new Vector3(random() - 0.5, random() - 0.4, random() - 0.5).normalize();
    const depth = 0.55 + Math.sqrt(random()) * 0.45;
    let at: Vector3;
    if (cone) {
      const h = random(); // 0 at the bottom of the cone, 1 at its tip
      const r = rx * (1 - h) * depth;
      const angle = random() * Math.PI * 2;
      at = new Vector3(Math.cos(angle) * r, shape.trunk + 0.3 + h * ry * 2, Math.sin(angle) * r);
      dir.set(Math.cos(angle), 0.3, Math.sin(angle)).normalize();
    } else {
      at = new Vector3(dir.x * rx * depth * lobeScale, dir.y * ry * depth * lobeScale, dir.z * rz * depth * lobeScale).add(centre);
    }
    const facing = dir.clone().add(new Vector3((random() - 0.5) * 0.8, 0.3, (random() - 0.5) * 0.8)).normalize();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), facing);
    q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), random() * Math.PI * 2));
    dummy.compose(at, q, new Vector3(1, 1, 1));
    card.applyMatrix4(dummy);
    // Colour: the species' tint, sunlit tips lighter, inner leaves darker.
    const shade = 0.72 + depth * 0.28 + (random() - 0.5) * 0.12;
    const count = card.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) colors.set(shape.tint.map((t) => t * shade), k * 3);
    card.setAttribute('color', new Float32BufferAttribute(colors, 3));
    cards.push(card);
  }
  const trunkGeometry = mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
  const leaves = mergeGeometries(cards.map((g) => g.toNonIndexed()))!;
  return { trunk: trunkGeometry, leaves, radius: Math.max(rx, rz) * (lobes > 1 ? 1.25 : 1) };
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
      trees: TREE_SHAPES.map((_, i) => treeGeometry(i)),
      treeMaterials: { bark, leaves },
      contactShadow: {
        geometry: new PlaneGeometry(1, 1),
        material: new MeshBasicMaterial({
          map: contactShadowTexture(),
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        }),
      },
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
  // Trees are drawn instanced, one batch per species; every tree and bush gets a soft contact shadow on the ground
  // (the sun's shadow map covers only the yard, and without it distant trees seem to float).
  const treeMatrices = assets.trees.map(() => [] as Matrix4[]);
  const contacts: Matrix4[] = [];
  const contact = (x: number, z: number, radius: number) =>
    contacts.push(new Matrix4().compose(new Vector3(x, groundY + 0.03, z), FLAT, new Vector3(radius * 2, radius * 2, 1)));
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
        contact(prop.x, prop.z, 1.1 * prop.scale);
        break;
      }
      case 'tree': {
        const variant = prop.variant % assets.trees.length;
        treeMatrices[variant].push(
          new Matrix4().compose(new Vector3(prop.x, groundY, prop.z), new Quaternion().setFromAxisAngle(UP, prop.rotation), new Vector3(prop.scale, prop.scale, prop.scale)),
        );
        contact(prop.x, prop.z, assets.trees[variant].radius * prop.scale * 0.95);
        continue;
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

  const instanced = (geometry: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial, matrices: Matrix4[], shadows: boolean) => {
    const mesh = new InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = mesh.receiveShadow = shadows;
    mesh.frustumCulled = false;
    mesh.userData.instanced = true;
    group.add(mesh);
  };
  assets.trees.forEach((shape, i) => {
    if (treeMatrices[i].length === 0) return;
    instanced(shape.trunk, assets.treeMaterials.bark, treeMatrices[i], true);
    instanced(shape.leaves, assets.treeMaterials.leaves, treeMatrices[i], true);
  });
  if (contacts.length > 0) {
    instanced(assets.contactShadow.geometry, assets.contactShadow.material, contacts, false);
    group.children[group.children.length - 1].renderOrder = 1;
  }
  return group;
}

const UP = new Vector3(0, 1, 0);
/** A plane lying on the ground (PlaneGeometry faces +Z). */
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

/** Soft round shadow: dark in the middle, fading out at the edge. */
function contactShadowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const g = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.38)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = g;
  context.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/** Frees the buildings' own boxes; everything else is shared with the cached assets. */
export function disposeProps(group: Group): void {
  group.traverse((object) => {
    if (object instanceof InstancedMesh && object.userData.instanced) object.dispose();
    if (object.userData.ownsGeometry) {
      object.traverse((child) => {
        if (child instanceof Mesh) (child.geometry as BufferGeometry).dispose();
      });
    }
  });
}
