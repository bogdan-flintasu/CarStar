'use client';

/**
 * Screenshots of the 3D view for UI outside the canvas (the admin's "save as model"). `<SnapshotProvider />` sits in
 * the canvas and registers a capturer; `takeHallSnapshot()` renders one frame and reads it back straight away, so the
 * canvas does not need `preserveDrawingBuffer`.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

type Capturer = () => string | null;
let capturer: Capturer | null = null;

/** Size of the stored picture: 16:10, enough for a card at 2x. */
export const SNAPSHOT_SIZE = { width: 640, height: 400 } as const;

/** Picture of the hall as it is now, cropped to 16:10, as a data: URL (WebP where the browser can encode it). */
export async function takeHallSnapshot(): Promise<string | null> {
  // Let React apply pending state (e.g. a deselected opening loses its handles) before the frame is drawn.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return capturer?.() ?? null;
}

export function SnapshotProvider() {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    capturer = () => {
      gl.render(scene, camera);
      const source = gl.domElement;
      const { width, height } = SNAPSHOT_SIZE;
      // Crop the middle of the view to 16:10, then scale it down.
      const ratio = width / height;
      const cropW = Math.min(source.width, source.height * ratio);
      const cropH = cropW / ratio;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(source, (source.width - cropW) / 2, (source.height - cropH) / 2, cropW, cropH, 0, 0, width, height);
      const webp = canvas.toDataURL('image/webp', 0.82);
      // Browsers that cannot encode WebP return PNG: use JPEG, which is much smaller.
      return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
    };
    return () => {
      capturer = null;
    };
  }, [gl, scene, camera]);

  return null;
}
