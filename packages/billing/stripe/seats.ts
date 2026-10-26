import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { OrganisationClaim, Subscription } from '@prisma/client';

/**
 * Plans in this app are a flat price per organisation, so member count never changes
 * the Stripe subscription. The plan's member limit is still enforced.
 */
export const assertMemberCountWithinCap = async (
  _subscription: Subscription | null,
  organisationClaim: Pick<OrganisationClaim, 'memberCount'>,
  memberCount: number,
) => {
  if (organisationClaim.memberCount > 0 && memberCount > organisationClaim.memberCount) {
    throw new AppError(AppErrorCode.LIMIT_EXCEEDED, {
      message: `Your plan allows ${organisationClaim.memberCount} members. Upgrade your plan to add more.`,
      statusCode: 400,
    });
  }
};

/**
 * No-op: flat plans have no seat quantity to keep in step with the member count.
 */
export const syncMemberCountWithStripeSeatPlan = async (
  _subscription: Subscription,
  _organisationClaim: OrganisationClaim,
  _memberCount: number,
  _direction: 'grow' | 'shrink',
) => {};
