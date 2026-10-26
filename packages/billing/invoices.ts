import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { createOrganisationClaimUpsertData } from '@documenso/lib/server-only/organisation/create-organisation';
import { getSubscriptionClaim } from '@documenso/lib/server-only/subscription/get-subscription-claim';
import { INTERNAL_CLAIM_ID } from '@documenso/lib/types/subscription';
import { prisma } from '@documenso/prisma';
import {
  type BillingInterval,
  BillingInvoiceKind,
  BillingInvoiceStatus,
  CryptoPaymentStatus,
  type Prisma,
  SubscriptionStatus,
} from '@prisma/client';

import {
  addInterval,
  intervalStartBefore,
  nextPeriodStart,
  proratedSeatsCents,
  renewalAmountCents,
  seatCap,
} from './plan';

export const CRYPTO_PROVIDER = 'crypto';

/** Paid organisations get the Teams plan's features; their seat cap comes from the plan instead. */
const PAID_CLAIM_ID = INTERNAL_CLAIM_ID.TEAM;

/** Days before the period ends that the next renewal invoice is created. */
export const RENEWAL_LEAD_DAYS = 7;

const syntheticIds = (organisationId: string) => ({
  planId: `crypto_${organisationId}`,
  customerId: `crypto_${organisationId}`,
});

export const getCryptoSubscription = async (organisationId: string) =>
  prisma.subscription.findFirst({ where: { organisationId, provider: CRYPTO_PROVIDER } });

/**
 * The open renewal invoice for the organisation, for the chosen interval. An open invoice for the
 * other interval is voided, so only one renewal is ever payable at a time.
 */
export const getOrCreateRenewalInvoice = async ({
  organisationId,
  interval,
}: {
  organisationId: string;
  interval: BillingInterval;
}) => {
  const subscription = await getCryptoSubscription(organisationId);

  const open = await prisma.billingInvoice.findFirst({
    where: { organisationId, kind: BillingInvoiceKind.RENEWAL, status: BillingInvoiceStatus.OPEN },
  });

  if (open && open.interval === interval) {
    return open;
  }

  if (open) {
    await voidInvoice(open.id);
  }

  const extraSeats = subscription?.extraSeats ?? 0;
  const periodStart = nextPeriodStart(subscription?.periodEnd ?? null);

  return prisma.billingInvoice.create({
    data: {
      organisationId,
      kind: BillingInvoiceKind.RENEWAL,
      interval,
      periodStart,
      periodEnd: addInterval(periodStart, interval),
      extraSeats,
      amountCents: renewalAmountCents(interval, extraSeats),
    },
  });
};

/** A prorated invoice for adding seats to the current, active period. */
export const createSeatsInvoice = async ({ organisationId, seats }: { organisationId: string; seats: number }) => {
  const subscription = await getCryptoSubscription(organisationId);
  const now = new Date();

  if (
    !subscription ||
    subscription.status !== SubscriptionStatus.ACTIVE ||
    !subscription.interval ||
    !subscription.periodEnd ||
    subscription.periodEnd <= now
  ) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Activate the plan before adding seats.',
    });
  }

  const openSeatInvoices = await prisma.billingInvoice.findMany({
    where: { organisationId, kind: BillingInvoiceKind.SEATS, status: BillingInvoiceStatus.OPEN },
  });

  for (const invoice of openSeatInvoices) {
    await voidInvoice(invoice.id);
  }

  return prisma.billingInvoice.create({
    data: {
      organisationId,
      kind: BillingInvoiceKind.SEATS,
      interval: subscription.interval,
      periodStart: now,
      periodEnd: subscription.periodEnd,
      extraSeats: seats,
      amountCents: proratedSeatsCents({
        interval: subscription.interval,
        seats,
        periodStart: intervalStartBefore(subscription.periodEnd, subscription.interval),
        periodEnd: subscription.periodEnd,
        now,
      }),
    },
  });
};

export const voidInvoice = async (invoiceId: string) => {
  await prisma.$transaction([
    prisma.billingInvoice.update({ where: { id: invoiceId }, data: { status: BillingInvoiceStatus.VOID } }),
    prisma.cryptoPaymentRequest.updateMany({
      where: { invoiceId, status: CryptoPaymentStatus.PENDING },
      data: { status: CryptoPaymentStatus.CANCELLED },
    }),
  ]);
};

