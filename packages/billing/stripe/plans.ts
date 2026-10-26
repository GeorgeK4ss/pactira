import { stripe } from '@documenso/lib/server-only/stripe';
import { INTERNAL_CLAIM_ID, type InternalClaim, internalClaims } from '@documenso/lib/types/subscription';
import { toHumanPrice } from '@documenso/lib/universal/stripe/to-human-price';
import type Stripe from 'stripe';

export type PlanPrice = Stripe.Price & {
  product: Stripe.Product;
  isVisibleInApp: boolean;
  friendlyPrice: string;
};

export type InternalClaimPlans = {
  [key in INTERNAL_CLAIM_ID]: InternalClaim & {
    monthlyPrice?: PlanPrice;
    yearlyPrice?: PlanPrice;
  };
};

/**
 * The plan a Stripe price belongs to, from `claimId` metadata on the price or its product.
 */
export const getPriceClaimId = (price: Stripe.Price): string | null => {
  const product = typeof price.product === 'object' && !('deleted' in price.product) ? price.product : null;

  return price.metadata?.claimId || product?.metadata?.claimId || null;
};

const isInternalClaimId = (value: string): value is INTERNAL_CLAIM_ID =>
  Object.values<string>(INTERNAL_CLAIM_ID).includes(value);

/**
 * The app's plans with their monthly and yearly Stripe prices, if any.
 */
export const getInternalClaimPlans = async (): Promise<InternalClaimPlans> => {
  const plans = Object.fromEntries(
    Object.entries(internalClaims).map(([key, claim]) => [key, { ...claim }]),
  ) as InternalClaimPlans;

  const prices = await stripe.prices
    .list({ active: true, type: 'recurring', expand: ['data.product'], limit: 100 })
    .autoPagingToArray({ limit: 1000 });

  for (const price of prices) {
    const claimId = getPriceClaimId(price);
    const product = price.product;

    if (!claimId || !isInternalClaimId(claimId) || typeof product !== 'object' || 'deleted' in product) {
      continue;
    }

    if (!product.active) {
      continue;
    }

    const planPrice: PlanPrice = {
      ...price,
      product,
      isVisibleInApp: price.metadata?.visibleInApp !== 'false',
      friendlyPrice: toHumanPrice(price.unit_amount ?? 0),
    };

    const interval = price.recurring?.interval;

    if (interval === 'month') {
      plans[claimId].monthlyPrice = planPrice;
    }

    if (interval === 'year') {
      plans[claimId].yearlyPrice = planPrice;
    }
  }

  return plans;
};
