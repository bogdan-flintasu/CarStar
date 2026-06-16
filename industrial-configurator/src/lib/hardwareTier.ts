'use client';

/**
 * Hardware-adaptive graphics quality system.
 *
 * Detects the device's GPU, CPU cores, and available memory, then assigns a
 * quality tier (LOW → MEDIUM → HIGH → ULTRA) with concrete rendering
 * parameters (DPR range, shadow-map size, landing-page frame count, etc.).
 *
 * Hard floors and ceilings are enforced:
 *   • MINIMUM (floor): DPR 1.0, shadow 512   → always readable
 *   • MAXIMUM (ceiling): DPR 2.0, shadow 2048 → no wasted GPU cycles
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface GraphicsSettings {
  tier: QualityTier;
  /** Device Pixel Ratio bounds — the renderer should stay within [min, max] */
  dpr: [min: number, max: number];
  /** Shadow map resolution (width = height) */
  shadowMapSize: number;
  /** How many hall frames to clone on the landing page */
  landingFrameCount: number;
  /** Whether to enable the <Environment> IBL probe (heavy on mobile) */
  enableEnvironment: boolean;
  /** Whether to use the <Sky> component */
  enableSky: boolean;
  /** Whether the device is considered mobile */
  isMobile: boolean;
}

// ── Hard limits ───────────────────────────────────────────────────────────────
const MIN_DPR = 1.0;
const MAX_DPR = 2.0;
const MIN_SHADOW = 512;
const MAX_SHADOW = 2048;

// ── GPU blacklist patterns (known weak integrated GPUs) ───────────────────────
const WEAK_GPU_PATTERNS = [
  /mali-4/i, /mali-t6/i, /mali-t7/i,
  /adreno.*[23]\d\d/i,           // Adreno 2xx / 3xx
  /powervr sgx/i,
  /intel.*hd.*[234]\d{3}/i,      // Intel HD 2000-4000
  /apple gpu/i,                   // Generic Apple (A9 and below report this)
  /swiftshader/i,                 // Software renderer
];

const MID_GPU_PATTERNS = [
  /adreno.*[45]\d\d/i,            // Adreno 4xx / 5xx
  /mali-g[57]\d/i,                // Mali-G5x, G7x
  /intel.*iris/i,
  /intel.*uhd/i,
];

// ── Detection ─────────────────────────────────────────────────────────────────

function getGpuRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 'unknown';

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
    }
    return gl.getParameter(gl.RENDERER) as string;
  } catch {
    return 'unknown';
  }
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function scoreCpu(): number {
  const cores = navigator.hardwareConcurrency || 2;
  if (cores >= 8) return 3;  // high-end desktop / flagship phone
  if (cores >= 4) return 2;  // mid-range
  return 1;                   // low-end
}

function scoreMemory(): number {
  const mem = (navigator as any).deviceMemory as number | undefined;
  if (!mem) return 2;         // unknown → assume mid-range
  if (mem >= 8) return 3;
  if (mem >= 4) return 2;
  return 1;
}

function scoreGpu(renderer: string): number {
  if (WEAK_GPU_PATTERNS.some((p) => p.test(renderer))) return 1;
  if (MID_GPU_PATTERNS.some((p) => p.test(renderer))) return 2;
  return 3; // desktop discrete GPU or modern flagship
}

// ── Public API ────────────────────────────────────────────────────────────────

let _cached: GraphicsSettings | null = null;

/**
 * Detect hardware once and return concrete graphics settings.
 * Safe to call on every render — result is cached.
 */
export function getGraphicsSettings(): GraphicsSettings {
  if (_cached) return _cached;

  // SSR fallback
  if (typeof window === 'undefined') {
    _cached = {
      tier: 'high',
      dpr: [1.5, 2.0],
      shadowMapSize: 2048,
      landingFrameCount: 6,
      enableEnvironment: true,
      enableSky: true,
      isMobile: false,
    };
    return _cached;
  }

  const mobile = isMobileDevice();
  const renderer = getGpuRenderer();
  const cpuScore = scoreCpu();
  const memScore = scoreMemory();
  const gpuScore = scoreGpu(renderer);

  // Weighted composite: GPU matters most, then CPU, then memory
  const composite = gpuScore * 3 + cpuScore * 2 + memScore;
  // Range: min=6 (all 1s), max=18 (all 3s)

  let tier: QualityTier;
  if (mobile) {
    // Mobile scoring — more conservative
    if (composite >= 15) tier = 'high';
    else if (composite >= 11) tier = 'medium';
    else tier = 'low';
  } else {
    // Desktop scoring
    if (composite >= 16) tier = 'ultra';
    else if (composite >= 12) tier = 'high';
    else if (composite >= 9) tier = 'medium';
    else tier = 'low';
  }

  const settings: Record<QualityTier, Omit<GraphicsSettings, 'tier' | 'isMobile'>> = {
    low: {
      dpr: [MIN_DPR, 1.25],
      shadowMapSize: MIN_SHADOW,
      landingFrameCount: 3,
      enableEnvironment: false,
      enableSky: true,
    },
    medium: {
      dpr: [1.25, 1.5],
      shadowMapSize: 1024,
      landingFrameCount: 4,
      enableEnvironment: true,
      enableSky: true,
    },
    high: {
      dpr: [1.5, MAX_DPR],
      shadowMapSize: MAX_SHADOW,
      landingFrameCount: 6,
      enableEnvironment: true,
      enableSky: true,
    },
    ultra: {
      dpr: [MAX_DPR, MAX_DPR],
      shadowMapSize: MAX_SHADOW,
      landingFrameCount: 6,
      enableEnvironment: true,
      enableSky: true,
    },
  };

  _cached = { tier, isMobile: mobile, ...settings[tier] };

  if (process.env.NODE_ENV === 'development') {
    console.log(
      `[HardwareTier] GPU="${renderer}" CPU=${cpuScore} MEM=${memScore} GPU=${gpuScore} → composite=${composite} tier=${tier} mobile=${mobile}`,
    );
  }

  return _cached;
}
