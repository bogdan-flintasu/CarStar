import UiThemeScope from '@/components/configurator/UiThemeScope';
import ConfiguratorApp from '@/components/configurator/ConfiguratorApp';
import { getUiTheme } from '@/app/api/_lib/settings';

// The admin's interface theme is read on every request, so a saved change shows on the next visit (and without a flash).
export const dynamic = 'force-dynamic';

export default async function ConfiguratorPage() {
  const theme = await getUiTheme();
  return (
    <UiThemeScope theme={theme}>
      <ConfiguratorApp />
    </UiThemeScope>
  );
}
