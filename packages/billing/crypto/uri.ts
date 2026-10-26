import { parseUnits } from './amounts';
import { type AssetDef, NETWORKS } from './config';

/**
 * What the pay screen's QR code holds. TRON wallets only reliably read a bare address; EVM wallets
 * read EIP-681 links with the token, chain and exact amount filled in.
 */
export const paymentUri = (asset: AssetDef, toAddress: string, amount: string) => {
  const chainId = NETWORKS[asset.network].chainId;

  if (NETWORKS[asset.network].kind === 'tron' || !chainId) {
    return toAddress;
  }

  return `ethereum:${asset.contract}@${chainId}/transfer?address=${toAddress}&uint256=${parseUnits(amount, asset.decimals)}`;
};
