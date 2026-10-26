import { stripeWebhookHandler } from '@documenso/billing/stripe/webhook';
import { IS_STRIPE_BILLING_ENABLED } from '@documenso/lib/constants/app';

import type { Route } from './+types/webhook.trigger';

export async function action({ request }: Route.ActionArgs) {
  if (!IS_STRIPE_BILLING_ENABLED()) {
    return Response.json({ success: true, message: 'Stripe billing is turned off, event ignored' });
  }

  return await stripeWebhookHandler(request);
}
