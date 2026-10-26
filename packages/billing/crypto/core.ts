import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';
import { BillingInvoiceStatus, type CryptoPaymentRequest, CryptoPaymentStatus, Prisma } from '@prisma/client';

import { markInvoicePaid, processRenewals } from '../invoices';
import { centsToDecimal, toCents, uniqueAmountCents } from './amounts';
import { type EvmNetwork, fetchErc20Incoming, findErc20ByHash, getBlockNumber, isEvmAddress } from './chains/evm';
import { fetchTrc20Incoming, findTrc20ByHash } from './chains/tron';
import {
  type AssetDef,
  type ChainTransfer,
  findAsset,
  NETWORKS,
  TX_HASH_MAX_OVERPAY_CENTS,
  TX_HASH_TOLERANCE_CENTS,
} from './config';
import { getCryptoSettings, payableAssets } from './settings';

const OPEN_STATUSES = [CryptoPaymentStatus.PENDING, CryptoPaymentStatus.SEEN];

/** A transfer older than this before its request was created never pays that request. */
const MATCH_WINDOW_MS = 10 * 60 * 1000;

/** Assets without open requests are still scanned this often, so late payments are recorded. */
const IDLE_SYNC_MS = 30 * 60 * 1000;

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

// ------------------------------------------------------------------------------------------ requests

/**
 * The "send exactly X" request for an invoice and coin. Reuses a live one for the same coin and
 * cancels pending requests for other coins, so one invoice has one amount to look for at a time.
 */
export const createPaymentRequest = async ({
  invoiceId,
  organisationId,
  network,
  asset,
}: {
  invoiceId: string;
  organisationId: string;
  network: string;
  asset: string;
}) => {
  const settings = await getCryptoSettings();
  const payable = payableAssets(settings).find((a) => a.network === network && a.asset === asset);

  if (!payable) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'This payment method is not available.' });
  }

  const invoice = await prisma.billingInvoice.findFirst({ where: { id: invoiceId, organisationId } });

  if (!invoice || invoice.status !== BillingInvoiceStatus.OPEN) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'This invoice can no longer be paid.' });
  }

  const live = await prisma.cryptoPaymentRequest.findFirst({
    where: {
      invoiceId,
      network,
      asset,
      status: { in: OPEN_STATUSES },
      expiresAt: { gt: new Date() },
    },
  });

  if (live) {
    return live;
  }

  await prisma.cryptoPaymentRequest.updateMany({
    where: { invoiceId, status: CryptoPaymentStatus.PENDING },
    data: { status: CryptoPaymentStatus.CANCELLED },
  });

  const expiresAt = new Date(Date.now() + settings.requestTtlHours * 60 * 60 * 1000);

  // The partial unique index on open amounts settles races: on a clash, pick another amount.
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await prisma.cryptoPaymentRequest.findMany({
      where: { network, asset, toAddress: payable.toAddress, status: { in: OPEN_STATUSES } },
      select: { amount: true },
    });

    const amount = uniqueAmountCents(invoice.amountCents, new Set(taken.map((t) => t.amount.toFixed(2))));

    try {
      return await prisma.cryptoPaymentRequest.create({
        data: {
          organisationId,
          invoiceId,
          network,
          asset,
          toAddress: payable.toAddress,
          amount,
          expiresAt,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) {
        throw err;
      }
    }
  }

  throw new AppError(AppErrorCode.UNKNOWN_ERROR, { message: 'Could not reserve a payment amount, try again.' });
};

export const expireStaleRequests = async () => {
  const result = await prisma.cryptoPaymentRequest.updateMany({
    where: { status: CryptoPaymentStatus.PENDING, expiresAt: { lte: new Date() } },
    data: { status: CryptoPaymentStatus.EXPIRED },
  });

  return result.count;
};

// ------------------------------------------------------------------------------------------ chain sync

