'use client';

/**
 * Applies the admin's interface theme to everything inside it (see src/lib/uiTheme.ts and `.cfg-theme` in globals.css)
 * and shares the values that are not CSS, such as whether the 3D view draws a sky.
 */
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_UI_THEME, uiThemeStyle, type UiTheme } from '@/lib/uiTheme';

/** Who the configurator is for: the company name and the URL of its logo (null: show the name). */
export interface ScopeBrand {
  name: string;
  logoUrl: string | null;
}

const DEFAULT_SCOPE_BRAND: ScopeBrand = { name: '', logoUrl: null };

const UiThemeContext = createContext<UiTheme>(DEFAULT_UI_THEME);
const BrandContext = createContext<ScopeBrand>(DEFAULT_SCOPE_BRAND);

export function useUiTheme(): UiTheme {
  return useContext(UiThemeContext);
}

/** The company name and logo of the page (for the header). */
export function useBrand(): ScopeBrand {
  return useContext(BrandContext);
}

/** The current accent colour as #rrggbb, for things drawn outside CSS (the 3D accents). */
export function useAccentColor(): string {
  return useContext(UiThemeContext).accent;
}

export default function UiThemeScope({
  theme,
  brand = DEFAULT_SCOPE_BRAND,
  className = '',
  children,
}: {
  theme: UiTheme;
  brand?: ScopeBrand;
  className?: string;
  children: ReactNode;
}) {
  return (
    <UiThemeContext.Provider value={theme}>
      <BrandContext.Provider value={brand}>
        <div className={`cfg-theme ${className}`} style={uiThemeStyle(theme) as CSSProperties}>
          {children}
        </div>
      </BrandContext.Provider>
    </UiThemeContext.Provider>
  );
}
