/**
 * The drawing pages of the PDF quote: the hall's front, one side, the plan and the cross-section as vector drawings
 * (src/lib/hall/drawings.ts, carried by the QuoteModel), two per page, each scaled to fit its box, with the main
 * dimensions, the grid axes, the openings and their sizes, a title and the approximate scale. Rendered inside the
 * quote's Page, so the fixed header and footer repeat on these pages too; the text uses the Inter font quotePdf.tsx
 * registers.
 */
import { Circle, G, Line, Path, Svg, Text, View } from '@react-pdf/renderer';
import type { ComponentProps } from 'react';
import type { Drawing, DrawingLayer, Vec2 } from '@/lib/hall';
import { fitPlacedDrawing, paperScaleDenominator, type AnnotationSpacing, type Fit } from '@/lib/hall/drawingsLayout';
import type { QuoteModel } from '@/lib/quote/quoteModel';

/** A4 width minus the page padding of quotePdf.tsx. */
export const DRAWING_BOX_WIDTH = 595.28 - 2 * 40;
/** Two drawings with their titles, under the heading, fit one page between the fixed header and footer. */
export const DRAWING_BOX_HEIGHT = 262;
export const DRAWINGS_PER_PAGE = 2;

/** Annotation distances on paper, in points. */
export const PDF_SPACING: AnnotationSpacing = {
  first: 16,
  gap: 12,
  sillGap: 7,
  textOffset: 1.5,
  fontSize: 5.5,
  bubbleGap: 6,
  bubbleRadius: 4,
};

const TICK = 2;
const EXTENSION_GAP = 1.5;
const EXTENSION_OVERSHOOT = 2.5;

type Colors = QuoteModel['company']['colors'];

/** Stroke per layer, painted in this order (the openings and the outline over the hidden steel). */
const LAYER_ORDER: DrawingLayer[] = ['foundation', 'grid', 'steel', 'cladding', 'roof', 'outline', 'openings'];

function layerStyle(layer: DrawingLayer, view: Drawing['view'], c: Colors) {
  const elevation = view !== 'plan' && view !== 'section';
  switch (layer) {
    case 'outline':
      return { stroke: c.text, strokeWidth: 0.9, fill: 'none' };
    case 'openings':
      return { stroke: c.text, strokeWidth: 0.6, fill: '#ffffff' };
    case 'roof':
      return { stroke: c.text, strokeWidth: 0.6, fill: 'none' };
    case 'cladding':
      return { stroke: c.muted, strokeWidth: 0.45, fill: 'none' };
    case 'steel':
      // Behind the cladding on an elevation: hidden lines. Cut (section) or seen from above (plan): solid.
      return elevation
        ? { stroke: c.muted, strokeWidth: 0.35, fill: 'none', strokeDasharray: '2 1.5' }
        : { stroke: c.text, strokeWidth: 0.5, fill: view === 'plan' ? c.text : 'none' };
    case 'foundation':
      return { stroke: c.muted, strokeWidth: 0.4, fill: 'none' };
    case 'grid':
      return { stroke: c.muted, strokeWidth: 0.3, fill: 'none', strokeDasharray: '6 2 1 2' };
    default:
      return { stroke: c.text, strokeWidth: 0.4, fill: 'none' };
  }
}

type SvgStyle = NonNullable<ComponentProps<typeof Line>['style']>;

/** SVG text style: react-pdf reads the font from it, its typings only know the presentation attributes. */
const textStyle = (size: number, weight = 400) =>
  ({ fontFamily: 'Inter', fontSize: size, fontWeight: weight }) as unknown as SvgStyle;

