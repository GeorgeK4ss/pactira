import { SENDS_PER_MONTH, usageMonthStart } from '@documenso/billing/plan';
import { prisma } from '@documenso/prisma';
import { OrganisationType, SubscriptionStatus } from '@prisma/client';

import { IS_BILLING_ENABLED, IS_CRYPTO_BILLING_ENABLED } from '../../constants/app';
import { AppError } from '../../errors/app-error';
import { isOrganisationPendingPayment } from '../../utils/billing';

export const PAYMENT_REQUIRED_ERROR_CODE = 'PAYMENT_REQUIRED';
export const SEND_LIMIT_REACHED_ERROR_CODE = 'SEND_LIMIT_REACHED';

/**
 * Refuses to send documents for an organisation that has not paid, whose paid period has ended,
 * or that has used its monthly sends. Every way of sending (app, API, templates, direct links,
 * bulk send, signing links without email) goes through this check.
 */
export const assertOrganisationCanSend = async ({ teamId }: { teamId: number }) => {
  if (!IS_BILLING_ENABLED()) {
    return;
  }

  const organisation = await prisma.organisation.findFirst({
    where: { teams: { some: { id: teamId } } },
    select: {
      id: true,
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
    throw new AppError(PAYMENT_REQUIRED_ERROR_CODE, {
      message: 'Payment required. Pay for the plan to send documents.',
      statusCode: 402,
    });
  }

  const periodEnd = organisation.subscription?.periodEnd;

  if (IS_CRYPTO_BILLING_ENABLED() && periodEnd) {
    const sendsThisMonth = await countSendsThisMonth({ organisationId: organisation.id, periodEnd });

    if (sendsThisMonth >= SENDS_PER_MONTH) {
      throw new AppError(SEND_LIMIT_REACHED_ERROR_CODE, {
        message: `You have sent ${SENDS_PER_MONTH} documents this billing month, the plan limit. Sending opens again when the next month starts.`,
        statusCode: 400,
      });
    }
  }
};

/** Documents sent (emailed or as signing links) in the current billing month, deleted ones included. */
export const countSendsThisMonth = async ({ organisationId, periodEnd }: { organisationId: string; periodEnd: Date }) =>
  prisma.documentSend.count({
    where: { organisationId, createdAt: { gte: usageMonthStart(periodEnd) } },
  });
