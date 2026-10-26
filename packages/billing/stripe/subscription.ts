import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@documenso/lib/constants/organisations';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { createOrganisationClaimUpsertData } from '@documenso/lib/server-only/organisation/create-organisation';
import { stripe } from '@documenso/lib/server-only/stripe';
import { getSubscriptionClaim } from '@documenso/lib/server-only/subscription/get-subscription-claim';
import { INTERNAL_CLAIM_ID } from '@documenso/lib/types/subscription';
import { buildOrganisationWhereQuery } from '@documenso/lib/utils/organisations';
import { prisma } from '@documenso/prisma';
import { SubscriptionStatus } from '@prisma/client';
import type Stripe from 'stripe';

import { getPriceClaimId } from './plans';

export type GetSubscriptionOptions = {
  userId: number;
  organisationId: string;
};

/**
 * The organisation's local subscription row together with the live Stripe subscription.
 * Returns null when the organisation has never subscribed.
 */
export const getSubscription = async ({ organisationId, userId }: GetSubscriptionOptions) => {
  const organisation = await prisma.organisation.findFirst({
    where: buildOrganisationWhereQuery({
      organisationId,
      userId,
      roles: ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_ORGANISATION'],
    }),
    include: {
      subscription: true,
    },
  });

  if (!organisation) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Organisation not found',
    });
  }

  if (!organisation.subscription) {
    return null;
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(organisation.subscription.planId, {
    expand: ['items.data.price.product'],
  });

  return {
    organisationSubscription: organisation.subscription,
    stripeSubscription,
  };
};

const toSubscriptionStatus = (status: Stripe.Subscription.Status): SubscriptionStatus => {
  switch (status) {
    case 'active':
    case 'trialing':
      return SubscriptionStatus.ACTIVE;
    case 'past_due':
      return SubscriptionStatus.PAST_DUE;
    default:
      return SubscriptionStatus.INACTIVE;
  }
};

// Order used to pick the subscription that counts when a customer has several.
const STATUS_PRIORITY: Stripe.Subscription.Status[] = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
  'canceled',
  'incomplete_expired',
];

const pickCurrentSubscription = (subscriptions: Stripe.Subscription[]) => {
  return [...subscriptions].sort((a, b) => {
    const byStatus = STATUS_PRIORITY.indexOf(a.status) - STATUS_PRIORITY.indexOf(b.status);

    return byStatus !== 0 ? byStatus : b.created - a.created;
  })[0];
};

export type SyncStripeCustomerSubscriptionOptions = {
  customerId: string;

  /**
   * When true only the Subscription row is written; the organisation's limits are left as they are.
   */
  bypassClaimUpdate?: boolean;
};

/**
 * Reads the customer's subscriptions from Stripe and writes the result to the database:
 * the Subscription row, and the organisation's limits for the plan it now has.
 *
 * Safe to call any number of times, from any webhook event or by hand.
 * Limits are only rewritten when the plan changes, so admin edits to an
 * organisation's limits survive routine renewals.
 */
export const syncStripeCustomerSubscription = async ({
  customerId,
  bypassClaimUpdate = false,
}: SyncStripeCustomerSubscriptionOptions) => {
  const organisation = await prisma.organisation.findFirst({
    where: {
      OR: [{ customerId }, { subscription: { customerId } }],
    },
    include: {
      subscription: true,
      organisationClaim: true,
    },
  });

  if (!organisation) {
    // A customer of another product on the same Stripe account, or a deleted organisation.
    console.warn(`[billing] No organisation for Stripe customer ${customerId}, skipping sync`);
    return;
  }

  const subscriptions = await stripe.subscriptions
    // Stripe allows four levels of expand, so the product is fetched separately when needed.
    .list({ customer: customerId, status: 'all', expand: ['data.items.data.price'], limit: 100 })
    .autoPagingToArray({ limit: 1000 });

  const current = pickCurrentSubscription(subscriptions);

  const applyClaim = async (claimId: string) => {
    if (bypassClaimUpdate || organisation.organisationClaim.originalSubscriptionClaimId === claimId) {
      return;
    }

    const subscriptionClaim = await getSubscriptionClaim(claimId);

    await prisma.organisationClaim.update({
      where: { id: organisation.organisationClaimId },
      data: {
        originalSubscriptionClaimId: claimId,
        ...createOrganisationClaimUpsertData(subscriptionClaim),
      },
    });
  };

  if (!current) {
    if (organisation.subscription) {
      await prisma.subscription.update({
        where: { id: organisation.subscription.id },
        data: { status: SubscriptionStatus.INACTIVE },
      });
    }

    await applyClaim(INTERNAL_CLAIM_ID.FREE);
    return;
  }

  const price = current.items.data[0]?.price;

  if (!price) {
    throw new Error(`[billing] Stripe subscription ${current.id} has no price`);
  }

  const status = toSubscriptionStatus(current.status);

  const data = {
    status,
    planId: current.id,
    priceId: price.id,
    customerId,
    periodEnd: new Date(current.current_period_end * 1000),
    cancelAtPeriodEnd: current.cancel_at_period_end,
  };

  await prisma.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { organisationId: organisation.id },
      create: { ...data, organisationId: organisation.id },
      update: data,
    });

    if (organisation.customerId !== customerId) {
      await tx.organisation.update({
        where: { id: organisation.id },
        data: { customerId },
      });
    }
  });

  if (status === SubscriptionStatus.INACTIVE) {
    await applyClaim(INTERNAL_CLAIM_ID.FREE);
    return;
  }

  const claimId =
    getPriceClaimId(price) ??
    (typeof price.product === 'string'
      ? getPriceClaimId({ ...price, product: await stripe.products.retrieve(price.product) })
      : null);

  if (!claimId) {
    console.error(`[billing] Stripe price ${price.id} has no claimId metadata, limits not updated`);
    return;
  }

  await applyClaim(claimId);
};
