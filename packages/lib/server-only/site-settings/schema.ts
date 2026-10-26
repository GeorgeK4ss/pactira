import { z } from 'zod';

import { ZSiteSettingsBannerSchema } from './schemas/banner';
import { ZSiteSettingsCryptoPaymentsSchema } from './schemas/crypto-payments';
import { ZSiteSettingsEmailBlocklistSchema } from './schemas/email-blocklist';
import { ZSiteSettingsTelemetrySchema } from './schemas/telemetry';

export const ZSiteSettingSchema = z.union([
  ZSiteSettingsBannerSchema,
  ZSiteSettingsCryptoPaymentsSchema,
  ZSiteSettingsEmailBlocklistSchema,
  ZSiteSettingsTelemetrySchema,
]);

export type TSiteSettingSchema = z.infer<typeof ZSiteSettingSchema>;

export const ZSiteSettingsSchema = z.array(ZSiteSettingSchema);

export type TSiteSettingsSchema = z.infer<typeof ZSiteSettingsSchema>;