const storeTransfers = async (asset: AssetDef, transfers: ChainTransfer[]) => {
  for (const transfer of transfers) {
    const data = {
      network: asset.network,
      asset: asset.asset,
      txHash: transfer.txHash,
      logIndex: transfer.logIndex,
      fromAddress: transfer.from,
      toAddress: transfer.to,
      amount: transfer.amount,
      blockNumber: transfer.blockNumber,
      blockTime: transfer.blockTimeMs ? new Date(transfer.blockTimeMs) : null,
      confirmed: transfer.confirmed,
    };

    await prisma.cryptoTransfer.upsert({
      where: {
        network_txHash_logIndex: { network: asset.network, txHash: transfer.txHash, logIndex: transfer.logIndex },
      },
      create: data,
      // Re-scans only ever move a transfer from unconfirmed to confirmed.
      update: transfer.confirmed ? { confirmed: true } : {},
    });
  }
};

/** Reads new transfers for one coin into CryptoTransfer and advances its cursor. */
export const syncAsset = async (asset: AssetDef, toAddress: string) => {
  const key = { network: asset.network, asset: asset.asset, address: toAddress };
  const cursor = await prisma.cryptoWatchCursor.findUnique({ where: { network_asset_address: key } });
  const net = NETWORKS[asset.network];

  try {
    let next: { lastBlock?: bigint; lastTimestampMs?: bigint } = {};
    let transfers: ChainTransfer[];

    if (net.kind === 'tron') {
      const since = cursor?.lastTimestampMs ? Number(cursor.lastTimestampMs) : Date.now() - net.lookback;

      // A minute of overlap: TronGrid can surface a confirmed transfer slightly out of order.
      transfers = await fetchTrc20Incoming({
        address: toAddress,
        contract: asset.contract,
        decimals: asset.decimals,
        minTimestampMs: since - 60_000,
      });

      const newest = transfers.reduce((max, t) => Math.max(max, t.blockTimeMs ?? 0), since);
      next = { lastTimestampMs: BigInt(newest) };
    } else {
      const network = asset.network as EvmNetwork;
      const tip = await getBlockNumber(network);
      const confirmations = BigInt(net.confirmations);

      // Restart below the last fully confirmed block so transfers seen unconfirmed get re-read.
      const fromBlock = cursor?.lastBlock ? cursor.lastBlock - 1n : tip - BigInt(net.lookback);

      transfers = await fetchErc20Incoming({
        network,
        contract: asset.contract,
        to: toAddress,
        decimals: asset.decimals,
        fromBlock,
        toBlock: tip,
        tip,
        confirmations: net.confirmations,
      });

      next = { lastBlock: tip - confirmations > fromBlock ? tip - confirmations : fromBlock };
    }

    await storeTransfers(asset, transfers);

    await prisma.cryptoWatchCursor.upsert({
      where: { network_asset_address: key },
      create: { ...key, ...next, lastError: null, lastSyncAt: new Date() },
      update: { ...next, lastError: null, lastSyncAt: new Date() },
    });

    return { added: transfers.length, error: null };
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);

    await prisma.cryptoWatchCursor.upsert({
      where: { network_asset_address: key },
      create: { ...key, lastError: message, lastSyncAt: new Date() },
      update: { lastError: message, lastSyncAt: new Date() },
    });

    return { added: 0, error: message };
  }
};

// ------------------------------------------------------------------------------------------ matching

/**
 * Links a transfer to a request and moves the request on. Runs in one transaction with the request
 * row locked; `CryptoTransfer.matchedRequestId` is unique, so a transfer can never pay twice.
 */
const linkTransfer = async (requestId: string, transferId: string) => {
  const result = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<CryptoPaymentRequest[]>`
      SELECT * FROM "CryptoPaymentRequest" WHERE "id" = ${requestId} FOR UPDATE
    `;

    if (!locked || locked.status === CryptoPaymentStatus.PAID || locked.status === CryptoPaymentStatus.CANCELLED) {
      return null;
    }

    const transfer = await tx.cryptoTransfer.findUniqueOrThrow({ where: { id: transferId } });

    if (transfer.matchedRequestId && transfer.matchedRequestId !== requestId) {
      return null;
    }

    if (!transfer.matchedRequestId) {
      await tx.cryptoTransfer.update({
        where: { id: transferId },
        data: { matchedRequestId: requestId, matchedAt: new Date() },
      });
    }

    const status = transfer.confirmed ? CryptoPaymentStatus.PAID : CryptoPaymentStatus.SEEN;

    await tx.cryptoPaymentRequest.update({
      where: { id: requestId },
      data: {
        status,
        seenAt: locked.seenAt ?? new Date(),
        paidAt: status === CryptoPaymentStatus.PAID ? new Date() : null,
      },
    });

    return { status, invoiceId: locked.invoiceId };
  });

  if (result?.status === CryptoPaymentStatus.PAID) {
    await markInvoicePaid(result.invoiceId, 'crypto');
  }

  return result;
};

