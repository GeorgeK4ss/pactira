import { useLingui } from '@lingui/react';
import { GlobeIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../primitives/button';
import { switchLanguage } from './language-switcher-dialog';

/** A one-click switch between English and Hebrew, for pages people see before signing in. */
export const LanguageToggle = () => {
  const { i18n } = useLingui();

  const [isSwitching, setIsSwitching] = useState(false);

  const isHebrew = i18n.locale === 'he';

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={isSwitching}
      onClick={async () => {
        setIsSwitching(true);
        await switchLanguage(isHebrew ? 'en' : 'he');
      }}
    >
      {!isSwitching && <GlobeIcon className="me-2 h-4 w-4" />}
      {isHebrew ? 'English' : 'עברית'}
    </Button>
  );
};
