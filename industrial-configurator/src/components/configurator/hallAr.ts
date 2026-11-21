'use client';

/**
 * The AR files of a saved configuration (docs/plans/ar.md): exported from the 3D view and uploaded once, right after
 * the configuration is saved (in the background) or when "Vezi în AR" is pressed, whichever comes first.
 */
import { exportHallAr } from '@/components/3d/ar/arExport';
import { hallSettled } from './hallRenders';

export interface HallArLinks {
  /** The AR page (relative). */
  pageUrl: string;
  glb: string;
  usdz: string;
}

const uploads = new Map<string, Promise<HallArLinks>>();

const pageUrl = (token: string) => `/configuration/${token}/ar`;

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
  // 409: this configuration already has its AR files (an earlier upload from this or another tab).
  if (res.status === 409) {
    return { pageUrl: pageUrl(token), glb: `/api/configurations/${token}/ar/hall.glb`, usdz: `/api/configurations/${token}/ar/hall.usdz` };
  }
  if (!res.ok) throw new Error(`AR upload failed: HTTP ${res.status}`);
  const urls: { glb: string; usdz: string } = await res.json();
  return { pageUrl: pageUrl(token), ...urls };
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

/** A phone or tablet that can open AR (iOS Quick Look or Android Scene Viewer / WebXR). */
export function isArCapableDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac: tell it by its touch screen.
  const iPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod|Android/i.test(ua) || iPad;
}
