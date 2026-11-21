/**
 * JSX typing of the `<model-viewer>` custom element (@google/model-viewer), used only by the AR page
 * (src/app/configuration/[token]/ar). Only the attributes we set are listed.
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

interface ModelViewerAttributes extends HTMLAttributes<HTMLElement> {
  src?: string;
  'ios-src'?: string;
  poster?: string;
  alt?: string;
  ar?: boolean | '';
  'ar-modes'?: string;
  'ar-scale'?: 'auto' | 'fixed';
  'ar-placement'?: 'floor' | 'wall';
  'camera-controls'?: boolean | '';
  'auto-rotate'?: boolean | '';
  'touch-action'?: string;
  'shadow-intensity'?: string;
  'environment-image'?: string;
  exposure?: string;
  loading?: 'auto' | 'lazy' | 'eager';
  reveal?: 'auto' | 'manual';
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<ModelViewerAttributes, HTMLElement>;
    }
  }
}
