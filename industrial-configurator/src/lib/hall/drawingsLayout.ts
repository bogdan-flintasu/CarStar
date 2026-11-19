/**
 * Places a Drawing's annotations for a given scale: the dimension rows, the sill dimensions and the axis bubbles keep a
 * constant distance on screen (or on paper) instead of the sheet-metre offsets of the model, so the text never
 * collides at small scales (a 102 m hall on an A4 page, a zoomed-out orthographic view). The measured values do not
 * change: only where the dimension lines and bubbles stand. Pure, shared by the 3D flat views and the PDF quote.
 *
 * `unit` is how many sheet metres one screen unit (a pixel, a PDF point) is: 1 / zoom, 1 / scale.
 */
import {
  AXIS_LABEL_GAP,
  DIMENSION_FIRST_OFFSET,
  DIMENSION_ROW_GAP,
  type DimensionChain,
  type Drawing,
  type DrawingAxis,
  type DrawingLayer,
} from './drawings';
import type { Vec2 } from './types';

/** Distances in screen units (pixels, points). */
export interface AnnotationSpacing {
  /** Building to the first dimension row. */
  first: number;
  /** Between two dimension rows. */
  gap: number;
  /** Opening edge to its sill dimension. */
  sillGap: number;
  /** Text baseline off its dimension line. */
  textOffset: number;
  /** Text height, for the extent and for the "does it fit" test. */
  fontSize: number;
  /** Axis line end to the bubble's centre, and the bubble's radius. */
  bubbleGap: number;
  bubbleRadius: number;
}

export interface Extent {
  min: Vec2;
  max: Vec2;
}

export interface PlacedSegment {
  from: number;
  to: number;
  text: string;
  /** Where the text's centre goes (sheet metres), already off the line on the outer side. */
  textAt: Vec2;
  /** Whether the text is narrower than its segment at this scale. */
  fits: boolean;
}

export interface PlacedChain {
  id: string;
  direction: 'x' | 'y';
  base: number;
  /** The dimension line's coordinate at this scale. */
  line: number;
  /** +1 / -1: which way the chain stands off the drawing (along the other axis). */
  outwards: 1 | -1;
  points: number[];
  segments: PlacedSegment[];
}

export interface PlacedAxis extends DrawingAxis {
  /** The bubble's centre at this scale (replaces `labelAt`). */
  bubble: Vec2;
}

export interface PlacedDrawing {
  chains: PlacedChain[];
  axes: PlacedAxis[];
  /** Extent of the drawn geometry (polylines). */
  core: Extent;
  /** Extent of everything, annotations included, at this scale. */
  extent: Extent;
}

/** Text width estimate for Inter-like fonts: average advance ~0.56 em. */
export const textWidth = (text: string, fontSize: number) => text.length * fontSize * 0.56;

const isSill = (c: DimensionChain) => c.id.startsWith('sill:');

/** Which way a chain stands off the drawing: from its measured feature (`base`) towards its line. */
export function chainOutwards(c: DimensionChain): 1 | -1 {
  return c.line > c.base ? 1 : -1;
}

/** The dimension line of `c` with the model's metre offsets replaced by screen distances. */
export function placedChainLine(c: DimensionChain, unit: number, spacing: AnnotationSpacing): number {
  const outwards = chainOutwards(c);
  if (isSill(c)) return c.base + outwards * spacing.sillGap * unit;
  // The model puts row r at edge + outwards * (FIRST + r * GAP): recover the edge, re-space the rows.
  const edge = c.line - outwards * (DIMENSION_FIRST_OFFSET + c.row * DIMENSION_ROW_GAP);
  return edge + outwards * (spacing.first + c.row * spacing.gap) * unit;
}

/** The bubble of an axis, `bubbleGap` screen units past the end of the line it was drawn at. */
export function placedBubble(a: DrawingAxis, unit: number, spacing: AnnotationSpacing): Vec2 {
  const along = a.direction === 'y' ? a.labelAt[1] : a.labelAt[0];
  // The model puts the bubble AXIS_LABEL_GAP past one end of the line.
  const end = along > a.to + AXIS_LABEL_GAP / 2 ? a.to + spacing.bubbleGap * unit : a.from - spacing.bubbleGap * unit;
  return a.direction === 'y' ? [a.at, end] : [end, a.at];
}

