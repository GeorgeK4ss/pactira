import { formatUnits } from '../amounts';
import type { ChainTransfer, CryptoNetwork } from '../config';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

type RpcEndpoint = { url: string; maxLogRange: number };

/**
 * Free public nodes, each with the widest eth_getLogs block range it accepts (probed Oct 2026:
 * on BNB Chain only publicnode allows 1,000 blocks; 1rpc allows 50; bnbchain's own seeds refuse).
 * An env URL (e.g. an Alchemy or QuickNode key) is tried first when set.
 */
const PUBLIC_RPCS: Record<Exclude<CryptoNetwork, 'tron'>, RpcEndpoint[]> = {
  ethereum: [
    { url: 'https://eth.drpc.org', maxLogRange: 1_000 },
    { url: 'https://1rpc.io/eth', maxLogRange: 1_000 },
    { url: 'https://rpc.flashbots.net', maxLogRange: 1_000 },
  ],
  bsc: [
    { url: 'https://bsc-rpc.publicnode.com', maxLogRange: 1_000 },
    { url: 'https://1rpc.io/bnb', maxLogRange: 50 },
  ],
};

const RPC_ENV: Record<Exclude<CryptoNetwork, 'tron'>, string> = {
  ethereum: 'ETH_RPC_URL',
  bsc: 'BSC_RPC_URL',
};

export type EvmNetwork = Exclude<CryptoNetwork, 'tron'>;

export const isEvmAddress = (address: string) => /^0x[0-9a-fA-F]{40}$/.test(address);

const padAddress = (address: string) => `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
const unpadAddress = (topic: string) => `0x${topic.slice(-40).toLowerCase()}`;

let rpcId = 1;

const rpcOnce = async <T>(url: string, method: string, params: unknown[]) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }

  const json = (await response.json()) as { result?: T; error?: { code: number; message: string } };

  if (json.error) {
    throw new Error(`RPC ${json.error.code}: ${json.error.message}`);
  }

  return json.result as T;
};

const endpoints = (network: EvmNetwork): RpcEndpoint[] => {
  const override = process.env[RPC_ENV[network]];

  return [...(override ? [{ url: override, maxLogRange: 1_000 }] : []), ...PUBLIC_RPCS[network]];
};

const rpc = async <T>(network: EvmNetwork, method: string, params: unknown[]) => {
  let lastError: unknown = null;

  for (const { url } of endpoints(network)) {
    try {
      return await rpcOnce<T>(url, method, params);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All RPC endpoints failed');
};

/** eth_getLogs over a block range, split into the chunk size each node accepts, falling back node by node. */
const getLogs = async (network: EvmNetwork, filter: Record<string, unknown>, fromBlock: bigint, toBlock: bigint) => {
  let lastError: unknown = null;

  for (const { url, maxLogRange } of endpoints(network)) {
    try {
      const logs: EvmLog[] = [];
      const range = BigInt(maxLogRange);

      for (let start = fromBlock; start <= toBlock; start += range) {
        const end = start + range - 1n < toBlock ? start + range - 1n : toBlock;

        logs.push(
          ...(await rpcOnce<EvmLog[]>(url, 'eth_getLogs', [
            { ...filter, fromBlock: `0x${start.toString(16)}`, toBlock: `0x${end.toString(16)}` },
          ])),
        );
      }

      return logs;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All RPC endpoints failed');
};

export const getBlockNumber = async (network: EvmNetwork) => BigInt(await rpc<string>(network, 'eth_blockNumber', []));

type EvmLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  removed?: boolean;
};

/** Decodes an ERC20 Transfer log. */
export const decodeTransferLog = (log: EvmLog, decimals: number) => {
  if (log.removed || !log.topics || log.topics.length < 3 || log.topics[0].toLowerCase() !== TRANSFER_TOPIC) {
    return null;
  }

  return {
    txHash: log.transactionHash.toLowerCase(),
    logIndex: Number(BigInt(log.logIndex)),
    from: unpadAddress(log.topics[1]),
    to: unpadAddress(log.topics[2]),
    amount: formatUnits(BigInt(log.data === '0x' ? '0x0' : log.data), decimals),
    blockNumber: BigInt(log.blockNumber),
  };
};

const blockTimes = async (network: EvmNetwork, blocks: bigint[]) => {
  const times = new Map<bigint, number>();

  for (const block of [...new Set(blocks)]) {
    const result = await rpc<{ timestamp: string } | null>(network, 'eth_getBlockByNumber', [
      `0x${block.toString(16)}`,
      false,
    ]);

    if (result?.timestamp) {
      times.set(block, Number(BigInt(result.timestamp)) * 1000);
    }
  }

  return times;
};

/** Transfers of `contract` into `to` between two blocks (inclusive), chunked for public nodes. */
export const fetchErc20Incoming = async (options: {
  network: EvmNetwork;
  contract: string;
  to: string;
  decimals: number;
  fromBlock: bigint;
  toBlock: bigint;
  tip: bigint;
  confirmations: number;
}) => {
  const found: Omit<ChainTransfer, 'blockTimeMs'>[] = [];

  const logs = await getLogs(
    options.network,
    { address: options.contract, topics: [TRANSFER_TOPIC, null, padAddress(options.to)] },
    options.fromBlock,
    options.toBlock,
  );

  for (const log of logs) {
    const decoded = decodeTransferLog(log, options.decimals);

    if (!decoded) {
      continue;
    }

    found.push({
      ...decoded,
      confirmed: options.tip - decoded.blockNumber >= BigInt(options.confirmations),
    });
  }

  const times = await blockTimes(
    options.network,
    found.map((t) => t.blockNumber).filter((b): b is bigint => b !== null),
  );

  return found.map(
    (transfer): ChainTransfer => ({
      ...transfer,
      blockTimeMs: transfer.blockNumber !== null ? (times.get(transfer.blockNumber) ?? null) : null,
    }),
  );
};

/** The transfer of `contract` into `to` inside one transaction, if it succeeded. */
export const findErc20ByHash = async (options: {
  network: EvmNetwork;
  hash: string;
  contract: string;
  to: string;
  decimals: number;
  confirmations: number;
}) => {
  const receipt = await rpc<{ logs: EvmLog[]; blockNumber: string; status?: string } | null>(
    options.network,
    'eth_getTransactionReceipt',
    [options.hash],
  );

  if (!receipt || receipt.status === '0x0') {
    return null;
  }

  const tip = await getBlockNumber(options.network);

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== options.contract.toLowerCase()) {
      continue;
    }

    const decoded = decodeTransferLog(log, options.decimals);

    if (!decoded || decoded.to !== options.to.toLowerCase()) {
      continue;
    }

    const times = await blockTimes(options.network, [decoded.blockNumber]);

    const transfer: ChainTransfer = {
      ...decoded,
      blockTimeMs: times.get(decoded.blockNumber) ?? null,
      confirmed: tip - decoded.blockNumber >= BigInt(options.confirmations),
    };

    return transfer;
  }

  return null;
};
