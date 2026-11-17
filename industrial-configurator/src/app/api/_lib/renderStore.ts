/**
 * Where the quote pictures of saved configurations live. Today: the `ConfigurationImage` table (SQLite keeps the
 * deployment to one file). Every read and write goes through this module, so moving the bytes to disk or S3 later
 * changes only this file.
 */
import prisma from '@/lib/prisma';
import { RENDER_VIEWS, type RenderView } from '@/lib/hall/renderViews';
import { isRenderView, type ValidRender } from '@/lib/validation/renders';

export interface StoredRenderInfo {
  view: RenderView;
  width: number;
  height: number;
}

export interface StoredRender extends StoredRenderInfo {
  mime: string;
  bytes: Uint8Array;
}

const byViewOrder = (a: { view: string }, b: { view: string }) =>
  RENDER_VIEWS.indexOf(a.view as RenderView) - RENDER_VIEWS.indexOf(b.view as RenderView);

/** Public URL of one picture. Pictures never change once saved, so the URL can be cached for good. */
export const renderUrl = (token: string, view: RenderView) => `/api/configurations/${token}/renders/${view}`;

/** Stores validated pictures for a configuration (replacing any earlier picture of the same view). */
export async function saveRenders(configurationId: string, renders: readonly ValidRender[]): Promise<void> {
  for (const r of renders) {
    const row = { mime: r.mime, bytes: new Uint8Array(r.bytes), width: r.width, height: r.height };
    await prisma.configurationImage.upsert({
      where: { configurationId_view: { configurationId, view: r.view } },
      create: { configurationId, view: r.view, ...row },
      update: row,
    });
  }
}

/** Which pictures a configuration has, in display order (no bytes). */
export async function listRenders(configurationId: string): Promise<StoredRenderInfo[]> {
  const rows = await prisma.configurationImage.findMany({
    where: { configurationId },
    select: { view: true, width: true, height: true },
  });
  return rows.filter((r): r is StoredRenderInfo => isRenderView(r.view)).sort(byViewOrder);
}

/** One picture with its bytes, or null. */
export async function loadRender(configurationId: string, view: RenderView): Promise<StoredRender | null> {
  const row = await prisma.configurationImage.findUnique({
    where: { configurationId_view: { configurationId, view } },
    select: { view: true, width: true, height: true, mime: true, bytes: true },
  });
  return row && isRenderView(row.view) ? { ...row, view: row.view } : null;
}

/** Every picture with its bytes, in display order (for the PDF). */
export async function loadRenders(configurationId: string): Promise<StoredRender[]> {
  const rows = await prisma.configurationImage.findMany({
    where: { configurationId },
    select: { view: true, width: true, height: true, mime: true, bytes: true },
  });
  return rows.flatMap((r) => (isRenderView(r.view) ? [{ ...r, view: r.view }] : [])).sort(byViewOrder);
}
