'use client';

/**
 * The AR files of a saved configuration (docs/plans/ar.md): exported from the 3D view and uploaded once, right after
 * the configuration is saved (in the background) or when "Vezi în AR" is pressed, whichever comes first.
 */
import { exportHallAr } from '@/components/3d/ar/arExport';
import { arFileUrl, arPageUrl } from '@/lib/arLinks';
import { hallSettled } from './hallRenders';

export interface HallArLinks {
  /** The AR page (relative). */
  pageUrl: string;
  glb: string;
  usdz: string;
}

const uploads = new Map<string, Promise<HallArLinks>>();

async function exportAndUpload(token: string): Promise<HallArLinks> {
  await hallSettled();
  const files = await exportHallAr();
  if (process.env.NODE_ENV !== 'production') {
    console.info('[ar] exported', { ...files.stats, glbBytes: files.glb.size, usdzBytes: files.usdz.size });
  }
  const form = new FormData();
  form.append('glb', files.glb, 'hall.glb');
  form.append('usdz', files.usdz, 'hall.usdz');
  const res = await fetch(`/api/configurations/${token}/ar`, { method: 'POST', body: form });
  // 409 only: this configuration already has its AR files (an earlier upload from this or another tab). A closed
  // upload window (410) or any other failure means there are none.
  if (!res.ok && res.status !== 409) throw new Error(`AR upload failed: HTTP ${res.status}`);
  return { pageUrl: arPageUrl(token), glb: arFileUrl(token, 'glb'), usdz: arFileUrl(token, 'usdz') };
}

/** The AR files of configuration `token`, exported and uploaded once per page session (retried after a failure). */
export function ensureHallAr(token: string): Promise<HallArLinks> {
  let upload = uploads.get(token);
  if (!upload) {
    upload = exportAndUpload(token);
    uploads.set(token, upload);
    upload.catch(() => uploads.delete(token));
  }
  return upload;
}

export { isArCapableDevice } from '@/lib/arLinks';
