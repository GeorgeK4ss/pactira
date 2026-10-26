import { formatUsd } from '@documenso/billing/plan';
import { trpc } from '@documenso/trpc/react';
import { cn } from '@documenso/ui/lib/utils';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { Loader } from 'lucide-react';
import { useEffect, useState } from 'react';

type AdminCryptoPeriodPanelProps = {
  organisationId: string;
};

/** `YYYY-MM-DDTHH:mm` in local time, the value format of a datetime-local input. */
const toLocalInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const AdminCryptoPeriodPanel = ({ organisationId }: AdminCryptoPeriodPanelProps) => {
  const { t, i18n } = useLingui();
  const { toast } = useToast();

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.crypto.getOrganisation.useQuery({ organisationId });

  const [periodEnd, setPeriodEnd] = useState('');
  const [extraSeats, setExtraSeats] = useState('0');

  const subscription = data?.subscription ?? null;

  useEffect(() => {
    setPeriodEnd(subscription?.periodEnd ? toLocalInput(new Date(subscription.periodEnd)) : '');
    setExtraSeats(String(subscription?.extraSeats ?? 0));
  }, [subscription?.periodEnd, subscription?.extraSeats]);

  const { mutateAsync: setPeriod, isPending } = trpc.admin.crypto.setPeriod.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.admin.crypto.getOrganisation.invalidate(), utils.admin.organisation.get.invalidate()]);

      toast({ title: t`Billing period updated` });
    },
    onError: () => {
      toast({ title: t`Error`, description: t`We couldn't update the billing period.`, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="my-6 flex items-center justify-center rounded-lg border py-10">
        <Loader className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isActive =
    subscription?.status === 'ACTIVE' && subscription.periodEnd && new Date(subscription.periodEnd) > new Date();

  const seats = Math.max(0, Math.floor(Number(extraSeats) || 0));

  return (
    <div
      className={cn(
        'my-6 space-y-6 rounded-lg border p-6',
        isActive && 'border-green-600/20 bg-green-50 dark:border-green-500/20 dark:bg-green-500/10',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold text-base">
          <Trans>Billing period</Trans>
        </h3>
        <Badge variant={isActive ? 'default' : 'neutral'}>{isActive ? t`Active` : t`Not active`}</Badge>
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">
            <Trans>Period ends</Trans>
          </dt>
          <dd className="mt-1 font-medium">
            {subscription?.periodEnd
              ? i18n.date(subscription.periodEnd, { dateStyle: 'medium', timeStyle: 'short' })
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            <Trans>Billing interval</Trans>
          </dt>
          <dd className="mt-1 font-medium">
            {subscription?.interval === 'YEAR' ? t`Yearly` : subscription?.interval === 'MONTH' ? t`Monthly` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            <Trans>Extra seats</Trans>
          </dt>
          <dd className="mt-1 font-medium">{subscription?.extraSeats ?? 0}</dd>
        </div>
      </dl>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="admin-period-end">
            <Trans>New period end</Trans>
          </Label>
          <Input
            id="admin-period-end"
            type="datetime-local"
            dir="ltr"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-extra-seats">
            <Trans>Extra seats</Trans>
          </Label>
          <Input
            id="admin-extra-seats"
            type="number"
            min={0}
            dir="ltr"
            value={extraSeats}
            onChange={(e) => setExtraSeats(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          className="bg-background"
          loading={isPending}
          disabled={!periodEnd}
          onClick={async () =>
            setPeriod({ organisationId, action: 'set', periodEnd: new Date(periodEnd), extraSeats: seats })
          }
        >
          <Trans>Save</Trans>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="bg-background"
          loading={isPending}
          onClick={async () => setPeriod({ organisationId, action: 'extend' })}
        >
          <Trans>Extend by one period</Trans>
        </Button>
        <Button
          variant="destructive"
          loading={isPending}
          disabled={!isActive}
          onClick={async () => setPeriod({ organisationId, action: 'expire' })}
        >
          <Trans>Expire now</Trans>
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        <Trans>
          A renewal invoice is created 7 days before the period ends. When the period ends unpaid, the organisation is
          restricted at once.
        </Trans>
      </p>

      {data && data.invoices.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">
            <Trans>Invoices</Trans>
          </h4>
          <ul className="divide-y rounded-md border bg-background text-sm">
            {data.invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  {invoice.kind === 'SEATS' ? t`Extra seats` : t`Renewal`} · {formatUsd(invoice.amountCents)}
                </span>
                <span className="text-muted-foreground">{i18n.date(invoice.createdAt)}</span>
                <Badge variant={invoice.status === 'PAID' ? 'default' : 'neutral'}>
                  {invoice.status === 'PAID'
                    ? t`Paid`
                    : invoice.status === 'OPEN'
                      ? t({ message: 'Open', context: 'Invoice status' })
                      : t`Void`}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
