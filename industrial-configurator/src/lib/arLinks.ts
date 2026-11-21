/**
 * Addresses of a configuration's AR page and files (docs/plans/ar.md), and whether this device can open AR. Client-safe
 * and tiny on purpose: the AR page, the summary step, the PDF and the API all build the URLs from here.
 */
import { AR_FILE_NAMES, type ArFormat } from '@/lib/validation/arModels';

/** Public page that shows the configuration in AR (relative). */
export const arPageUrl = (token: string) => `/configuration/${token}/ar`;

/** Public URL of one AR file (relative). The files never change once saved, so the URL can be cached for good. */
export const arFileUrl = (token: string, format: ArFormat) => `/api/configurations/${token}/ar/${AR_FILE_NAMES[format]}`;

/** A phone or tablet that can open AR (iOS Quick Look or Android Scene Viewer / WebXR). */
export function isArCapableDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac: tell it by its touch screen.
  const iPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod|Android/i.test(ua) || iPad;
}