/** Matches open requests of one coin to the transfers seen for it, by exact cents. */
export const matchOpenRequests = async (asset: AssetDef, toAddress: string) => {
  const requests = await prisma.cryptoPaymentRequest.findMany({
    where: { network: asset.network, asset: asset.asset, toAddress, status: { in: OPEN_STATUSES } },
    include: { transfer: true },
  });

  let paid = 0;

  for (const request of requests) {
    // A SEEN request already has its transfer; it is paid once that transfer is confirmed.
    if (request.transfer) {
      if (request.transfer.confirmed) {
        const result = await linkTransfer(request.id, request.transfer.id);
        paid += result?.status === CryptoPaymentStatus.PAID ? 1 : 0;
      }

      continue;
    }

    const wanted = toCents(request.amount.toFixed(2));

    const candidates = await prisma.cryptoTransfer.findMany({
      where: {
        network: asset.network,
        asset: asset.asset,
        toAddress,
        matchedRequestId: null,
        OR: [{ blockTime: null }, { blockTime: { gte: new Date(request.createdAt.getTime() - MATCH_WINDOW_MS) } }],
      },
      orderBy: { createdAt: 'asc' },
    });

    const hit = candidates.find((t) => toCents(t.amount.toFixed(18).replace(/\.?0+$/, '')) === wanted);

    if (hit) {
      const result = await linkTransfer(request.id, hit.id);
      paid += result?.status === CryptoPaymentStatus.PAID ? 1 : 0;
    }
  }

  return paid;
};

export type SubmitTxHashResult =
  | 'paid'
  | 'seen'
  | 'invalid_hash'
  | 'not_found'
  | 'wrong_amount'
  | 'too_early'
  | 'unavailable'
  | 'already_used'
  | 'not_payable';

/**
 * The "I already sent it" path: looks up one transaction by hash and, if it sent at least the
 * asked amount (minus a small allowance for exchange fees) to our address, pays the request.
 */
