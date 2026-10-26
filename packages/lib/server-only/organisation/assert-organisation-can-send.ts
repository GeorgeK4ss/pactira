import { prisma } from '@documenso/prisma';
import { OrganisationType, SubscriptionStatus } from '@prisma/client';

import { IS_BILLING_ENABLED } from '../../constants/app';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { isOrganisationPendingPayment } from '../../utils/billing';

/**
 * Refuses to send documents for an organisation that has not paid or whose paid period has
 * ended. Creating drafts is limited elsewhere; this closes sending, which every path (app, API,
 * templates, direct links, bulk send) goes through.
 */
export const assertOrganisationCanSend = async ({ teamId }: { teamId: number }) => {
  if (!IS_BILLING_ENABLED()) {
    return;
  }

  const organisation = await prisma.organisation.findFirst({
    where: { teams: { some: { id: teamId } } },
    select: {
      type: true,
      subscription: true,
      organisationClaim: { select: { originalSubscriptionClaimId: true } },
    },
  });

  if (!organisation) {
    return;
  }

  const isLapsed =
    organisation.type === OrganisationType.ORGANISATION &&
    organisation.subscription?.status === SubscriptionStatus.INACTIVE;

  if (isLapsed || isOrganisationPendingPayment(organisation)) {
    throw new AppError(AppErrorCode.LIMIT_EXCEEDED, {
      message: 'Payment required. Pay for the plan to send documents.',
      statusCode: 402,
    });
  }
};
