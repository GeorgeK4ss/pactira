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

export const ZGetAdminCryptoOrganisationRequestSchema = z.object({
  organisationId: z.string(),
});

export const ZSetCryptoPeriodRequestSchema = z.object({
  organisationId: z.string(),
  /** 'expire' restricts now, 'extend' adds one billing interval, 'set' uses periodEnd. */
  action: z.enum(['set', 'extend', 'expire']),
  periodEnd: z.coerce.date().optional(),
  extraSeats: z.number().int().min(0).max(1000).optional(),
});
