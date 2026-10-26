import { findAsset, NETWORKS } from '@documenso/billing/crypto/config';
import { createPaymentRequest, describeAmount, refreshRequest, submitTxHash } from '@documenso/billing/crypto/core';
import { getCryptoSettings, payableAssets } from '@documenso/billing/crypto/settings';
import { paymentUri } from '@documenso/billing/crypto/uri';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';
import type { CryptoPaymentRequest, CryptoTransfer } from '@prisma/client';

import { authenticatedProcedure } from '../../trpc';
import {
  ZCreateCryptoPaymentRequestSchema,
  ZGetCryptoInvoiceRequestSchema,
  ZRefreshCryptoPaymentRequestSchema,
  ZSubmitCryptoTxHashRequestSchema,
} from './crypto-payment.types';
import { findBillingOrganisation } from './shared';

/** Chain reads triggered from the pay screen, at most this often per request. */
const REFRESH_INTERVAL_MS = 15_000;
const lastRefresh = new Map<string, number>();

const toPaymentView = (request: CryptoPaymentRequest & { transfer: CryptoTransfer | null }) => {
  const asset = findAsset(request.network, request.asset);
  const amount = describeAmount(request.amount);
  const network = NETWORKS[request.network as keyof typeof NETWORKS];

  return {
    id: request.id,
    network: request.network,
    networkLabel: network?.label ?? request.network,
    asset: request.asset,
    toAddress: request.toAddress,
    amount,
    status: request.status,
    expiresAt: request.expiresAt,
    uri: asset ? paymentUri(asset, request.toAddress, amount) : request.toAddress,
    txUrl: request.transfer && network ? network.explorerTx(request.transfer.txHash) : null,
    confirmations: network?.confirmations ?? 0,
  };
};

export const getCryptoInvoiceRoute = authenticatedProcedure
  .input(ZGetCryptoInvoiceRequestSchema)
  .query(async ({ ctx, input }) => {
    const { organisationId, invoiceId } = input;

    await findBillingOrganisation({ organisationId, userId: ctx.user.id, access: 'view' });

    const invoice = await prisma.billingInvoice.findFirst({ where: { id: invoiceId, organisationId } });

    if (!invoice) {
      throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Invoice not found' });
    }

    const request = await prisma.cryptoPaymentRequest.findFirst({
      where: { invoiceId, status: { in: ['PENDING', 'SEEN', 'PAID'] } },
      orderBy: { createdAt: 'desc' },
      include: { transfer: true },
    });

    const settings = await getCryptoSettings();

    return {
      invoice: {
        id: invoice.id,
        kind: invoice.kind,
        status: invoice.status,
        interval: invoice.interval,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        extraSeats: invoice.extraSeats,
        amountCents: invoice.amountCents,
      },
      methods: payableAssets(settings).map((asset) => ({
        network: asset.network,
        asset: asset.asset,
        networkLabel: NETWORKS[asset.network].label,
      })),
      payment: request ? toPaymentView(request) : null,
    };
  });

export const createCryptoPaymentRoute = authenticatedProcedure
  .input(ZCreateCryptoPaymentRequestSchema)
  .mutation(async ({ ctx, input }) => {
    const { organisationId, invoiceId, network, asset } = input;

    await findBillingOrganisation({ organisationId, userId: ctx.user.id, access: 'manage' });

    const request = await createPaymentRequest({ invoiceId, organisationId, network, asset });

    const withTransfer = await prisma.cryptoPaymentRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { transfer: true },
    });

    return toPaymentView(withTransfer);
  });

export const refreshCryptoPaymentRoute = authenticatedProcedure
  .input(ZRefreshCryptoPaymentRequestSchema)
  .mutation(async ({ ctx, input }) => {
    const { organisationId, requestId } = input;

    await findBillingOrganisation({ organisationId, userId: ctx.user.id, access: 'view' });

    const owned = await prisma.cryptoPaymentRequest.findFirst({ where: { id: requestId, organisationId } });

    if (!owned) {
      throw new AppError(AppErrorCode.NOT_FOUND);
    }

    const last = lastRefresh.get(requestId) ?? 0;

    if (Date.now() - last >= REFRESH_INTERVAL_MS) {
      lastRefresh.set(requestId, Date.now());
      await refreshRequest(requestId);
    }

    const request = await prisma.cryptoPaymentRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { transfer: true },
    });

    return toPaymentView(request);
  });

export const submitCryptoTxHashRoute = authenticatedProcedure
  .input(ZSubmitCryptoTxHashRequestSchema)
  .mutation(async ({ ctx, input }) => {
    const { organisationId, requestId, hash } = input;

    await findBillingOrganisation({ organisationId, userId: ctx.user.id, access: 'manage' });

    return { result: await submitTxHash({ requestId, organisationId, hash }) };
  });
