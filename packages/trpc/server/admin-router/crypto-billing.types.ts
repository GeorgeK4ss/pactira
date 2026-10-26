import { z } from 'zod';

export const ZMarkCryptoInvoicePaidRequestSchema = z.object({
  invoiceId: z.string(),
});

export const ZCreateAdminCryptoInvoiceRequestSchema = z.object({
  organisationId: z.string(),
  interval: z.enum(['MONTH', 'YEAR']),
  /** Overrides the plan price, e.g. for a deal or a small live test. */
  amountCents: z.number().int().min(100).max(10_000_000).optional(),
});
