import type { RenderOptions } from '@documenso/email/render';
import { renderWithI18N } from '@documenso/email/render';

import { getI18nInstance } from '../client-only/providers/i18n-server';
import { APP_I18N_OPTIONS, isRtlLanguage, isValidLanguageCode, type SupportedLanguageCodes } from '../constants/i18n';

export const renderEmailWithI18N = async (
  component: React.ReactElement,
  options?: RenderOptions & {
    // eslint-disable-next-line @typescript-eslint/ban-types
    lang?: SupportedLanguageCodes | (string & {});
  },
) => {
  try {
    const { lang: providedLang, ...otherOptions } = options ?? {};

    const lang = isValidLanguageCode(providedLang) ? providedLang : APP_I18N_OPTIONS.sourceLang;

    const i18n = await getI18nInstance(lang);

    i18n.activate(lang);

    const output = await renderWithI18N(component, { i18n, ...otherOptions });

    // Email clients take the reading direction from the document, not from the CSS the
    // templates are built with.
    if (isRtlLanguage(lang) && typeof output === 'string' && !otherOptions.plainText) {
      return output.replace(/<html(?![^>]*\bdir=)/i, `<html dir="rtl" lang="${lang}"`);
    }

    return output;
  } catch (err) {
    console.error(err);
    throw new Error('Failed to render email');
  }
};
