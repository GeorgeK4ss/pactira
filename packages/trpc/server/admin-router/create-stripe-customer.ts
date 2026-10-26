import { createCustomer } from '@documenso/billing/stripe/customers';
import { IS_STRIPE_BILLING_ENABLED } from '@documenso/lib/constants/app';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';

import { adminProcedure } from '../trpc';
import {
  ZCreateStripeCustomerRequestSchema,
  ZCreateStripeCustomerResponseSchema,
} from './create-stripe-customer.types';

export const createStripeCustomerRoute = adminProcedure
  .input(ZCreateStripeCustomerRequestSchema)
  .output(ZCreateStripeCustomerResponseSchema)
  .mutation(async ({ input, ctx }) => {
    if (!IS_STRIPE_BILLING_ENABLED()) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Stripe billing is turned off',
      });
    }
    const { organisationId } = input;

    ctx.logger.info({
      input: {
        organisationId,
      },
    });

    const organisation = await prisma.organisation.findUnique({
      where: {
        id: organisationId,
      },
      include: {
        owner: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!organisation) {
      throw new AppError(AppErrorCode.NOT_FOUND);
    }

    // Create Stripe customer outside a transaction to avoid holding a
    // connection open during the external API call.
    const stripeCustomer = await createCustomer({
      name: organisation.name,
      email: organisation.owner.email,
    });

    await prisma.organisation.update({
      where: {
        id: organisationId,
      },
      data: {
        customerId: stripeCustomer.id,
      },
    });
  });
