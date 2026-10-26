# @documenso/billing

AGPL-3.0 billing and plan limits for this fork. Replaces the commercially licensed
Stripe module and server-side limits in `packages/ee`, which this fork does not use.

- `stripe/` — Stripe customers, Checkout, Customer Portal, invoices, plans and the webhook.
  A Stripe Price belongs to a plan through its metadata: `claimId=<SubscriptionClaim id>`
  (e.g. `individual`, `team`). Optional `visibleInApp=false` hides a price from the billing page.
- `limits/` — the document / recipient / direct-template limits shown in the app and enforced
  on the server. The client-side files (`schema`, `constants`, `client`, `provider`) were served
  to the browser and are AGPL-3.0 under the Documenso Commercial License's own terms.
