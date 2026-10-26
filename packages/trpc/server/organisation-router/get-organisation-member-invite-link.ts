import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@documenso/lib/constants/organisations';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getMemberOrganisationRole } from '@documenso/lib/server-only/team/get-member-roles';
import { buildOrganisationWhereQuery, isOrganisationRoleWithinUserHierarchy } from '@documenso/lib/utils/organisations';
import { prisma } from '@documenso/prisma';
import { OrganisationMemberInviteStatus } from '@prisma/client';

import { authenticatedProcedure } from '../trpc';
import {
  ZGetOrganisationMemberInviteLinkRequestSchema,
  ZGetOrganisationMemberInviteLinkResponseSchema,
} from './get-organisation-member-invite-link.types';

/**
 * The accept link of a pending invitation, so it can be shared by other means when email is not
 * available. Same permissions as resending the invitation.
 */
export const getOrganisationMemberInviteLinkRoute = authenticatedProcedure
  .input(ZGetOrganisationMemberInviteLinkRequestSchema)
  .output(ZGetOrganisationMemberInviteLinkResponseSchema)
  .mutation(async ({ ctx, input }) => {
    const { organisationId, invitationId } = input;
    const userId = ctx.user.id;

    ctx.logger.info({ input: { organisationId, invitationId } });

    const organisation = await prisma.organisation.findFirst({
      where: buildOrganisationWhereQuery({
        organisationId,
        userId,
        roles: ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_ORGANISATION'],
      }),
      include: {
        invites: {
          where: { id: invitationId, status: OrganisationMemberInviteStatus.PENDING },
        },
      },
    });

    const invitation = organisation?.invites[0];

    if (!organisation || !invitation) {
      throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Invitation does not exist' });
    }

    const currentUserOrganisationRole = await getMemberOrganisationRole({
      organisationId: organisation.id,
      reference: { type: 'User', id: userId },
    });

    if (!isOrganisationRoleWithinUserHierarchy(currentUserOrganisationRole, invitation.organisationRole)) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'User does not have permission to share this invitation',
      });
    }

    return { url: `${NEXT_PUBLIC_WEBAPP_URL()}/organisation/invite/${invitation.token}` };
  });
