import { z } from 'zod';

import { ZSiteSettingsBaseSchema } from './_base';

export const SITE_SETTINGS_CRYPTO_PAYMENTS_ID = 'billing.crypto-payments';

const ZAddress = z.string().trim().default('');

export const ZSiteSettingsCryptoPaymentsSchema = ZSiteSettingsBaseSchema.extend({
  id: z.literal(SITE_SETTINGS_CRYPTO_PAYMENTS_ID),
  data: z
    .object({
      /** Public receiving addresses. Private keys never touch the server. */
      addresses: z
        .object({
          tron: ZAddress,
          ethereum: ZAddress,
          bsc: ZAddress,
        })
        .default({ tron: '', ethereum: '', bsc: '' }),
      /** Which coins customers may pay with, keyed "network:asset". */
      assets: z.record(z.string(), z.boolean()).default({}),
      requestTtlHours: z.number().int().min(1).max(168).default(24),
    })
    .optional()
    .default({
      addresses: { tron: '', ethereum: '', bsc: '' },
      assets: {},
      requestTtlHours: 24,
    }),
});

export type TSiteSettingsCryptoPaymentsSchema = z.infer<typeof ZSiteSettingsCryptoPaymentsSchema>;
