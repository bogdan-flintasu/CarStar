#!/usr/bin/env node
/**
 * C6: optimise the hall kit exported by scripts/blender/03_kit.py into the shipping GLB.
 *
 *   node scripts/optimize-model.mjs [in=~/CarStar-assets/hall-kit.raw.glb] [out=public/models/hall-kit.glb]
 *
 * Ships LOD0 pieces, their `_LOD1` twins (C7) and the Bolt.
 * Pipeline: dedup -> prune (keep empty leaves = bolt sockets, extras, UVs) -> weld -> reorder ->
 * quantize NORMAL only -> EXT_meshopt_compression (FILTER).
 * POSITION is deliberately NOT quantized: KHR_mesh_quantization moves a dequantization TRS onto
 * every mesh node, which would break the contract (each piece is a root node with identity TRS and
 * its geometry in metres around the anchor). Do not use `gltfjsx --transform` or `gltf-transform
 * optimize` either: they flatten/join the kit.
 *
 * No project dependency is added: the pinned gltf-transform CLI runs through `pnpm dlx`, and this
 * same file is loaded back as its `--config` to register the custom `kit` command. After writing,
 * the output is verified (node names, identity TRS, origins/bounds vs the raw export, size, tris)
 * and a compact JSON summary is printed. Exit code 1 on any contract violation.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CLI = '@gltf-transform/cli@4.5.1';
const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const MAX_BYTES = 1024 * 1024;
const MAX_FRAME_TRIS = 60000;

/** Contract v1.0 (public/models/ASSET_CONTRACT.md): root nodes and their bolt-socket counts. */
export const KIT_NODES = {
  Column: 0, BasePlate: 8, EaveHaunch: 12, Rafter: 0, RidgeJoint: 8, Purlin: 0, PurlinCleat: 4,
  GirtCleat: 2, Gutter: 0, GutterEndCap: 0, Downpipe: 0, DownpipeShoe: 0, DownpipeOutlet: 0,
  RidgeCap: 0, Bolt: 0, PanelSwatch: 0, ConcreteSwatch: 0,
};
/** C7: every frame piece has a `<Piece>_LOD1` twin (same anchor/stretch, no sockets); frames > ~20 m away. */
export const LOD1_OF = Object.keys(KIT_NODES).filter((n) => !['Bolt', 'PanelSwatch', 'ConcreteSwatch'].includes(n));
for (const n of LOD1_OF) KIT_NODES[`${n}_LOD1`] = 0;
const MATERIALS = ['Steel', 'Panel', 'Concrete'];

// ── config mode: loaded by the gltf-transform CLI through --config ───────────
const gltfTransformConfig = {
  onProgramReady: async ({ program, io }) => {
    // Resolve the SDK from the CLI's own install (dlx store), ESM builds.
    const req = createRequire(realpathSync(process.argv[1]));
    const esm = (id) => import(pathToFileURL(req.resolve(id).replace(/\.cjs$/, '.js')).href);
    const { dedup, prune, weld, reorder, quantize } = await esm('@gltf-transform/functions');
    const { EXTMeshoptCompression, KHRMeshQuantization } = await esm('@gltf-transform/extensions');
    const { MeshoptEncoder } = await esm('meshoptimizer');

    const bounds = (doc) => {
      const out = {};
      for (const mesh of doc.getRoot().listMeshes()) {
        const pos = mesh.listPrimitives().map((p) => p.getAttribute('POSITION'));
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (const a of pos) {
          const lo = a.getMin([]);
          const hi = a.getMax([]);
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], lo[i]);
            max[i] = Math.max(max[i], hi[i]);
          }
        }
        out[mesh.getName()] = [...min, ...max];
      }
      return out;
    };

    program
      .command('kit', 'CarStar hall kit: dedup, prune (keep leaves/extras/UVs), weld, reorder, quantize normals, meshopt')
      .argument('<input>', 'raw kit GLB from scripts/blender/03_kit.py')
      .argument('<output>', 'shipping GLB')
      .action(async ({ args }) => {
        await MeshoptEncoder.ready;
        const doc = await io.read(args.input);
        const before = bounds(doc);
        await doc.transform(
          dedup(),
          prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
          weld(),
          reorder({ encoder: MeshoptEncoder, target: 'size' }),
          quantize({ pattern: /^NORMAL$/, quantizeNormal: 10, cleanup: false }),
        );
        doc.createExtension(KHRMeshQuantization).setRequired(true); // int8 normals
        doc
          .createExtension(EXTMeshoptCompression)
          .setRequired(true)
          .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
        await io.write(args.output, doc);
        const after = bounds(await io.read(args.output));
        let maxDelta = 0;
        for (const [name, b] of Object.entries(before)) {
          if (!after[name]) throw new Error(`mesh ${name} lost`);
          b.forEach((v, i) => (maxDelta = Math.max(maxDelta, Math.abs(v - after[name][i]))));
        }
        console.log(`KIT_BOUNDS_MAX_DELTA ${maxDelta}`);
      });
  },
};
export default gltfTransformConfig;

