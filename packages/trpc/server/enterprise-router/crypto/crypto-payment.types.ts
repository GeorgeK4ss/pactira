import { z } from 'zod';

export const ZGetCryptoInvoiceRequestSchema = z.object({
  organisationId: z.string(),
  invoiceId: z.string(),
});

export const ZCreateCryptoPaymentRequestSchema = z.object({
  organisationId: z.string(),
  invoiceId: z.string(),
  network: z.enum(['tron', 'ethereum', 'bsc']),
  asset: z.enum(['USDT', 'USDC']),
});

export const ZRefreshCryptoPaymentRequestSchema = z.object({
  organisationId: z.string(),
  requestId: z.string(),
});

export const ZSubmitCryptoTxHashRequestSchema = z.object({
  organisationId: z.string(),
  requestId: z.string(),
  hash: z.string().trim().min(10).max(80),
});
