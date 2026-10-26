import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { i18n, type MessageDescriptor } from '@lingui/core';

export const appMetaTags = (title?: MessageDescriptor) => {
  const description =
    'Pactira lets you prepare, send and sign documents online. Fast, secure electronic signatures with templates, teams and a full audit trail.';

  return [
    {
      title: title ? `${i18n._(title)} - Pactira` : 'Pactira',
    },
    {
      name: 'description',
      content: description,
    },
    {
      name: 'keywords',
      content: 'Pactira, electronic signature, e-signature, document signing, sign documents online, templates',
    },
    {
      name: 'author',
      content: 'Pactira',
    },
    {
      name: 'robots',
      content: 'index, follow',
    },
    {
      property: 'og:title',
      content: 'Pactira - Sign documents online',
    },
    {
      property: 'og:description',
      content: description,
    },
    {
      property: 'og:image',
      content: `${NEXT_PUBLIC_WEBAPP_URL()}/opengraph-image.jpg`,
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      name: 'twitter:card',
      content: 'summary_large_image',
    },
    {
      name: 'twitter:description',
      content: description,
    },
    {
      name: 'twitter:image',
      content: `${NEXT_PUBLIC_WEBAPP_URL()}/opengraph-image.jpg`,
    },
  ];
};
