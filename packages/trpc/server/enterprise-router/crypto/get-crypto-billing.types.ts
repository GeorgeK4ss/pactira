import { z } from 'zod';

export const ZGetCryptoBillingRequestSchema = z.object({
  organisationId: z.string(),
});
