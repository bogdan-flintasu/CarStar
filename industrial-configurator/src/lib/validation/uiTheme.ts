import { z } from 'zod';
import { HEX_PATTERN } from '@/lib/colors';
import { UI_RADII } from '@/lib/uiTheme';

const hex = z.string().regex(HEX_PATTERN).transform((v) => v.toLowerCase());

/** Body of `PUT /api/admin/theme`: the whole interface theme. */
export const uiThemeSchema = z.strictObject({
  accent: hex,
  accentText: hex,
  surface: hex,
  text: hex,
  background: hex,
  barBackground: hex,
  barText: hex,
  viewport: hex,
  sky: z.boolean(),
  radius: z.enum(UI_RADII),
});
