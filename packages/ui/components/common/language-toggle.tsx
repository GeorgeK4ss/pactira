import { useLingui } from '@lingui/react';
import { GlobeIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../primitives/button';
import { LanguageSwitcherDialog, NATIVE_LANGUAGE_NAMES } from './language-switcher-dialog';

/** Shows the current language and opens the full list, for pages people see before signing in. */
export const LanguageToggle = () => {
  const { i18n } = useLingui();

  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <GlobeIcon className="me-2 h-4 w-4" />
        {NATIVE_LANGUAGE_NAMES[i18n.locale] ?? i18n.locale}
      </Button>

      <LanguageSwitcherDialog open={open} setOpen={setOpen} />
    </>
  );
};
