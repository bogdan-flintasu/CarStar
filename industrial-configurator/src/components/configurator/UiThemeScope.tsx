'use client';

/**
 * Applies the admin's interface theme to everything inside it (see src/lib/uiTheme.ts and `.cfg-theme` in globals.css)
 * and shares the values that are not CSS, such as whether the 3D view draws a sky.
 */
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_UI_THEME, uiThemeStyle, type UiTheme } from '@/lib/uiTheme';

const UiThemeContext = createContext<UiTheme>(DEFAULT_UI_THEME);

export function useUiTheme(): UiTheme {
  return useContext(UiThemeContext);
}

export default function UiThemeScope({
  theme,
  className = '',
  children,
}: {
  theme: UiTheme;
  className?: string;
  children: ReactNode;
}) {
  return (
    <UiThemeContext.Provider value={theme}>
      <div className={`cfg-theme ${className}`} style={uiThemeStyle(theme) as CSSProperties}>
        {children}
      </div>
    </UiThemeContext.Provider>
  );
}