function DrawingSvg({ drawing, colors }: { drawing: Drawing; colors: Colors }) {
  const { fit, placed } = fitPlacedDrawing(drawing, { width: DRAWING_BOX_WIDTH, height: DRAWING_BOX_HEIGHT }, PDF_SPACING);
  const X = (x: number) => fit.offsetX + x * fit.scale;
  const Y = (y: number) => fit.offsetY - y * fit.scale;
  const pt = ([x, y]: Vec2) => `${X(x).toFixed(2)} ${Y(y).toFixed(2)}`;
  const path = (points: readonly Vec2[], closed: boolean) => `M ${points.map(pt).join(' L ')}${closed ? ' Z' : ''}`;
  const dim = colors.text;
  const fs = PDF_SPACING.fontSize;

  const polylines = LAYER_ORDER.flatMap((layer) => drawing.polylines.filter((p) => p.layer === layer && p.points.length >= 2));

  return (
    <Svg width={DRAWING_BOX_WIDTH} height={DRAWING_BOX_HEIGHT} viewBox={`0 0 ${DRAWING_BOX_WIDTH} ${DRAWING_BOX_HEIGHT}`}>
      {polylines.map((p, i) => (
        <Path key={`${p.ref ?? p.layer}-${i}`} d={path(p.points, p.closed)} {...layerStyle(p.layer, drawing.view, colors)} />
      ))}

      {placed.axes.map((a) => {
        const [bx, by] = [X(a.bubble[0]), Y(a.bubble[1])];
        return (
          <G key={`axis-${a.label}-${a.at}`}>
            <Circle cx={bx} cy={by} r={PDF_SPACING.bubbleRadius} stroke={colors.muted} strokeWidth={0.4} fill="#ffffff" />
            <Text x={bx} y={by + fs * 0.36} textAnchor="middle" fill={dim} style={textStyle(fs, 600)}>
              {a.label}
            </Text>
          </G>
        );
      })}

      {placed.chains.map((c) => {
        const at = (along: number, across: number): Vec2 => (c.direction === 'x' ? [along, across] : [across, along]);
        const unit = 1 / fit.scale;
        const first = c.points[0];
        const last = c.points[c.points.length - 1];
        const seg = (a: Vec2, b: Vec2, key: string, width = 0.4) => (
          <Line key={key} x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke={dim} strokeWidth={width} />
        );
        return (
          <G key={c.id}>
            {seg(at(first, c.line), at(last, c.line), 'line')}
            {c.points.flatMap((p) => [
              seg(at(p, c.base + EXTENSION_GAP * unit * c.outwards), at(p, c.line + EXTENSION_OVERSHOOT * unit * c.outwards), `ext-${p}`, 0.25),
              seg(at(p - TICK * unit, c.line - TICK * unit), at(p + TICK * unit, c.line + TICK * unit), `tick-${p}`, 0.6),
            ])}
            {c.segments
              .filter((s) => s.fits)
              .map((s) => {
                const [tx, ty] = [X(s.textAt[0]), Y(s.textAt[1])];
                return c.direction === 'x' ? (
                  <Text key={`t-${s.from}`} x={tx} y={ty + fs * 0.36} textAnchor="middle" fill={dim} style={textStyle(fs)}>
                    {s.text}
                  </Text>
                ) : (
                  <Text
                    key={`t-${s.from}`}
                    x={tx + fs * 0.36}
                    y={ty}
                    textAnchor="middle"
                    fill={dim}
                    transform={`rotate(-90 ${(tx + fs * 0.36).toFixed(2)} ${ty.toFixed(2)})`}
                    style={textStyle(fs)}
                  >
                    {s.text}
                  </Text>
                );
              })}
          </G>
        );
      })}

      {drawing.labels.map((l, i) => (
        <Text key={`label-${i}`} x={X(l.at[0])} y={Y(l.at[1]) + fs * 0.36} textAnchor="middle" fill={dim} style={textStyle(fs, 600)}>
          {l.text}
        </Text>
      ))}
    </Svg>
  );
}

/** "Scara aprox. 1:200" for a fit (points per metre). */
export const scaleNote = (fit: Pick<Fit, 'scale'>) => `Scara aprox. 1:${paperScaleDenominator(fit.scale)}`;

function DrawingBlock({ drawing, colors }: { drawing: Drawing; colors: Colors }) {
  const { fit } = fitPlacedDrawing(drawing, { width: DRAWING_BOX_WIDTH, height: DRAWING_BOX_HEIGHT }, PDF_SPACING);
  return (
    <View wrap={false} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
        <Text style={{ fontSize: 9.5, fontWeight: 600 }}>{drawing.title}</Text>
        <Text style={{ fontSize: 7.5, color: colors.muted }}>{scaleNote(fit)}</Text>
      </View>
      <View style={{ borderWidth: 0.6, borderColor: colors.line, borderRadius: 3 }}>
        <DrawingSvg drawing={drawing} colors={colors} />
      </View>
    </View>
  );
}

/** The drawings of the quote, two per page, each page starting on a new sheet. */
export function QuoteDrawingPages({ model }: { model: QuoteModel }) {
  const pages: Drawing[][] = [];
  for (let i = 0; i < model.drawings.length; i += DRAWINGS_PER_PAGE) pages.push(model.drawings.slice(i, i + DRAWINGS_PER_PAGE));
  return (
    <>
      {pages.map((drawings, i) => (
        <View key={drawings.map((d) => d.view).join('-')} break>
          <Text
            style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, color: model.company.colors.text }}
          >
            {i === 0 ? 'Desene' : 'Desene (continuare)'}
          </Text>
          {drawings.map((d) => (
            <DrawingBlock key={d.view} drawing={d} colors={model.company.colors} />
          ))}
          <Text style={{ fontSize: 7.5, color: model.company.colors.muted }}>
            Desene schematice, cote în metri. Nu înlocuiesc proiectul tehnic.
          </Text>
        </View>
      ))}
    </>
  );
}
