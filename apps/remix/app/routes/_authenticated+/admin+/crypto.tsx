import { ASSETS, type CryptoNetwork, NETWORKS } from '@documenso/billing/crypto/config';
import { formatUsd } from '@documenso/billing/plan';
import { AppError } from '@documenso/lib/errors/app-error';
import { SITE_SETTINGS_CRYPTO_PAYMENTS_ID } from '@documenso/lib/server-only/site-settings/schemas/crypto-payments';
import { trpc } from '@documenso/trpc/react';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { Switch } from '@documenso/ui/primitives/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@documenso/ui/primitives/table';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Loader } from 'lucide-react';
import { useEffect, useState } from 'react';

import { appMetaTags } from '~/utils/meta';

export function meta() {
  return appMetaTags(msg`Crypto payments`);
}

const NETWORK_KEYS: CryptoNetwork[] = ['tron', 'ethereum', 'bsc'];

export default function AdminCryptoPage() {
  const { t, i18n } = useLingui();
  const { toast } = useToast();

  const { data, isLoading, refetch } = trpc.admin.crypto.get.useQuery();
  const { mutateAsync: saveSetting, isPending: isSaving } = trpc.admin.updateSiteSetting.useMutation();
  const { mutateAsync: markPaid } = trpc.admin.crypto.markInvoicePaid.useMutation();
  const { mutateAsync: createInvoice, isPending: isCreatingInvoice } = trpc.admin.crypto.createInvoice.useMutation();
  const { mutateAsync: runTick, isPending: isRunningTick } = trpc.admin.crypto.runTick.useMutation();

  const [enabled, setEnabled] = useState(false);
  const [addresses, setAddresses] = useState<Record<CryptoNetwork, string>>({ tron: '', ethereum: '', bsc: '' });
  const [assets, setAssets] = useState<Record<string, boolean>>({});
  const [ttlHours, setTtlHours] = useState(24);

  const [invoiceOrgId, setInvoiceOrgId] = useState('');
  const [invoiceInterval, setInvoiceInterval] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [invoiceAmount, setInvoiceAmount] = useState('');

  useEffect(() => {
    if (!data?.setting) {
      return;
    }

    setEnabled(data.setting.enabled);
    setAddresses(data.setting.data.addresses);
    setAssets(data.setting.data.assets);
    setTtlHours(data.setting.data.requestTtlHours);
  }, [data?.setting]);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center rounded-lg py-32">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const onError = (err: unknown) =>
    toast({ title: t`Something went wrong`, description: AppError.parseError(err).message, variant: 'destructive' });

  const onSave = async () => {
    try {
      await saveSetting({
        id: SITE_SETTINGS_CRYPTO_PAYMENTS_ID,
        enabled,
        data: { addresses, assets, requestTtlHours: ttlHours },
      });
      await refetch();
      toast({ title: t`Saved` });
    } catch (err) {
      onError(err);
    }
  };

  const onMarkPaid = async (invoiceId: string) => {
    try {
      await markPaid({ invoiceId });
      await refetch();
      toast({ title: t`Invoice marked paid` });
    } catch (err) {
      onError(err);
    }
  };

  const onCreateInvoice = async () => {
    try {
      const cents = invoiceAmount ? Math.round(Number(invoiceAmount) * 100) : undefined;
      const { invoiceId } = await createInvoice({
        organisationId: invoiceOrgId.trim(),
        interval: invoiceInterval,
        amountCents: cents,
      });
      await refetch();
      toast({ title: t`Invoice created`, description: invoiceId });
    } catch (err) {
      onError(err);
    }
  };

  const onRunTick = async () => {
    try {
      await runTick();
      await refetch();
      toast({ title: t`Checked the blockchain` });
    } catch (err) {
      onError(err);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-4xl">
          <Trans>Crypto payments</Trans>
        </h2>
        <Button variant="outline" onClick={onRunTick} loading={isRunningTick}>
          <Trans>Check now</Trans>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans>Receiving wallets</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>
              Public addresses only. Customers send here and the server watches these addresses on the blockchain. Never
              enter a private key or seed phrase.
            </Trans>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3">
            <Switch id="crypto-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="crypto-enabled">
              <Trans>Accept crypto payments</Trans>
            </Label>
          </div>

          {NETWORK_KEYS.map((network) => {
            const value = addresses[network];
            const isInvalid =
              Boolean(value) && !data.validAddresses[network] && data.setting?.data.addresses[network] === value;

            return (
              <div key={network} className="space-y-1.5">
                <Label htmlFor={`address-${network}`}>{NETWORKS[network].label}</Label>
                <Input
                  id={`address-${network}`}
                  dir="ltr"
                  className="font-mono"
                  value={value}
                  placeholder={network === 'tron' ? 'T…' : '0x…'}
                  onChange={(e) => setAddresses((prev) => ({ ...prev, [network]: e.target.value }))}
                />
                {isInvalid && (
                  <p className="text-destructive text-xs">
                    <Trans>This is not a valid address for this network, so it is not used.</Trans>
                  </p>
                )}
              </div>
            );
          })}

          <div className="space-y-2">
            <Label>
              <Trans>Coins customers can pay with</Trans>
            </Label>
            <div className="flex flex-wrap gap-4">
              {ASSETS.map((asset) => (
                <label key={asset.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={assets[asset.key] !== false}
                    onCheckedChange={(checked) => setAssets((prev) => ({ ...prev, [asset.key]: checked === true }))}
                  />
                  {asset.asset} · {NETWORKS[asset.network].label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ttl">
              <Trans>Hours a payment amount stays reserved</Trans>
            </Label>
            <Input
              id="ttl"
              type="number"
              className="w-28"
              min={1}
              max={168}
              value={ttlHours}
              onChange={(e) => setTtlHours(Math.max(1, Math.min(168, Number(e.target.value) || 24)))}
            />
          </div>

          <Button onClick={onSave} loading={isSaving}>
            <Trans>Save</Trans>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans>Watchers</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>When each coin was last read from the blockchain, and the last error if any.</Trans>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.cursors.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              <Trans>Nothing checked yet.</Trans>
            </p>
          ) : (
            <Table>
              <TableBody>
                {data.cursors.map((cursor) => (
                  <TableRow key={`${cursor.network}:${cursor.asset}:${cursor.address}`}>
                    <TableCell>
                      {cursor.asset} · {NETWORKS[cursor.network as CryptoNetwork]?.label ?? cursor.network}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cursor.lastSyncAt
                        ? i18n.date(cursor.lastSyncAt, { dateStyle: 'short', timeStyle: 'medium' })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {cursor.lastError ? (
                        <span className="text-destructive text-xs">{cursor.lastError}</span>
                      ) : (
                        <Badge>
                          <Trans>OK</Trans>
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans>Open invoices</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {data.openInvoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              <Trans>No open invoices.</Trans>
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Trans>Organisation</Trans>
                  </TableHead>
                  <TableHead>
                    <Trans>Invoice</Trans>
                  </TableHead>
                  <TableHead>
                    <Trans>Amount</Trans>
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.openInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{invoice.organisation}</TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">
                      {invoice.kind} · {invoice.interval} · {invoice.id}
                    </TableCell>
                    <TableCell>{formatUsd(invoice.amountCents)}</TableCell>
                    <TableCell className="text-end">
                      <Button size="sm" variant="outline" onClick={async () => onMarkPaid(invoice.id)}>
                        <Trans>Mark paid</Trans>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="space-y-2 rounded-lg border p-4">
            <p className="font-medium text-sm">
              <Trans>Create an invoice for an organisation</Trans>
            </p>
            <p className="text-muted-foreground text-xs">
              <Trans>
                Leave the amount empty for the normal plan price. A custom amount is useful for deals or a small live
                test.
              </Trans>
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                className="w-72 font-mono"
                dir="ltr"
                placeholder={t`Organisation ID (org_…)`}
                value={invoiceOrgId}
                onChange={(e) => setInvoiceOrgId(e.target.value)}
              />
              <select
                className="rounded-md border bg-background px-3 text-sm"
                value={invoiceInterval}
                onChange={(e) => setInvoiceInterval(e.target.value as 'MONTH' | 'YEAR')}
              >
                <option value="MONTH">{t`Monthly`}</option>
                <option value="YEAR">{t`Yearly`}</option>
              </select>
              <Input
                className="w-32"
                dir="ltr"
                placeholder={t`Amount (USD)`}
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
              />
              <Button onClick={onCreateInvoice} loading={isCreatingInvoice} disabled={!invoiceOrgId.trim()}>
                <Trans>Create</Trans>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans>Payments in progress</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.requests.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              <Trans>None.</Trans>
            </p>
          ) : (
            <Table>
              <TableBody>
                {data.requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{request.organisation}</TableCell>
                    <TableCell dir="ltr">
                      {request.amount} {request.asset} · {NETWORKS[request.network as CryptoNetwork]?.label}
                    </TableCell>
                    <TableCell>
                      <Badge variant={request.status === 'SEEN' ? 'default' : 'warning'}>{request.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i18n.date(request.expiresAt, { dateStyle: 'short', timeStyle: 'short' })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans>Incoming transfers</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>Every transfer seen on the receiving wallets. Unmatched ones were not linked to an invoice.</Trans>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.transfers.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              <Trans>None yet.</Trans>
            </p>
          ) : (
            <Table>
              <TableBody>
                {data.transfers.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell dir="ltr">
                      {transfer.amount} {transfer.asset}
                    </TableCell>
                    <TableCell>
                      <a
                        href={NETWORKS[transfer.network as CryptoNetwork]?.explorerTx(transfer.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-primary text-xs hover:underline"
                        dir="ltr"
                      >
                        {transfer.txHash.slice(0, 10)}…
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {transfer.blockTime
                        ? i18n.date(transfer.blockTime, { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {transfer.matchedTo ? (
                        <Badge>{transfer.matchedTo}</Badge>
                      ) : (
                        <Badge variant="neutral">
                          <Trans>Unmatched</Trans>
                        </Badge>
                      )}
                      {!transfer.confirmed && (
                        <Badge variant="warning" className="ms-2">
                          <Trans>Unconfirmed</Trans>
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
