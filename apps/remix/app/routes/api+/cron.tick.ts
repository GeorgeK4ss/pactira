import { timingSafeEqual } from 'node:crypto';

import { runCryptoTick } from '@documenso/billing/crypto/core';
import { IS_CRYPTO_BILLING_ENABLED } from '@documenso/lib/constants/app';
import { jobsClient } from '@documenso/lib/jobs/client';
import { env } from '@documenso/lib/utils/env';

import type { Route } from './+types/cron.tick';

const isAuthorised = (request: Request) => {
  const secret = env('CRON_SECRET');
  const given = request.headers.get('x-cron-secret');

  if (!secret || !given) {
    return false;
  }

  const a = Buffer.from(secret);
  const b = Buffer.from(given);

  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * POST /api/cron/tick: called every minute by Cloud Scheduler. Cloud Run only gives the app CPU
 * while it answers a request, so the in-process cron poller cannot be relied on there; everything
 * that must run on a schedule runs inside this request instead.
 */
export async function action({ request }: Route.ActionArgs) {
  if (!isAuthorised(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result: Record<string, unknown> = {};

  try {
    await jobsClient.runCronTick();
    result.jobs = 'ok';
  } catch (err) {
    console.error('[CRON] Job tick failed', err);
    result.jobs = 'failed';
  }

  if (IS_CRYPTO_BILLING_ENABLED()) {
    try {
      result.crypto = await runCryptoTick();
    } catch (err) {
      console.error('[CRON] Crypto tick failed', err);
      result.crypto = 'failed';
    }
  }

  return Response.json(result, {
    // BigInt-free summary; counts and per-coin errors only.
    headers: { 'cache-control': 'no-store' },
  });
}
