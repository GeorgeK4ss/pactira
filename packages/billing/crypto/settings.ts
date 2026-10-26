import {
  SITE_SETTINGS_CRYPTO_PAYMENTS_ID,
  ZSiteSettingsCryptoPaymentsSchema,
} from '@documenso/lib/server-only/site-settings/schemas/crypto-payments';
import { prisma } from '@documenso/prisma';

import { isEvmAddress } from './chains/evm';
import { isTronAddress } from './chains/tron';
import { ASSETS, type AssetDef, type CryptoNetwork, DEFAULT_REQUEST_TTL_HOURS } from './config';

export type CryptoSettings = {
  enabled: boolean;
  addresses: Record<CryptoNetwork, string | null>;
  assets: Record<string, boolean>;
  requestTtlHours: number;
};

const isValidAddress = (network: CryptoNetwork, address: string) =>
  network === 'tron' ? isTronAddress(address) : isEvmAddress(address);

/** EVM addresses are stored lower-case so they compare equal to what the chain reports. */
export const normaliseAddress = (network: CryptoNetwork, address: string) =>
  network === 'tron' ? address : address.toLowerCase();

export const getCryptoSettings = async (): Promise<CryptoSettings> => {
  const row = await prisma.siteSettings.findFirst({ where: { id: SITE_SETTINGS_CRYPTO_PAYMENTS_ID } });
  const parsed = row ? ZSiteSettingsCryptoPaymentsSchema.safeParse(row) : null;

  if (!parsed?.success) {
    return {
      enabled: false,
      addresses: { tron: null, ethereum: null, bsc: null },
      assets: {},
      requestTtlHours: DEFAULT_REQUEST_TTL_HOURS,
    };
  }

  const { enabled, data } = parsed.data;

  const address = (network: CryptoNetwork) => {
    const value = data.addresses[network];

    return value && isValidAddress(network, value) ? normaliseAddress(network, value) : null;
  };

  return {
    enabled,
    addresses: { tron: address('tron'), ethereum: address('ethereum'), bsc: address('bsc') },
    assets: data.assets,
    requestTtlHours: data.requestTtlHours,
  };
};

/** Coins a customer can pay with right now: enabled, ticked, and with a valid receiving address. */
export const payableAssets = (settings: CryptoSettings): (AssetDef & { toAddress: string })[] => {
  if (!settings.enabled) {
    return [];
  }

  return ASSETS.flatMap((asset) => {
    const toAddress = settings.addresses[asset.network];

    // An asset counts as ticked unless the admin explicitly turned it off.
    if (!toAddress || settings.assets[asset.key] === false) {
      return [];
    }

    return [{ ...asset, toAddress }];
  });
};
