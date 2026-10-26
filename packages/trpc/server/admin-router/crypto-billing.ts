import { runCryptoTick } from '@documenso/billing/crypto/core';
import { getCryptoSettings } from '@documenso/billing/crypto/settings';
import { getOrCreateRenewalInvoice, markInvoicePaid } from '@documenso/billing/invoices';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import {
  SITE_SETTINGS_CRYPTO_PAYMENTS_ID,
  ZSiteSettingsCryptoPaymentsSchema,
} from '@documenso/lib/server-only/site-settings/schemas/crypto-payments';
import { prisma } from '@documenso/prisma';

import { adminProcedure } from '../trpc';
import { ZCreateAdminCryptoInvoiceRequestSchema, ZMarkCryptoInvoicePaidRequestSchema } from './crypto-billing.types';

export const getAdminCryptoBillingRoute = adminProcedure.query(async () => {
  const [row, effective, cursors, requests, transfers, openInvoices] = await Promise.all([
    prisma.siteSettings.findFirst({ where: { id: SITE_SETTINGS_CRYPTO_PAYMENTS_ID } }),
    getCryptoSettings(),
    prisma.cryptoWatchCursor.findMany({ orderBy: [{ network: 'asc' }, { asset: 'asc' }] }),
    prisma.cryptoPaymentRequest.findMany({
      where: { status: { in: ['PENDING', 'SEEN'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { organisation: { select: { name: true, url: true } } },
    }),
    prisma.cryptoTransfer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { matchedRequest: { select: { invoiceId: true, organisation: { select: { name: true } } } } },
    }),
    prisma.billingInvoice.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { organisation: { select: { name: true, url: true } } },
    }),
  ]);

  const parsed = row ? ZSiteSettingsCryptoPaymentsSchema.safeParse(row) : null;

  return {
    setting: parsed?.success ? parsed.data : null,
    // Addresses that failed validation come back null here, so the page can flag them.
    validAddresses: effective.addresses,
    cursors: cursors.map((c) => ({
      network: c.network,
      asset: c.asset,
      address: c.address,
      lastSyncAt: c.lastSyncAt,
      lastError: c.lastError,
    })),
    requests: requests.map((r) => ({
      id: r.id,
      organisation: r.organisation.name,
      network: r.network,
      asset: r.asset,
      amount: r.amount.toFixed(2),
      status: r.status,
      expiresAt: r.expiresAt,
      invoiceId: r.invoiceId,
    })),
    transfers: transfers.map((t) => ({
      id: t.id,
      network: t.network,
      asset: t.asset,
      txHash: t.txHash,
      fromAddress: t.fromAddress,
      amount: t.amount.toFixed(6).replace(/\.?0+$/, ''),
      blockTime: t.blockTime,
      confirmed: t.confirmed,
      matchedTo: t.matchedRequest ? t.matchedRequest.organisation.name : null,
    })),
    openInvoices: openInvoices.map((i) => ({
      id: i.id,
      organisation: i.organisation.name,
      kind: i.kind,
      interval: i.interval,
      amountCents: i.amountCents,
      createdAt: i.createdAt,
    })),
  };
});

export const markCryptoInvoicePaidRoute = adminProcedure
  .input(ZMarkCryptoInvoicePaidRequestSchema)
  .mutation(async ({ ctx, input }) => {
    const { invoiceId } = input;

    ctx.logger.info({ input: { invoiceId } });

    const invoice = await prisma.billingInvoice.findUnique({ where: { id: invoiceId } });

    if (!invoice || invoice.status !== 'OPEN') {
      throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'Only open invoices can be marked paid' });
    }

    await markInvoicePaid(invoiceId, 'manual');
  });

export const createAdminCryptoInvoiceRoute = adminProcedure
  .input(ZCreateAdminCryptoInvoiceRequestSchema)
  .mutation(async ({ ctx, input }) => {
    const { organisationId, interval, amountCents } = input;

    ctx.logger.info({ input: { organisationId, interval, amountCents } });

    const invoice = await getOrCreateRenewalInvoice({ organisationId, interval });

    if (amountCents !== undefined && amountCents !== invoice.amountCents) {
      await prisma.billingInvoice.update({ where: { id: invoice.id }, data: { amountCents } });
    }

    return { invoiceId: invoice.id };
  });

export const runCryptoTickRoute = adminProcedure.mutation(async () => {
  const result = await runCryptoTick();

  return JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
});