export const submitTxHash = async ({
  requestId,
  organisationId,
  hash,
}: {
  requestId: string;
  organisationId: string;
  hash: string;
}): Promise<SubmitTxHashResult> => {
  const request = await prisma.cryptoPaymentRequest.findFirst({ where: { id: requestId, organisationId } });

  if (!request || request.status === CryptoPaymentStatus.CANCELLED) {
    return 'not_payable';
  }

  if (request.status === CryptoPaymentStatus.PAID) {
    return 'paid';
  }

  const asset = findAsset(request.network, request.asset);

  if (!asset) {
    return 'not_payable';
  }

  const trimmed = hash.trim();
  const isTron = asset.network === 'tron';
  const valid = isTron ? /^(0x)?[0-9a-fA-F]{64}$/.test(trimmed) : /^0x[0-9a-fA-F]{64}$/.test(trimmed);

  if (!valid) {
    return 'invalid_hash';
  }

  const normalised = isTron ? trimmed.replace(/^0x/, '').toLowerCase() : trimmed.toLowerCase();

  let transfer: ChainTransfer | null;

  // Public chain APIs rate-limit; tell the customer to retry rather than showing a raw error.
  try {
    transfer = isTron
      ? await findTrc20ByHash({
          address: request.toAddress,
          contract: asset.contract,
          decimals: asset.decimals,
          hash: normalised,
        })
      : isEvmAddress(request.toAddress)
        ? await findErc20ByHash({
            network: asset.network as EvmNetwork,
            hash: normalised,
            contract: asset.contract,
            to: request.toAddress,
            decimals: asset.decimals,
            confirmations: NETWORKS[asset.network].confirmations,
          })
        : null;
  } catch (err) {
    console.error('[CRYPTO] Transaction lookup failed', err);

    return 'unavailable';
  }

  if (!transfer) {
    return 'not_found';
  }

  const sentCents = toCents(transfer.amount);
  const dueCents = toCents(request.amount.toFixed(2));

  if (sentCents + TX_HASH_TOLERANCE_CENTS < dueCents || sentCents > dueCents + TX_HASH_MAX_OVERPAY_CENTS) {
    return 'wrong_amount';
  }

  // The amount to send only exists once the request is created, so an earlier transfer is not this payment.
  if (transfer.blockTimeMs !== null && transfer.blockTimeMs < request.createdAt.getTime() - MATCH_WINDOW_MS) {
    return 'too_early';
  }

  await storeTransfers(asset, [transfer]);

  const stored = await prisma.cryptoTransfer.findUniqueOrThrow({
    where: {
      network_txHash_logIndex: { network: asset.network, txHash: transfer.txHash, logIndex: transfer.logIndex },
    },
  });

  if (stored.matchedRequestId && stored.matchedRequestId !== request.id) {
    return 'already_used';
  }

  // An expired request is revived: the customer did pay, just late.
  if (request.status === CryptoPaymentStatus.EXPIRED) {
    await prisma.cryptoPaymentRequest.update({
      where: { id: request.id },
      data: { status: CryptoPaymentStatus.PENDING },
    });
  }

  const result = await linkTransfer(request.id, stored.id);

  if (!result) {
    return 'already_used';
  }

  return result.status === CryptoPaymentStatus.PAID ? 'paid' : 'seen';
};

// ------------------------------------------------------------------------------------------ tick

/** Re-reads the chain for one request's coin right now, e.g. while the customer watches the pay screen. */
export const refreshRequest = async (requestId: string) => {
  const request = await prisma.cryptoPaymentRequest.findUnique({ where: { id: requestId } });

  if (!request || !OPEN_STATUSES.includes(request.status as (typeof OPEN_STATUSES)[number])) {
    return request;
  }

  const asset = findAsset(request.network, request.asset);

  if (asset) {
    await syncAsset(asset, request.toAddress);
    await matchOpenRequests(asset, request.toAddress);
  }

  return prisma.cryptoPaymentRequest.findUnique({ where: { id: requestId } });
};

/** One pass of the payment checker: expiry, chain reads, matching and renewals. */
export const runCryptoTick = async () => {
  const expired = await expireStaleRequests();
  const settings = await getCryptoSettings();
  const synced: Record<string, { added: number; error: string | null } | 'skipped'> = {};
  let paid = 0;

  for (const asset of payableAssets(settings)) {
    const openCount = await prisma.cryptoPaymentRequest.count({
      where: { network: asset.network, asset: asset.asset, toAddress: asset.toAddress, status: { in: OPEN_STATUSES } },
    });

    const cursor = await prisma.cryptoWatchCursor.findUnique({
      where: { network_asset_address: { network: asset.network, asset: asset.asset, address: asset.toAddress } },
    });

    // A failed read is retried on the next tick rather than waiting out the idle interval.
    const idleDue =
      !cursor?.lastSyncAt || Boolean(cursor.lastError) || Date.now() - cursor.lastSyncAt.getTime() > IDLE_SYNC_MS;

    if (openCount === 0 && !idleDue) {
      synced[asset.key] = 'skipped';
      continue;
    }

    synced[asset.key] = await syncAsset(asset, asset.toAddress);
    paid += await matchOpenRequests(asset, asset.toAddress);
  }

  const renewals = await processRenewals();

  return { expired, synced, paid, ...renewals };
};

export const describeAmount = (amount: Prisma.Decimal | string) =>
  centsToDecimal(toCents(typeof amount === 'string' ? amount : amount.toFixed(2)));
