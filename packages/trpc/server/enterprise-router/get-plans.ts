import { getInternalClaimPlans, type InternalClaimPlans } from '@documenso/billing/stripe/plans';
import { IS_BILLING_ENABLED, IS_CRYPTO_BILLING_ENABLED } from '@documenso/lib/constants/app';
import { internalClaims } from '@documenso/lib/types/subscription';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';

export const getPlansRoute = authenticatedProcedure.query(async ({ ctx }) => {
  const userId = ctx.user.id;

  // Plans are Stripe prices; crypto billing has a single fixed plan instead.
  if (IS_CRYPTO_BILLING_ENABLED()) {
    return {
      plans: internalClaims as InternalClaimPlans,
      canCreateFreeOrganisation: false,
    };
  }

  const plans = await getInternalClaimPlans();

  let canCreateFreeOrganisation = false;

  if (IS_BILLING_ENABLED()) {
    const numberOfFreeOrganisations = await prisma.organisation.count({
      where: {
        ownerUserId: userId,
        subscription: {
          is: null,
        },
      },
    });

    canCreateFreeOrganisation = numberOfFreeOrganisations === 0;
  }

  return {
    plans,
    canCreateFreeOrganisation,
  };
});
