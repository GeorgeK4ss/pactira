export type CryptoNetwork = 'tron' | 'ethereum' | 'bsc';
export type CryptoAsset = 'USDT' | 'USDC';

export type NetworkDef = {
  network: CryptoNetwork;
  label: string;
  kind: 'tron' | 'evm';
  /** EVM chain id, used in payment links. */
  chainId?: number;
  /** Blocks on top of a transfer before it counts as final (EVM only; TRON uses TronGrid's confirmed flag). */
  confirmations: number;
  /** How far back a fresh cursor starts scanning, in blocks (EVM) or milliseconds (TRON). */
  lookback: number;
  explorerTx: (hash: string) => string;
  explorerAddress: (address: string) => string;
};

export const NETWORKS: Record<CryptoNetwork, NetworkDef> = {
  tron: {
    network: 'tron',
    label: 'TRON (TRC20)',
    kind: 'tron',
    confirmations: 0,
    lookback: 24 * 60 * 60 * 1000,
    explorerTx: (hash) => `https://tronscan.org/#/transaction/${hash}`,
    explorerAddress: (address) => `https://tronscan.org/#/address/${address}`,
  },
  ethereum: {
    network: 'ethereum',
    label: 'Ethereum (ERC20)',
    kind: 'evm',
    chainId: 1,
    confirmations: 12,
    // ~5 hours at 12 s per block.
    lookback: 1_500,
    explorerTx: (hash) => `https://etherscan.io/tx/${hash}`,
    explorerAddress: (address) => `https://etherscan.io/address/${address}`,
  },
  bsc: {
    network: 'bsc',
    label: 'BNB Chain (BEP20)',
    kind: 'evm',
    chainId: 56,
    confirmations: 15,
    // ~4 hours at ~0.75 s per block.
    lookback: 20_000,
    explorerTx: (hash) => `https://bscscan.com/tx/${hash}`,
    explorerAddress: (address) => `https://bscscan.com/address/${address}`,
  },
};

export type AssetDef = {
  key: string;
  network: CryptoNetwork;
  asset: CryptoAsset;
  contract: string;
  decimals: number;
};

export const ASSETS: AssetDef[] = [
  { key: 'tron:USDT', network: 'tron', asset: 'USDT', contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },
  {
    key: 'ethereum:USDT',
    network: 'ethereum',
    asset: 'USDT',
    contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
  },
  {
    key: 'ethereum:USDC',
    network: 'ethereum',
    asset: 'USDC',
    contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
  },
  // USDT on BNB Chain has 18 decimals, unlike the other two.
  {
    key: 'bsc:USDT',
    network: 'bsc',
    asset: 'USDT',
    contract: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18,
  },
];

export const findAsset = (network: string, asset: string) =>
  ASSETS.find((a) => a.network === network && a.asset === asset) ?? null;

/** A token transfer as read from the chain. `amount` is an exact decimal string. */
export type ChainTransfer = {
  txHash: string;
  logIndex: number;
  from: string;
  to: string;
  amount: string;
  blockNumber: bigint | null;
  blockTimeMs: number | null;
  confirmed: boolean;
};

/** How long a "send exactly X" request stays open. */
export const DEFAULT_REQUEST_TTL_HOURS = 24;

/** On the "I already sent it" path, accept up to this much below the asked amount (exchange withdrawal fees). */
export const TX_HASH_TOLERANCE_CENTS = 50n;
