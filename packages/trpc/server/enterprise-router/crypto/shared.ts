import { IS_CRYPTO_BILLING_ENABLED } from '@documenso/lib/constants/app';
import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@documenso/lib/constants/organisations';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { buildOrganisationWhereQuery } from '@documenso/lib/utils/organisations';
import { prisma } from '@documenso/prisma';

export const assertCryptoBilling = () => {
  if (!IS_CRYPTO_BILLING_ENABLED()) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'Crypto billing is not enabled' });
  }
};

/** The organisation, if the user may see (`view`) or pay for (`manage`) its billing. */
export const findBillingOrganisation = async ({
  organisationId,
  userId,
  access,
}: {
  organisationId: string;
  userId: number;
  access: 'view' | 'manage';
}) => {
  assertCryptoBilling();

  const organisation = await prisma.organisation.findFirst({
    where: buildOrganisationWhereQuery({
      organisationId,
      userId,
      roles: ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP[access === 'manage' ? 'MANAGE_BILLING' : 'MANAGE_ORGANISATION'],
    }),
  });

  if (!organisation) {
    throw new AppError(AppErrorCode.UNAUTHORIZED);
  }

  return organisation;
};
