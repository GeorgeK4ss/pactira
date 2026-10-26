import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { stripe } from '@documenso/lib/server-only/stripe';

export type CreateCheckoutSessionOptions = {
  customerId: string;
  priceId: string;
  returnUrl: string;
};

/**
 * Returns the Stripe Checkout URL for a monthly/yearly subscription to `priceId`.
 *
 * The organisation is found again from the customer when the webhook arrives,
 * since every organisation has its own Stripe customer.
 */
export const createCheckoutSession = async ({ customerId, priceId, returnUrl }: CreateCheckoutSessionOptions) => {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    customer_update: { name: 'auto', address: 'auto' },
    success_url: `${returnUrl}?success=true`,
    cancel_url: `${returnUrl}?canceled=true`,
  });

  if (!session.url) {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Stripe did not return a checkout URL',
    });
  }

  return session.url;
};

export type GetPortalSessionOptions = {
  customerId: string;
  returnUrl: string;
};

export const getPortalSession = async ({ customerId, returnUrl }: GetPortalSessionOptions) => {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
};

export type GetInvoicesOptions = {
  customerId: string;
};

export const getInvoices = async ({ customerId }: GetInvoicesOptions) => {
  return await stripe.invoices.list({ customer: customerId, limit: 100 });
};
