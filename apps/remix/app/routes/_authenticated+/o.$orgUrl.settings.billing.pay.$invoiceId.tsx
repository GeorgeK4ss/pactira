import { formatUsd } from '@documenso/billing/plan';
import { useCurrentOrganisation } from '@documenso/lib/client-only/providers/organisation';
import { AppError } from '@documenso/lib/errors/app-error';
import { trpc } from '@documenso/trpc/react';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Input } from '@documenso/ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@documenso/ui/primitives/radio-group';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { ArrowLeftIcon, CheckCircle2Icon, CopyIcon, ExternalLinkIcon, Loader } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useRevalidator } from 'react-router';
import { match } from 'ts-pattern';
import { renderSVG } from 'uqr';

import { appMetaTags } from '~/utils/meta';

import type { Route } from './+types/o.$orgUrl.settings.billing.pay.$invoiceId';

export function meta() {
  return appMetaTags(msg`Pay invoice`);
}

const POLL_INTERVAL_MS = 15_000;

const useCountdown = (until: Date | null) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(timer);
  }, [until]);

  if (!until) {
    return null;
  }

  const left = Math.max(0, until.getTime() - now);
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1_000);

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export default function PayInvoicePage({ params }: Route.ComponentProps) {
  const { t, i18n } = useLingui();
  const { toast } = useToast();
  const organisation = useCurrentOrganisation();
  const utils = trpc.useUtils();
  const revalidator = useRevalidator();

  const billingPath = `/o/${organisation.url}/settings/billing`;

  const { data, isLoading, refetch } = trpc.enterprise.billing.crypto.getInvoice.useQuery({
    organisationId: organisation.id,
    invoiceId: params.invoiceId,
  });

  const { mutateAsync: createPayment, isPending: isCreating } =
    trpc.enterprise.billing.crypto.createPayment.useMutation();
  const { mutateAsync: refreshPayment } = trpc.enterprise.billing.crypto.refreshPayment.useMutation();
  const { mutateAsync: submitTxHash, isPending: isSubmitting } =
    trpc.enterprise.billing.crypto.submitTxHash.useMutation();

  const [method, setMethod] = useState<string>('');
  const [hash, setHash] = useState('');

  const payment = data?.payment ?? null;
  const isOpen = payment?.status === 'PENDING' || payment?.status === 'SEEN';
  const countdown = useCountdown(payment?.status === 'PENDING' ? new Date(payment.expiresAt) : null);

  // While a payment is open, check the chain every 15 seconds.
  useEffect(() => {
    if (!payment || !isOpen) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshPayment({ organisationId: organisation.id, requestId: payment.id })
        .then(async (next) => {
          if (next.status !== payment.status) {
            await refetch();
            await utils.enterprise.billing.crypto.get.invalidate();

            // The organisation (and its "Payment required" banner) is loaded by the layout.
            if (next.status === 'PAID') {
              await revalidator.revalidate();
            }
          }
        })
        .catch(() => {
          // Polling failures are retried on the next tick.
        });
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [payment?.id, payment?.status]);

  useEffect(() => {
    if (!method && data?.methods[0]) {
      setMethod(`${data.methods[0].network}:${data.methods[0].asset}`);
    }
  }, [data?.methods]);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center rounded-lg py-32">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { invoice, methods } = data;

  const onStart = async () => {
    const [network, asset] = method.split(':');

    try {
      await createPayment({
        organisationId: organisation.id,
        invoiceId: invoice.id,
        network: network as 'tron' | 'ethereum' | 'bsc',
        asset: asset as 'USDT' | 'USDC',
      });
      await refetch();
    } catch (err) {
      toast({
        title: t`Could not start the payment`,
        description: AppError.parseError(err).message,
        variant: 'destructive',
      });
    }
  };

  const onCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: t`Copied` });
  };

  const onSubmitHash = async () => {
    if (!payment) {
      return;
    }

    try {
      const { result } = await submitTxHash({ organisationId: organisation.id, requestId: payment.id, hash });

      const message = match(result)
        .with('paid', () => t`Payment confirmed. Thank you!`)
        .with('seen', () => t`Payment found. Waiting for the network to confirm it.`)
        .with('invalid_hash', () => t`That does not look like a transaction ID for this network.`)
        .with('not_found', () => t`We could not find a transfer to our address in that transaction yet.`)
        .with('wrong_amount', () => t`That transaction's amount does not match this payment.`)
        .with('too_early', () => t`That transaction was sent before this payment was started.`)
        .with('unavailable', () => t`The network check is busy right now. Please try again in a minute.`)
        .with('already_used', () => t`That transaction has already been used for another payment.`)
        .with('not_payable', () => t`This payment can no longer be completed. Start a new one.`)
        .exhaustive();

      toast({
        title: message,
        variant: result === 'paid' || result === 'seen' ? 'default' : 'destructive',
      });

      await refetch();
      await utils.enterprise.billing.crypto.get.invalidate();

      if (result === 'paid') {
        await revalidator.revalidate();
      }
    } catch (err) {
      toast({ title: t`Something went wrong`, description: AppError.parseError(err).message, variant: 'destructive' });
    }
  };

  const title =
    invoice.kind === 'RENEWAL'
      ? invoice.interval === 'YEAR'
        ? t`Pactira plan, yearly`
        : t`Pactira plan, monthly`
      : t`${invoice.extraSeats} extra seats`;

  return (
    <div className="max-w-2xl">
      <Link
        to={billingPath}
        className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4 rtl:rotate-180" />
        <Trans>Back to billing</Trans>
      </Link>

      <h3 className="mt-4 font-semibold text-2xl">{title}</h3>
      <p className="mt-1 text-muted-foreground text-sm">
        {i18n.date(invoice.periodStart, { dateStyle: 'medium' })} –{' '}
        {i18n.date(invoice.periodEnd, { dateStyle: 'medium' })}
        {' · '}
        <span className="font-semibold text-foreground">{formatUsd(invoice.amountCents)}</span>
      </p>

      <hr className="my-4" />

      {invoice.status === 'PAID' || payment?.status === 'PAID' ? (
        <Alert variant="default">
          <CheckCircle2Icon className="h-4 w-4" />
          <AlertTitle>
            <Trans>Paid</Trans>
          </AlertTitle>
          <AlertDescription>
            <Trans>Thank you. Your payment was received and your plan is updated.</Trans>{' '}
            {payment?.txUrl && (
              <a
                href={payment.txUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                <Trans>View transaction</Trans>
              </a>
            )}
          </AlertDescription>
        </Alert>
      ) : invoice.status !== 'OPEN' ? (
        <Alert variant="destructive">
          <AlertDescription>
            <Trans>This invoice was cancelled. Go back to billing to create a new one.</Trans>
          </AlertDescription>
        </Alert>
      ) : !payment || !isOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <Trans>Choose how to pay</Trans>
            </CardTitle>
            <CardDescription>
              {payment?.status === 'EXPIRED' ? (
                <Trans>Your previous payment window expired. Choose again to get a fresh amount.</Trans>
              ) : (
                <Trans>Pay with a stablecoin from any wallet or exchange.</Trans>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {methods.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                <Trans>Crypto payments are not set up yet. Please contact support.</Trans>
              </p>
            ) : (
              <>
                <RadioGroup value={method} onValueChange={setMethod} className="grid gap-2 sm:grid-cols-2">
                  {methods.map((m) => {
                    const value = `${m.network}:${m.asset}`;

                    return (
                      <label
                        key={value}
                        htmlFor={value}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
                      >
                        <RadioGroupItem id={value} value={value} />
                        <span>
                          <span className="block font-medium">{m.asset}</span>
                          <span className="block text-muted-foreground text-xs">{m.networkLabel}</span>
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>

                <Button className="mt-4" onClick={onStart} loading={isCreating} disabled={!method}>
                  <Trans>Continue</Trans>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              <Trans>
                Send exactly {payment.amount} {payment.asset}
              </Trans>
            </CardTitle>
            <CardDescription>
              <Trans>on {payment.networkLabel}</Trans>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-6 sm:flex-row">
              <div
                className="h-48 w-48 shrink-0 rounded-lg border bg-white p-2"
                // The QR is generated locally from the address/amount; no user HTML is involved.
                dangerouslySetInnerHTML={{ __html: renderSVG(payment.uri) }}
              />

              <div className="min-w-0 flex-1 space-y-4">
                <div>
                  <p className="text-muted-foreground text-xs">
                    <Trans>Amount</Trans>
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-2xl" dir="ltr">
                      {payment.amount}
                    </span>
                    <span className="text-muted-foreground">{payment.asset}</span>
                    <Button size="sm" variant="ghost" onClick={async () => onCopy(payment.amount)}>
                      <CopyIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-muted-foreground text-xs">
                    <Trans>Address</Trans>
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="break-all font-mono text-sm" dir="ltr">
                      {payment.toAddress}
                    </span>
                    <Button size="sm" variant="ghost" onClick={async () => onCopy(payment.toAddress)}>
                      <CopyIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <p className="text-sm">
                  {payment.status === 'SEEN' ? (
                    <span className="inline-flex items-center gap-2 font-medium text-primary">
                      <Loader className="h-4 w-4 animate-spin" />
                      <Trans>Payment seen. Waiting for {payment.confirmations} network confirmations…</Trans>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader className="h-4 w-4 animate-spin" />
                      <Trans>Waiting for your payment. Time left: {countdown}</Trans>
                    </span>
                  )}
                </p>
              </div>
            </div>

            <Alert variant="warning">
              <AlertDescription>
                <Trans>
                  Send only {payment.asset} on {payment.networkLabel}, and exactly this amount. The cents are how we
                  recognise your payment. If your exchange takes a fee from the amount, paste the transaction ID below.
                </Trans>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <p className="font-medium text-sm">
                <Trans>Already sent it?</Trans>
              </p>
              <div className="flex gap-2">
                <Input
                  dir="ltr"
                  value={hash}
                  onChange={(e) => setHash(e.target.value)}
                  placeholder={t`Transaction ID (hash)`}
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  onClick={onSubmitHash}
                  loading={isSubmitting}
                  disabled={hash.trim().length < 10}
                >
                  <Trans>Check</Trans>
                </Button>
              </div>
              {payment.txUrl && (
                <a
                  href={payment.txUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                >
                  <Trans>View transaction</Trans>
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
