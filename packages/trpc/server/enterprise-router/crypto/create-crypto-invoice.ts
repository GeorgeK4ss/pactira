import { createSeatsInvoice, getOrCreateRenewalInvoice } from '@documenso/billing/invoices';

import { authenticatedProcedure } from '../../trpc';
import { ZAddCryptoSeatsRequestSchema, ZCreateCryptoInvoiceRequestSchema } from './create-crypto-invoice.types';
import { findBillingOrganisation } from './shared';

export const createCryptoInvoiceRoute = authenticatedProcedure
  .input(ZCreateCryptoInvoiceRequestSchema)
  .mutation(async ({ ctx, input }) => {
    const { organisationId, interval } = input;

    await findBillingOrganisation({ organisationId, userId: ctx.user.id, access: 'manage' });

    const invoice = await getOrCreateRenewalInvoice({ organisationId, interval });

    return { invoiceId: invoice.id };
  });

export const addCryptoSeatsRoute = authenticatedProcedure
  .input(ZAddCryptoSeatsRequestSchema)
  .mutation(async ({ ctx, input }) => {
    const { organisationId, seats } = input;

    await findBillingOrganisation({ organisationId, userId: ctx.user.id, access: 'manage' });

    const invoice = await createSeatsInvoice({ organisationId, seats });

    return { invoiceId: invoice.id };
  });
