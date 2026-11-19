import UiThemeScope from '@/components/configurator/UiThemeScope';
import ConfiguratorApp from '@/components/configurator/ConfiguratorApp';
import { getUiTheme } from '@/app/api/_lib/settings';
import { brandLogoUrl, getActiveBranding } from '@/lib/branding';

// The admin's interface theme is read on every request, so a saved change shows on the next visit (and without a flash).
export const dynamic = 'force-dynamic';

export default async function ConfiguratorPage() {
  const [theme, branding] = await Promise.all([getUiTheme(), getActiveBranding()]);
  return (
    <UiThemeScope theme={theme} brand={{ name: branding.name, logoUrl: brandLogoUrl(branding) }}>
      <ConfiguratorApp />
    </UiThemeScope>
  );
}