const applyPaidClaim = async (tx: Prisma.TransactionClient, organisationId: string, extraSeats: number) => {
  const organisation = await tx.organisation.findUniqueOrThrow({
    where: { id: organisationId },
    select: { organisationClaimId: true },
  });

  const paidClaim = await getSubscriptionClaim(PAID_CLAIM_ID);

  await tx.organisationClaim.update({
    where: { id: organisation.organisationClaimId },
    data: {
      ...createOrganisationClaimUpsertData(paidClaim),
      originalSubscriptionClaimId: PAID_CLAIM_ID,
      memberCount: seatCap(extraSeats),
    },
  });
};

/**
 * Marks an invoice paid and gives the organisation what it paid for. Safe to call twice: an invoice
 * that is already paid is left alone.
 */
export const markInvoicePaid = async (invoiceId: string, paidVia: 'crypto' | 'manual') => {
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.billingInvoice.findUniqueOrThrow({ where: { id: invoiceId } });

    const claimed = await tx.billingInvoice.updateMany({
      where: { id: invoiceId, status: { not: BillingInvoiceStatus.PAID } },
      data: { status: BillingInvoiceStatus.PAID, paidAt: new Date(), paidVia },
    });

    if (claimed.count === 0) {
      return;
    }

    const subscription = await tx.subscription.findFirst({
      where: { organisationId: invoice.organisationId, provider: CRYPTO_PROVIDER },
    });

    if (invoice.kind === BillingInvoiceKind.RENEWAL) {
      // Recomputed at payment time: an invoice paid after the period lapsed starts now.
      const periodStart = nextPeriodStart(subscription?.periodEnd ?? null);
      const periodEnd = addInterval(periodStart, invoice.interval);
      const extraSeats = subscription?.extraSeats ?? invoice.extraSeats;

      const data = {
        provider: CRYPTO_PROVIDER,
        status: SubscriptionStatus.ACTIVE,
        priceId: `pactira_${invoice.interval.toLowerCase()}`,
        interval: invoice.interval,
        periodStart,
        periodEnd,
        extraSeats,
        cancelAtPeriodEnd: false,
      };

      await tx.subscription.upsert({
        where: { organisationId: invoice.organisationId },
        create: { ...data, ...syntheticIds(invoice.organisationId), organisationId: invoice.organisationId },
        update: data,
      });

      await applyPaidClaim(tx, invoice.organisationId, extraSeats);

      return;
    }

    if (!subscription) {
      throw new Error(`Seat invoice ${invoice.id} paid without a subscription`);
    }

    const extraSeats = subscription.extraSeats + invoice.extraSeats;

    await tx.subscription.update({ where: { id: subscription.id }, data: { extraSeats } });
    await applyPaidClaim(tx, invoice.organisationId, extraSeats);
  });
};

/**
 * Creates renewal invoices shortly before periods end and restricts organisations whose period
 * has ended unpaid. Run regularly.
 */
export const processRenewals = async (now: Date = new Date()) => {
  const leadTime = new Date(now.getTime() + RENEWAL_LEAD_DAYS * 24 * 60 * 60 * 1000);

  const dueSoon = await prisma.subscription.findMany({
    where: {
      provider: CRYPTO_PROVIDER,
      status: SubscriptionStatus.ACTIVE,
      periodEnd: { lte: leadTime },
      organisation: {
        billingInvoices: { none: { kind: BillingInvoiceKind.RENEWAL, status: BillingInvoiceStatus.OPEN } },
      },
    },
  });

  for (const subscription of dueSoon) {
    await getOrCreateRenewalInvoice({
      organisationId: subscription.organisationId,
      interval: subscription.interval ?? 'MONTH',
    });
  }

  const lapsed = await prisma.subscription.updateMany({
    where: { provider: CRYPTO_PROVIDER, status: SubscriptionStatus.ACTIVE, periodEnd: { lte: now } },
    data: { status: SubscriptionStatus.INACTIVE },
  });

  return { renewalInvoices: dueSoon.length, lapsed: lapsed.count };
};