function emptyExtent() {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function placeDrawing(
  drawing: Drawing,
  unit: number,
  spacing: AnnotationSpacing,
  coreLayers?: readonly DrawingLayer[],
): PlacedDrawing {
  const core = emptyExtent();
  for (const pl of drawing.polylines) {
    if (coreLayers && !coreLayers.includes(pl.layer)) continue;
    for (const [x, y] of pl.points) {
      core.minX = Math.min(core.minX, x);
      core.minY = Math.min(core.minY, y);
      core.maxX = Math.max(core.maxX, x);
      core.maxY = Math.max(core.maxY, y);
    }
  }
  const all = { ...core };
  const add = (x: number, y: number) => {
    all.minX = Math.min(all.minX, x);
    all.minY = Math.min(all.minY, y);
    all.maxX = Math.max(all.maxX, x);
    all.maxY = Math.max(all.maxY, y);
  };

  const chains = drawing.dimensions.map((c): PlacedChain => {
    const outwards = chainOutwards(c);
    const line = placedChainLine(c, unit, spacing);
    // Text on the outer side of the line: between this row and the next one out.
    const textLine = line + outwards * (spacing.textOffset + spacing.fontSize / 2) * unit;
    const segments = c.segments.map((s) => {
      const mid = (s.from + s.to) / 2;
      const textAt: Vec2 = c.direction === 'x' ? [mid, textLine] : [textLine, mid];
      const fits = (s.to - s.from) / unit >= textWidth(s.text, spacing.fontSize) + 2;
      if (fits) {
        const half = (textWidth(s.text, spacing.fontSize) / 2) * unit;
        const edge = textLine + outwards * (spacing.fontSize / 2) * unit;
        if (c.direction === 'x') {
          add(mid - half, edge);
          add(mid + half, edge);
        } else {
          add(edge, mid - half);
          add(edge, mid + half);
        }
      }
      return { from: s.from, to: s.to, text: s.text, textAt, fits };
    });
    for (const p of c.points) {
      if (c.direction === 'x') add(p, line);
      else add(line, p);
    }
    return { id: c.id, direction: c.direction, base: c.base, line, outwards, points: c.points, segments };
  });

  const axes = drawing.axes.map((a): PlacedAxis => {
    const bubble = placedBubble(a, unit, spacing);
    const r = spacing.bubbleRadius * unit;
    add(bubble[0] - r, bubble[1] - r);
    add(bubble[0] + r, bubble[1] + r);
    return { ...a, bubble };
  });

  for (const l of drawing.labels) add(l.at[0], l.at[1]);

  return {
    chains,
    axes,
    core: { min: [core.minX, core.minY], max: [core.maxX, core.maxY] },
    extent: { min: [all.minX, all.minY], max: [all.maxX, all.maxY] },
  };
}

export interface FitBox {
  width: number;
  height: number;
}

export interface Margins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Fit {
  /** Screen units per sheet metre. */
  scale: number;
  /** Screen position of the sheet origin: screen x = offsetX + x * scale, screen y (down) = offsetY - y * scale. */
  offsetX: number;
  offsetY: number;
}

const NO_MARGINS: Margins = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * The largest scale at which `bounds` (sheet metres) plus fixed `margins` (screen units) fit `box`, centred.
 * Screen y runs down, as in SVG.
 */
export function fitDrawing(bounds: Extent, box: FitBox, margins: Margins = NO_MARGINS): Fit {
  const w = Math.max(bounds.max[0] - bounds.min[0], 1e-6);
  const h = Math.max(bounds.max[1] - bounds.min[1], 1e-6);
  const scale = Math.max(
    Math.min((box.width - margins.left - margins.right) / w, (box.height - margins.top - margins.bottom) / h),
    1e-6,
  );
  const usedW = w * scale + margins.left + margins.right;
  const usedH = h * scale + margins.top + margins.bottom;
  const left = (box.width - usedW) / 2 + margins.left;
  const top = (box.height - usedH) / 2 + margins.top;
  return { scale, offsetX: left - bounds.min[0] * scale, offsetY: top + bounds.max[1] * scale };
}

/**
 * Fits a drawing with its annotations into `box`: the annotations take a constant room in screen units, so the scale
 * is found by a few rounds of "place at this scale, measure the margins, refit the geometry".
 */
export function fitPlacedDrawing(
  drawing: Drawing,
  box: FitBox,
  spacing: AnnotationSpacing,
): { fit: Fit; placed: PlacedDrawing } {
  let placed = placeDrawing(drawing, 1, spacing);
  let fit = fitDrawing(placed.core, box);
  for (let i = 0; i < 5; i += 1) {
    placed = placeDrawing(drawing, 1 / fit.scale, spacing);
    const { core, extent } = placed;
    const margins: Margins = {
      left: (core.min[0] - extent.min[0]) * fit.scale,
      right: (extent.max[0] - core.max[0]) * fit.scale,
      top: (extent.max[1] - core.max[1]) * fit.scale,
      bottom: (core.min[1] - extent.min[1]) * fit.scale,
    };
    fit = fitDrawing(core, box, margins);
  }
  placed = placeDrawing(drawing, 1 / fit.scale, spacing);
  return { fit, placed };
}

/** 1 PDF point in millimetres. */
export const POINT_MM = 25.4 / 72;

/**
 * The drawing scale "1:n" of `pointsPerMetre` on paper, rounded to a familiar value: to 10 below 100, to 50 below
 * 1000, to 100 above.
 */
export function paperScaleDenominator(pointsPerMetre: number): number {
  const exact = 1000 / (pointsPerMetre * POINT_MM);
  const step = exact < 100 ? 10 : exact < 1000 ? 50 : 100;
  return Math.max(step, Math.round(exact / step) * step);
}
