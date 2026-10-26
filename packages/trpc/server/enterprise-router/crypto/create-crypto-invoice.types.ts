import { z } from 'zod';

export const ZCreateCryptoInvoiceRequestSchema = z.object({
  organisationId: z.string(),
  interval: z.enum(['MONTH', 'YEAR']),
});

export const ZAddCryptoSeatsRequestSchema = z.object({
  organisationId: z.string(),
  seats: z.number().int().min(1).max(500),
});
