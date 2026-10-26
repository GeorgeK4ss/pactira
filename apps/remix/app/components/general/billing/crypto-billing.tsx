import {
  type BillingInterval,
  formatUsd,
  INCLUDED_SEATS,
  intervalStartBefore,
  PLAN_PRICES_CENTS,
  proratedSeatsCents,
  renewalAmountCents,
} from '@documenso/billing/plan';
import { useCurrentOrganisation } from '@documenso/lib/client-only/providers/organisation';
import { AppError } from '@documenso/lib/errors/app-error';
import { canExecuteOrganisationAction } from '@documenso/lib/utils/organisations';
import { trpc } from '@documenso/trpc/react';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@documenso/ui/primitives/table';
import { Tabs, TabsList, TabsTrigger } from '@documenso/ui/primitives/tabs';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { ExternalLinkIcon, Loader, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { match } from 'ts-pattern';

export const CryptoBilling = () => {
  const { t, i18n } = useLingui();
  const { toast } = useToast();
  const navigate = useNavigate();

  const organisation = useCurrentOrganisation();
  const canManageBilling = canExecuteOrganisationAction('MANAGE_BILLING', organisation.currentOrganisationRole);

  const { data, isLoading } = trpc.enterprise.billing.crypto.get.useQuery({ organisationId: organisation.id });

  const { mutateAsync: createInvoice, isPending: isCreatingInvoice } =
    trpc.enterprise.billing.crypto.createInvoice.useMutation();
  const { mutateAsync: addSeats, isPending: isAddingSeats } = trpc.enterprise.billing.crypto.addSeats.useMutation();

  const [interval, setInterval] = useState<BillingInterval>('MONTH');
  const [seatsToAdd, setSeatsToAdd] = useState(1);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center rounded-lg py-32">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { subscription, seats, invoices, isPaymentRequired, canPay } = data;
  const isActive = !isPaymentRequired && subscription?.status === 'ACTIVE';
  const extraSeats = subscription?.extraSeats ?? 0;

  const payPath = (invoiceId: string) => `/o/${organisation.url}/settings/billing/pay/${invoiceId}`;

  const onError = (err: unknown) => {
    const error = AppError.parseError(err);

    toast({
      title: t`Something went wrong`,
      description: error.message || t`Please try again.`,
      variant: 'destructive',
    });
  };

  const onPayPlan = async () => {
    try {
      const { invoiceId } = await createInvoice({ organisationId: organisation.id, interval });
      await navigate(payPath(invoiceId));
    } catch (err) {
      onError(err);
    }
  };

  const onAddSeats = async () => {
    try {
      const { invoiceId } = await addSeats({ organisationId: organisation.id, seats: seatsToAdd });
      await navigate(payPath(invoiceId));
    } catch (err) {
      onError(err);
    }
  };

  const seatQuote =
    isActive && subscription?.periodEnd && subscription.interval
      ? proratedSeatsCents({
          interval: subscription.interval,
          seats: seatsToAdd,
          periodStart: intervalStartBefore(new Date(subscription.periodEnd), subscription.interval),
          periodEnd: new Date(subscription.periodEnd),
        })
      : 0;

  const prices = PLAN_PRICES_CENTS[interval];

  return (
    <div>
      <h3 className="font-semibold text-2xl">
        <Trans>Billing</Trans>
      </h3>

      <div className="mt-2 text-muted-foreground text-sm">
        {isActive && subscription?.periodEnd ? (
          <p>
            <Trans>
              Your Pactira plan is active until{' '}
              <span className="font-semibold">{i18n.date(subscription.periodEnd, { dateStyle: 'long' })}</span>.
            </Trans>
          </p>
        ) : subscription?.periodEnd ? (
          <p>
            <Trans>
              Your plan ended on{' '}
              <span className="font-semibold">{i18n.date(subscription.periodEnd, { dateStyle: 'long' })}</span>. Pay to
              continue sending documents.
            </Trans>
          </p>
        ) : (
          <p>
            <Trans>This organisation is not active yet. Pay for the plan to start sending documents.</Trans>
          </p>
        )}
      </div>

      <hr className="my-4" />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>
                <Trans>Pactira plan</Trans>
              </CardTitle>
              <CardDescription className="mt-1">
                <Trans>{INCLUDED_SEATS} seats included. Each extra seat is billed per seat.</Trans>
              </CardDescription>
            </div>

            <Tabs value={interval} onValueChange={(value) => setInterval(value as BillingInterval)}>
              <TabsList>
                <TabsTrigger className="min-w-[90px]" value="MONTH">
                  <Trans>Monthly</Trans>
                </TabsTrigger>
                <TabsTrigger className="min-w-[90px]" value="YEAR">
                  <Trans>Yearly (15% off)</Trans>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="space-y-1">
              <p className="font-semibold text-3xl">
                {formatUsd(prices.base)}
                <span className="font-normal text-base text-muted-foreground">
                  {' '}
                  {interval === 'MONTH' ? <Trans>/ month</Trans> : <Trans>/ year</Trans>}
                </span>
              </p>
              <p className="text-muted-foreground text-sm">
                {interval === 'MONTH' ? (
                  <Trans>+ {formatUsd(prices.seat)} per extra seat / month</Trans>
                ) : (
                  <Trans>+ {formatUsd(prices.seat)} per extra seat / year</Trans>
                )}
              </p>
              {extraSeats > 0 && (
                <p className="text-sm">
                  <Trans>
                    With your {extraSeats} extra seats:{' '}
                    <span className="font-semibold">{formatUsd(renewalAmountCents(interval, extraSeats))}</span>
                  </Trans>
                </p>
              )}
            </div>

            {canManageBilling && (
              <div className="flex flex-col items-end gap-2">
                <Button onClick={onPayPlan} loading={isCreatingInvoice} disabled={!canPay}>
                  {isActive ? <Trans>Renew early with crypto</Trans> : <Trans>Pay with crypto</Trans>}
                </Button>
                {!canPay && (
                  <p className="text-muted-foreground text-xs">
                    <Trans>Crypto payments are not set up yet. Please contact support.</Trans>
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="mt-4 text-muted-foreground text-xs">
            <Trans>We accept USDT and USDC. Payments are checked on the blockchain automatically.</Trans>
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5" />
            <Trans>Seats</Trans>
          </CardTitle>
          <CardDescription className="mt-1">
            <Trans>
              {seats.members} members and {seats.invites} pending invitations, out of {seats.cap} seats.
            </Trans>
          </CardDescription>
        </CardHeader>

        {canManageBilling && (
          <CardContent>
            {isActive ? (
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="seats-to-add">
                    <Trans>Seats to add</Trans>
                  </Label>
                  <Input
                    id="seats-to-add"
                    className="w-28"
                    type="number"
                    min={1}
                    max={500}
                    value={seatsToAdd}
                    onChange={(e) => setSeatsToAdd(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  />
                </div>

                <Button onClick={onAddSeats} loading={isAddingSeats} disabled={!canPay}>
                  <Trans>Add seats for {formatUsd(seatQuote)}</Trans>
                </Button>

                <p className="basis-full text-muted-foreground text-xs">
                  <Trans>
                    You pay now for the rest of the current period. From the next renewal each seat is billed at the
                    normal price.
                  </Trans>
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                <Trans>Activate the plan first, then you can add seats.</Trans>
              </p>
            )}
          </CardContent>
        )}
      </Card>

      <div className="mt-8">
        <h4 className="font-semibold text-lg">
          <Trans>Invoices</Trans>
        </h4>

        {invoices.length === 0 ? (
          <p className="mt-2 text-muted-foreground text-sm">
            <Trans>No invoices yet.</Trans>
          </p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans>Invoice</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Period</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Amount</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Status</Trans>
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    {invoice.kind === 'RENEWAL' ? (
                      invoice.interval === 'YEAR' ? (
                        <Trans>Pactira plan, yearly</Trans>
                      ) : (
                        <Trans>Pactira plan, monthly</Trans>
                      )
                    ) : (
                      <Trans>{invoice.extraSeats} extra seats</Trans>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {i18n.date(invoice.periodStart, { dateStyle: 'medium' })} –{' '}
                    {i18n.date(invoice.periodEnd, { dateStyle: 'medium' })}
                  </TableCell>
                  <TableCell>{formatUsd(invoice.amountCents)}</TableCell>
                  <TableCell>
                    {match(invoice.status)
                      .with('PAID', () => (
                        <Badge variant="default">
                          <Trans>Paid</Trans>
                        </Badge>
                      ))
                      .with('OPEN', () => (
                        <Badge variant="warning">
                          <Trans>Open</Trans>
                        </Badge>
                      ))
                      .otherwise(() => (
                        <Badge variant="neutral">
                          <Trans>Cancelled</Trans>
                        </Badge>
                      ))}
                  </TableCell>
                  <TableCell className="text-right">
                    {invoice.status === 'OPEN' && canManageBilling && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={payPath(invoice.id)}>
                          <Trans>Pay</Trans>
                        </Link>
                      </Button>
                    )}
                    {invoice.txUrl && (
                      <a
                        href={invoice.txUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                      >
                        <Trans>Transaction</Trans>
                        <ExternalLinkIcon className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};
