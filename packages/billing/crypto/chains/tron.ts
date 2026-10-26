import { createHash } from 'node:crypto';

import { formatUnits } from '../amounts';
import type { ChainTransfer } from '../config';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const TRONGRID_URL = 'https://api.trongrid.io';

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest();

const base58Decode = (value: string) => {
  let n = 0n;

  for (const char of value) {
    const index = ALPHABET.indexOf(char);

    if (index < 0) {
      return null;
    }

    n = n * 58n + BigInt(index);
  }

  const bytes: number[] = [];

  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }

  for (const char of value) {
    if (char !== '1') {
      break;
    }

    bytes.unshift(0);
  }

  return Uint8Array.from(bytes);
};

const base58Encode = (bytes: Uint8Array) => {
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let out = '';

  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }

  for (const byte of bytes) {
    if (byte !== 0) {
      break;
    }

    out = `1${out}`;
  }

  return out;
};

/** TRON base58check address: 0x41 + 20 bytes, then a 4-byte double-SHA256 checksum. */
export const isTronAddress = (address: string) => {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
    return false;
  }

  const raw = base58Decode(address);

  if (!raw || raw.length !== 25 || raw[0] !== 0x41) {
    return false;
  }

  const checksum = sha256(sha256(raw.subarray(0, 21))).subarray(0, 4);

  return Buffer.compare(Buffer.from(raw.subarray(21)), checksum) === 0;
};

/** 20-byte hex (as TronGrid events report it) → base58 address. */
export const tronHexToAddress = (hex: string) => {
  const body = hex.toLowerCase().replace(/^0x/, '').replace(/^41/, '');
  const payload = Buffer.from(`41${body.padStart(40, '0')}`, 'hex');

  return base58Encode(Buffer.concat([payload, sha256(sha256(payload)).subarray(0, 4)]));
};

const tronAddressToHex20 = (address: string) => {
  const raw = base58Decode(address);

  return raw && raw.length === 25 ? Buffer.from(raw.subarray(1, 21)).toString('hex') : null;
};

const tronGet = async (path: string) => {
  const headers: Record<string, string> = { accept: 'application/json' };
  const apiKey = process.env.TRONGRID_API_KEY;

  if (apiKey) {
    headers['TRON-PRO-API-KEY'] = apiKey;
  }

  const response = await fetch(`${TRONGRID_URL}${path}`, { headers, signal: AbortSignal.timeout(20_000) });

  if (!response.ok) {
    throw new Error(`TronGrid HTTP ${response.status}`);
  }

  return response.json();
};

type TronGridTrc20 = {
  transaction_id: string;
  token_info?: { address?: string; decimals?: number };
  block_timestamp: number;
  from: string;
  to: string;
  type?: string;
  value: string;
};

/**
 * Confirmed TRC20 transfers of `contract` into `address` since `minTimestampMs`, oldest first.
 *
 * TronGrid's account history does not give the event index, so TRON transfers use logIndex 0 on
 * this path and on the tx-hash path alike; that keeps (txHash, logIndex) one row per payment.
 */
export const fetchTrc20Incoming = async (options: {
  address: string;
  contract: string;
  decimals: number;
  minTimestampMs: number;
}) => {
  const transfers: ChainTransfer[] = [];
  let fingerprint: string | null = null;

  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({
      only_to: 'true',
      only_confirmed: 'true',
      contract_address: options.contract,
      min_timestamp: String(Math.max(0, options.minTimestampMs)),
      limit: '200',
      order_by: 'block_timestamp,asc',
    });

    if (fingerprint) {
      query.set('fingerprint', fingerprint);
    }

    const json = (await tronGet(`/v1/accounts/${options.address}/transactions/trc20?${query}`)) as {
      data?: TronGridTrc20[];
      meta?: { fingerprint?: string };
    };

    for (const row of json.data ?? []) {
      if ((row.type && row.type !== 'Transfer') || !row.value || row.to !== options.address) {
        continue;
      }

      if (row.token_info?.address && row.token_info.address !== options.contract) {
        continue;
      }

      transfers.push({
        txHash: row.transaction_id.toLowerCase(),
        logIndex: 0,
        from: row.from,
        to: row.to,
        amount: formatUnits(BigInt(row.value), options.decimals),
        blockNumber: null,
        blockTimeMs: row.block_timestamp,
        confirmed: true,
      });
    }

    fingerprint = json.meta?.fingerprint ?? null;

    if (!fingerprint) {
      break;
    }
  }

  return transfers;
};

type TronGridEvent = {
  block_number?: number;
  block_timestamp?: number;
  contract_address: string;
  event_name: string;
  result?: { from?: string; to?: string; value?: string };
  transaction_id: string;
};

/** The confirmed transfer of `contract` into `address` inside one transaction, if any. */
export const findTrc20ByHash = async (options: {
  address: string;
  contract: string;
  decimals: number;
  hash: string;
}) => {
  const me = tronAddressToHex20(options.address)?.toLowerCase();

  if (!me) {
    return null;
  }

  const json = (await tronGet(`/v1/transactions/${options.hash.toLowerCase()}/events?only_confirmed=true`)) as {
    data?: TronGridEvent[];
  };

  for (const event of json.data ?? []) {
    if (event.contract_address !== options.contract || event.event_name !== 'Transfer') {
      continue;
    }

    if (!event.result?.to || !event.result.value) {
      continue;
    }

    if (event.result.to.toLowerCase().replace(/^0x/, '').replace(/^41/, '') !== me) {
      continue;
    }

    const transfer: ChainTransfer = {
      txHash: event.transaction_id.toLowerCase(),
      logIndex: 0,
      from: event.result.from ? tronHexToAddress(event.result.from) : '',
      to: options.address,
      amount: formatUnits(BigInt(event.result.value), options.decimals),
      blockNumber: event.block_number !== undefined ? BigInt(event.block_number) : null,
      blockTimeMs: event.block_timestamp ?? null,
      confirmed: true,
    };

    return transfer;
  }

  return null;
};