// ── main mode ────────────────────────────────────────────────────────────────
function readGlbJson(file) {
  const b = readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

function verify(file, cliOut) {
  const j = readGlbJson(file);
  const errors = [];
  const roots = j.scenes[j.scene ?? 0].nodes.map((i) => j.nodes[i]);
  const byName = Object.fromEntries(roots.map((n) => [n.name, n]));
  const tris = {};
  for (const [name, sockets] of Object.entries(KIT_NODES)) {
    const n = byName[name];
    if (!n) { errors.push(`missing root node ${name}`); continue; }
    if (n.translation || n.rotation || n.scale || n.matrix) errors.push(`${name}: non-identity TRS`);
    if (n.mesh === undefined) { errors.push(`${name}: no mesh`); continue; }
    const mesh = j.meshes[n.mesh];
    if (mesh.name !== name) errors.push(`${name}: mesh named ${mesh.name}`);
    tris[name] = mesh.primitives.reduce((s, p) => s + j.accessors[p.indices].count / 3, 0);
    const kids = (n.children ?? []).map((i) => j.nodes[i]);
    const socketKids = kids.filter((k) => k.name.startsWith(`${name}_BoltSocket_`) && k.mesh === undefined);
    if (socketKids.length !== sockets || kids.length !== sockets) errors.push(`${name}: ${kids.length} children, want ${sockets} sockets`);
  }
  const extra = roots.filter((n) => !(n.name in KIT_NODES)).map((n) => n.name);
  if (extra.length) errors.push(`unexpected root nodes ${extra.join(',')}`);
  const mats = (j.materials ?? []).map((m) => m.name).sort();
  if (mats.join() !== [...MATERIALS].sort().join()) errors.push(`materials ${mats.join(',')}`);
  for (const ext of ['EXT_meshopt_compression', 'KHR_mesh_quantization']) {
    if (!(j.extensionsRequired ?? []).includes(ext)) errors.push(`${ext} not required`);
  }
  const posQuantized = j.meshes.some((m) => m.primitives.some((p) => j.accessors[p.attributes.POSITION].componentType !== 5126));
  if (posQuantized) errors.push('POSITION is quantized');
  const bytes = statSync(file).size;
  if (bytes > MAX_BYTES) errors.push(`size ${bytes} > ${MAX_BYTES}`);
  const delta = Number((cliOut.match(/KIT_BOUNDS_MAX_DELTA (\S+)/) ?? [])[1]);
  if (!(delta < 1e-4)) errors.push(`bounds changed by ${delta}`);

  // one complete source frame (12 m wide, 1 bay of purlins/gutters), see assets/blender/kit_reference.json
  const ref = JSON.parse(readFileSync(path.join(ROOT, 'assets/blender/kit_reference.json'), 'utf8'));
  const frameTris = ref.instances.reduce((s, i) => s + (tris[i.piece] ?? 0), 0) + ref.frame_bolts * (tris.Bolt ?? 0);
  if (frameTris > MAX_FRAME_TRIS) errors.push(`frame tris ${frameTris} > ${MAX_FRAME_TRIS}`);
  const frameTrisLod1 = ref.instances.reduce((s, i) => s + (tris[`${i.piece}_LOD1`] ?? 0), 0);
  if (!(frameTrisLod1 < frameTris / 2)) errors.push(`LOD1 frame tris ${frameTrisLod1} not < half of LOD0`);
  return { file: path.relative(ROOT, file), bytes, frameTris, frameTrisLod1, boundsMaxDelta: delta, extensions: j.extensionsUsed, tris, errors };
}

function main() {
  const input = path.resolve(process.argv[2] ?? path.join(os.homedir(), 'CarStar-assets', 'hall-kit.raw.glb'));
  const output = path.resolve(process.argv[3] ?? path.join(ROOT, 'public', 'models', 'hall-kit.glb'));
  const run = spawnSync('pnpm', ['dlx', CLI, 'kit', input, output, '--config', SELF], { encoding: 'utf8' });
  const log = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (run.status !== 0) {
    console.error(log);
    process.exit(1);
  }
  const summary = verify(output, log);
  console.log(JSON.stringify(summary, null, 1));
  if (summary.errors.length) process.exit(1);
}

if (process.argv[1] && realpathSync(process.argv[1]) === SELF) main();
