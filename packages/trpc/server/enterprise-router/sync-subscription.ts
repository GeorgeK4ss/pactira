import { syncStripeCustomerSubscription } from '@documenso/billing/stripe/subscription';
import { IS_STRIPE_BILLING_ENABLED } from '@documenso/lib/constants/app';
import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@documenso/lib/constants/organisations';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { assertRateLimit } from '@documenso/lib/server-only/rate-limit/rate-limit-middleware';
import { syncSubscriptionRateLimit } from '@documenso/lib/server-only/rate-limit/rate-limits';
import { buildOrganisationWhereQuery } from '@documenso/lib/utils/organisations';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import { ZSyncSubscriptionRequestSchema, ZSyncSubscriptionResponseSchema } from './sync-subscription.types';

export const syncSubscriptionRoute = authenticatedProcedure
  .input(ZSyncSubscriptionRequestSchema)
  .output(ZSyncSubscriptionResponseSchema)
  .mutation(async ({ ctx, input }) => {
    const { organisationId } = input;

    ctx.logger.info({
      input: {
        organisationId,
      },
    });

    const userId = ctx.user.id;

    if (!IS_STRIPE_BILLING_ENABLED()) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Stripe billing is turned off',
      });
    }

    const rateLimitResult = await syncSubscriptionRateLimit.check({
      ip: ctx.metadata.requestMetadata.ipAddress ?? 'unknown',
      identifier: `${userId}`,
    });

    assertRateLimit(rateLimitResult);

    const organisation = await prisma.organisation.findFirst({
      where: buildOrganisationWhereQuery({
        organisationId,
        userId,
        roles: ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP.MANAGE_BILLING,
      }),
    });

    if (!organisation) {
      throw new AppError(AppErrorCode.UNAUTHORIZED);
    }

    if (!organisation.customerId) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Organisation has no billing customer',
      });
    }

    await syncStripeCustomerSubscription({
      customerId: organisation.customerId,
    }).catch((error) => {
      ctx.logger.error({
        msg: 'Failed to sync the subscription from Stripe',
        error,
      });

      throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
        message: 'Failed to sync the subscription from Stripe',
      });
    });
  });
