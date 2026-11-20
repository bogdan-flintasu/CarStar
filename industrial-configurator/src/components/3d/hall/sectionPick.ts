/**
 * Picking under the section cut and the layers (T3d): a raycast hit counts only when its object is drawn (it and all
 * its ancestors are visible: a hidden layer is not pickable) and, for the parts the cut clips (groups marked
 * `sectionClipProps`), when it lies on the kept side of the cut. Raycasting itself knows nothing of clipping planes.
 *
 * The live plane is set by <SectionCut /> (`setLivePickPlane`); `filterPickHits` is used by the engine's R3F event
 * filter, and `isHitCutAway` is the one check a custom raycaster (ComponentPicker) needs.
 */
import { isClipped, type SectionPlane, type SectionPoint } from './section';

/** userData key of a group whose materials the section cut clips. */
export const SECTION_CLIP = 'sectionClip';
export const sectionClipProps = { userData: { [SECTION_CLIP]: true } } as const;

/** The part of an Object3D this needs (plain objects in tests). */
export interface PickNode {
  visible: boolean;
  userData: Record<string, unknown>;
  parent: PickNode | null;
}

let livePlane: Pick<SectionPlane, 'normal' | 'constant'> | null = null;

export function setLivePickPlane(plane: Pick<SectionPlane, 'normal' | 'constant'> | null): void {
  livePlane = plane;
}

export function isShownNode(object: PickNode): boolean {
  for (let o: PickNode | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function isClippedNode(object: PickNode): boolean {
  for (let o: PickNode | null = object; o; o = o.parent) if (o.userData[SECTION_CLIP]) return true;
  return false;
}

/** True when the hit is on a part the live cut removed. */
export function isHitCutAway(hit: { object: PickNode; point: SectionPoint }, plane = livePlane): boolean {
  return plane !== null && isClippedNode(hit.object) && isClipped(hit.point, plane);
}

/** Hits the user can see: drawn, and not cut away. Keeps the order. */
export function filterPickHits<H extends { object: PickNode; point: SectionPoint }>(hits: H[], plane = livePlane): H[] {
  return hits.filter((hit) => isShownNode(hit.object) && !isHitCutAway(hit, plane));
}
