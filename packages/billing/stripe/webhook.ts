import { stripe } from '@documenso/lib/server-only/stripe';
import { env } from '@documenso/lib/utils/env';
import type Stripe from 'stripe';

import { syncStripeCustomerSubscription } from './subscription';

const SUBSCRIPTION_EVENTS = new Set<string>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
]);

const getCustomerId = (event: Stripe.Event): string | null => {
  const object = event.data.object as { customer?: string | Stripe.Customer | Stripe.DeletedCustomer | null };
  const customer = object.customer;

  if (!customer) {
    return null;
  }

  return typeof customer === 'string' ? customer : customer.id;
};

/**
 * POST /api/stripe/webhook
 *
 * Every relevant event is handled the same way: re-read the customer's subscriptions from
 * Stripe and sync them. That makes the handler idempotent and immune to event ordering.
 */
export const stripeWebhookHandler = async (req: Request): Promise<Response> => {
  const webhookSecret = env('NEXT_PRIVATE_STRIPE_WEBHOOK_SECRET');
  const signature = req.headers.get('stripe-signature');

  if (!webhookSecret) {
    console.error('[billing] NEXT_PRIVATE_STRIPE_WEBHOOK_SECRET is not set');
    return Response.json({ success: false, message: 'Webhook not configured' }, { status: 500 });
  }

  if (!signature) {
    return Response.json({ success: false, message: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const payload = await req.text();
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error('[billing] Invalid Stripe webhook signature', err);
    return Response.json({ success: false, message: 'Invalid signature' }, { status: 400 });
  }

  if (!SUBSCRIPTION_EVENTS.has(event.type)) {
    return Response.json({ success: true, message: 'Ignored' }, { status: 200 });
  }

  const customerId = getCustomerId(event);

  if (!customerId) {
    return Response.json({ success: true, message: 'No customer on event' }, { status: 200 });
  }

  try {
    await syncStripeCustomerSubscription({ customerId });
  } catch (err) {
    console.error(`[billing] Failed to sync Stripe customer ${customerId} for ${event.type}`, err);
    // Non-2xx makes Stripe retry the event.
    return Response.json({ success: false, message: 'Sync failed' }, { status: 500 });
  }

  return Response.json({ success: true, message: 'Synced' }, { status: 200 });
};
