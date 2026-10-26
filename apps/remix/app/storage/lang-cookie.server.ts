import { shouldUseSecureCookies } from '@documenso/lib/constants/auth';
import { createCookie } from 'react-router';

// Renamed from 'lang' so cookies saved before Hebrew became the default (the loader writes the
// cookie on every visit) do not pin earlier visitors to English.
export const langCookie = createCookie('pactira_lang', {
  path: '/',
  maxAge: 60 * 60 * 24 * 365 * 2,
  httpOnly: true,
  secure: shouldUseSecureCookies(),
});
