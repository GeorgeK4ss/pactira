import { IS_BILLING_ENABLED } from '@documenso/lib/constants/app';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { TClaimFlags } from '@documenso/lib/types/subscription';
import { isOrganisationPendingPayment } from '@documenso/lib/utils/billing';
import { buildTeamWhereQuery } from '@documenso/lib/utils/teams';
import { prisma } from '@documenso/prisma';
import { EnvelopeType, OrganisationType, SubscriptionStatus } from '@prisma/client';

import { FREE_PLAN_LIMITS, INACTIVE_PLAN_LIMITS, PAID_PLAN_LIMITS, SELFHOSTED_PLAN_LIMITS } from './constants';
import type { TLimitsResponseSchema, TLimitsSchema } from './schema';

export type GetServerLimitsOptions = {
  userId: number;
  teamId: number;
};

/**
 * Plan limits for the organisation that owns the given team.
 *
 * - Billing disabled: unlimited.
 * - Active or past-due subscription: paid limits.
 * - Organisation awaiting its first payment, or with a lapsed subscription: nothing can be created.
 * - Personal organisation without a paid subscription: free limits, counted per calendar month.
 *
 * Recipients always follow the organisation claim (0 = unlimited).
 */
export const getServerLimits = async ({ userId, teamId }: GetServerLimitsOptions): Promise<TLimitsResponseSchema> => {
  const team = await prisma.team.findFirst({
    where: buildTeamWhereQuery({ teamId, userId }),
    select: {
      organisation: {
        select: {
          id: true,
          type: true,
          subscription: true,
          organisationClaim: true,
        },
      },
    },
  });

  if (!team) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, {
      message: 'You are not a member of this team',
    });
  }

  const { organisation } = team;
  const claim = organisation.organisationClaim;
  const flags = (claim.flags ?? {}) as TClaimFlags;

  const maximumEnvelopeItemCount = claim.envelopeItemCount;
  const recipients = claim.recipientCount > 0 ? claim.recipientCount : Infinity;

  const withRecipients = (limits: TLimitsSchema): TLimitsSchema => ({
    ...limits,
    recipients: limits.recipients === 0 ? 0 : recipients,
  });

  if (!IS_BILLING_ENABLED()) {
    const quota = withRecipients(SELFHOSTED_PLAN_LIMITS);

    return { quota, remaining: quota, maximumEnvelopeItemCount };
  }

  const subscriptionStatus = organisation.subscription?.status;

  const isLapsedOrganisation =
    organisation.type === OrganisationType.ORGANISATION && subscriptionStatus === SubscriptionStatus.INACTIVE;

  // Checked before "paid": with crypto billing an ACTIVE row past its period end is already unpaid.
  if (isLapsedOrganisation || isOrganisationPendingPayment(organisation)) {
    return {
      quota: INACTIVE_PLAN_LIMITS,
      remaining: INACTIVE_PLAN_LIMITS,
      maximumEnvelopeItemCount,
    };
  }

  const isPaid = subscriptionStatus === SubscriptionStatus.ACTIVE || subscriptionStatus === SubscriptionStatus.PAST_DUE;

  if (isPaid) {
    const quota = withRecipients(PAID_PLAN_LIMITS);

    return { quota, remaining: quota, maximumEnvelopeItemCount };
  }

  const quota = withRecipients({
    ...FREE_PLAN_LIMITS,
    documents: flags.unlimitedDocuments ? Infinity : FREE_PLAN_LIMITS.documents,
  });

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [documentsThisMonth, directTemplates] = await Promise.all([
    prisma.envelope.count({
      where: {
        type: EnvelopeType.DOCUMENT,
        createdAt: { gte: startOfMonth },
        team: { organisationId: organisation.id },
      },
    }),
    prisma.envelope.count({
      where: {
        type: EnvelopeType.TEMPLATE,
        deletedAt: null,
        directLink: { isNot: null },
        team: { organisationId: organisation.id },
      },
    }),
  ]);

  return {
    quota,
    remaining: {
      documents: Math.max(quota.documents - documentsThisMonth, 0),
      recipients: quota.recipients,
      directTemplates: Math.max(quota.directTemplates - directTemplates, 0),
    },
    maximumEnvelopeItemCount,
  };
};
