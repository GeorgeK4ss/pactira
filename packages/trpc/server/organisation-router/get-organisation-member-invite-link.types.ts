import { z } from 'zod';

export const ZGetOrganisationMemberInviteLinkRequestSchema = z.object({
  organisationId: z.string(),
  invitationId: z.string(),
});

export const ZGetOrganisationMemberInviteLinkResponseSchema = z.object({
  url: z.string(),
});
