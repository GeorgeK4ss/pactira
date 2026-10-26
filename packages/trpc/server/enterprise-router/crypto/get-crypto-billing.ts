import { NETWORKS } from '@documenso/billing/crypto/config';
import { getCryptoSettings, payableAssets } from '@documenso/billing/crypto/settings';
import { CRYPTO_PROVIDER } from '@documenso/billing/invoices';
import { SENDS_PER_MONTH, seatCap } from '@documenso/billing/plan';
import { countSendsThisMonth } from '@documenso/lib/server-only/organisation/assert-organisation-can-send';
import { isOrganisationPendingPayment } from '@documenso/lib/utils/billing';
import { prisma } from '@documenso/prisma';
import { OrganisationMemberInviteStatus } from '@prisma/client';

import { authenticatedProcedure } from '../../trpc';
import { ZGetCryptoBillingRequestSchema } from './get-crypto-billing.types';
import { findBillingOrganisation } from './shared';

export const getCryptoBillingRoute = authenticatedProcedure
  .input(ZGetCryptoBillingRequestSchema)
  .query(async ({ ctx, input }) => {
    const { organisationId } = input;

    const organisation = await findBillingOrganisation({ organisationId, userId: ctx.user.id, access: 'view' });

    const [subscription, members, invites, invoices, settings] = await Promise.all([
      prisma.subscription.findFirst({ where: { organisationId, provider: CRYPTO_PROVIDER } }),
      prisma.organisationMember.count({ where: { organisationId } }),
      prisma.organisationMemberInvite.count({
        where: { organisationId, status: OrganisationMemberInviteStatus.PENDING },
      }),
      prisma.billingInvoice.findMany({
        where: { organisationId },
        orderBy: { createdAt: 'desc' },
        take: 24,
        include: {
          paymentRequests: {
            where: { status: 'PAID' },
            include: { transfer: { select: { txHash: true } } },
          },
        },
      }),
      getCryptoSettings(),
    ]);

    const sendsUsed = subscription?.periodEnd
      ? await countSendsThisMonth({ organisationId, periodEnd: subscription.periodEnd })
      : 0;

    return {
      sends: { used: sendsUsed, limit: SENDS_PER_MONTH },
      isPaymentRequired: isOrganisationPendingPayment({
        type: organisation.type,
        subscription,
        organisationClaim: { originalSubscriptionClaimId: null },
      }),
      subscription: subscription && {
        status: subscription.status,
        interval: subscription.interval,
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd,
        extraSeats: subscription.extraSeats,
      },
      seats: {
        cap: seatCap(subscription?.extraSeats ?? 0),
        members,
        invites,
      },
      invoices: invoices.map((invoice) => {
        const paidRequest = invoice.paymentRequests[0];

        return {
          id: invoice.id,
          kind: invoice.kind,
          status: invoice.status,
          interval: invoice.interval,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          extraSeats: invoice.extraSeats,
          amountCents: invoice.amountCents,
          paidAt: invoice.paidAt,
          paidVia: invoice.paidVia,
          txUrl: paidRequest?.transfer
            ? NETWORKS[paidRequest.network as keyof typeof NETWORKS]?.explorerTx(paidRequest.transfer.txHash)
            : null,
        };
      }),
      canPay: payableAssets(settings).length > 0,
    };
  });
