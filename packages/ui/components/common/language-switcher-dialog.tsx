import { formatPath } from '@documenso/lib/constants/app';
import { SUPPORTED_LANGUAGES } from '@documenso/lib/constants/i18n';
import { dynamicActivate } from '@documenso/lib/utils/i18n';
import { cn } from '@documenso/ui/lib/utils';
import { CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList } from '@documenso/ui/primitives/command';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { CheckIcon } from 'lucide-react';

/**
 * Saves the language and reloads, so the page direction (right-to-left for Hebrew) and the
 * server-rendered parts follow the new language too.
 */
export const switchLanguage = async (lang: string) => {
  await dynamicActivate(lang);

  const formData = new FormData();

  formData.append('lang', lang);

  await fetch(formatPath('/api/locale'), {
    method: 'post',
    body: formData,
  });

  window.location.reload();
};

/** Each language in its own name, so people can find theirs whatever the page language is. */
export const NATIVE_LANGUAGE_NAMES: Record<string, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  es: 'Español',
  he: 'עברית',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  'pt-BR': 'Português (Brasil)',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
};

type LanguageSwitcherDialogProps = {
  open: boolean;
  setOpen: (_open: boolean) => void;
};

export const LanguageSwitcherDialog = ({ open, setOpen }: LanguageSwitcherDialogProps) => {
  const { i18n, _ } = useLingui();

  const setLanguage = async (lang: string) => {
    setOpen(false);

    await switchLanguage(lang);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={_(msg`Search languages...`)} />

      <CommandList>
        <CommandGroup>
          {Object.values(SUPPORTED_LANGUAGES).map((language) => (
            <CommandItem
              key={language.short}
              value={`${NATIVE_LANGUAGE_NAMES[language.short] ?? ''} ${_(language.full)}`}
              onSelect={async () => setLanguage(language.short)}
            >
              <CheckIcon className={cn('me-2 h-4 w-4', i18n.locale === language.short ? 'opacity-100' : 'opacity-0')} />
              <span dir="auto">{NATIVE_LANGUAGE_NAMES[language.short] ?? _(language.full)}</span>
              {NATIVE_LANGUAGE_NAMES[language.short] && NATIVE_LANGUAGE_NAMES[language.short] !== _(language.full) && (
                <span className="ms-2 text-muted-foreground text-xs">{_(language.full)}</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
