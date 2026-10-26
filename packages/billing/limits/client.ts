import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';

import { ZLimitsResponseSchema } from './schema';

export type GetLimitsOptions = {
  headers?: Record<string, string>;
  teamId: number;
};

export const getLimits = async ({ headers, teamId }: GetLimitsOptions) => {
  const requestHeaders = headers ?? {};

  // In the browser, call the page's own origin: the configured web app URL can be another domain
  // pointing at the same app, and a cross-origin call would go without the session cookie.
  // The path is appended rather than passed as the `new URL()` path argument, since a
  // leading-slash path replaces the sub-path that NEXT_PUBLIC_WEBAPP_URL may carry.
  const webappUrl = new URL(NEXT_PUBLIC_WEBAPP_URL());
  const basePath = webappUrl.pathname.replace(/\/$/, '');

  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}${basePath}/api/limits`
      : `${webappUrl.origin}${basePath}/api/limits`;

  if (teamId) {
    requestHeaders['team-id'] = teamId.toString();
  }

  // Failures are thrown, not turned into free-plan limits: a failed check must never unlock uploads.
  const res = await fetch(url, {
    headers: {
      ...requestHeaders,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load limits (${res.status})`);
  }

  return ZLimitsResponseSchema.parse(await res.json());
};
