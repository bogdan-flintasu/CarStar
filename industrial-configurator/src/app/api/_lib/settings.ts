import prisma from '@/lib/prisma';
import { normalizeUiTheme, type UiTheme } from '@/lib/uiTheme';

const UI_THEME_KEY = 'uiTheme';

/**
 * The configurator's interface theme. Missing row, bad JSON or a database error all give the default theme:
 * the configurator must always render.
 */
export async function getUiTheme(): Promise<UiTheme> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: UI_THEME_KEY } });
    const value = row?.value;
    return normalizeUiTheme(value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
  } catch (error) {
    console.error('Failed to read the UI theme:', error);
    return normalizeUiTheme(null);
  }
}

export async function saveUiTheme(theme: UiTheme): Promise<UiTheme> {
  const value = { ...theme };
  await prisma.appSetting.upsert({ where: { key: UI_THEME_KEY }, create: { key: UI_THEME_KEY, value }, update: { value } });
  return getUiTheme();
}
