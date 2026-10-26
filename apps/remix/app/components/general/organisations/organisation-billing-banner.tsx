import { useOptionalCurrentOrganisation } from '@documenso/lib/client-only/providers/organisation';
import { IS_CRYPTO_BILLING_ENABLED, SUPPORT_EMAIL } from '@documenso/lib/constants/app';
import { isOrganisationPendingPayment } from '@documenso/lib/utils/billing';
import { canExecuteOrganisationAction } from '@documenso/lib/utils/organisations';
import { trpc } from '@documenso/trpc/react';
import { cn } from '@documenso/ui/lib/utils';
import { Alert, AlertDescription } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@documenso/ui/primitives/dialog';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { SubscriptionStatus } from '@prisma/client';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { match } from 'ts-pattern';

export const OrganisationBillingBanner = () => {
  const { _ } = useLingui();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);

  const organisation = useOptionalCurrentOrganisation();

  const { mutateAsync: manageSubscription, isPending } = trpc.enterprise.billing.subscription.manage.useMutation();

  const handleCreatePortal = async (organisationId: string) => {
    try {
      const { redirectUrl } = await manageSubscription({ organisationId });

      window.open(redirectUrl, '_blank');

      setIsOpen(false);
    } catch (err) {
      toast({
        title: _(msg`Something went wrong`),
        description: _(
          msg`We are unable to proceed to the billing portal at this time. Please try again, or contact support.`,
        ),
        variant: 'destructive',
        duration: 10000,
      });
    }
  };

  const bannerVariant = getBannerVariant(organisation);

  if (!organisation || bannerVariant === null) {
    return null;
  }

  if (IS_CRYPTO_BILLING_ENABLED()) {
    return <CryptoBillingBanner organisation={organisation} variant={bannerVariant} />;
  }

  if (bannerVariant === 'RENEWAL_DUE') {
    return null;
  }

  return (
    <>
      <div
        className={cn({
          'bg-yellow-200 text-yellow-900 dark:bg-yellow-400': bannerVariant === 'PAST_DUE',
          'bg-destructive text-destructive-foreground':
            bannerVariant === 'INACTIVE' || bannerVariant === 'PENDING_PAYMENT',
        })}
      >
        <div className="mx-auto flex max-w-screen-xl items-center justify-center gap-x-4 px-4 py-2 font-medium text-sm">
          <div className="flex items-center">
            <AlertTriangle className="me-2.5 h-5 w-5" />

            {match(bannerVariant)
              .with('PAST_DUE', () => <Trans>Payment overdue</Trans>)
              .with('INACTIVE', () => <Trans>Restricted Access</Trans>)
              .with('PENDING_PAYMENT', () => <Trans>Payment required</Trans>)
              .exhaustive()}
          </div>

          <Button
            variant="outline"
            className={cn({
              'text-yellow-900 hover:bg-yellow-100 dark:hover:bg-yellow-500': bannerVariant === 'PAST_DUE',
              'text-destructive-foreground hover:bg-destructive hover:text-white':
                bannerVariant === 'INACTIVE' || bannerVariant === 'PENDING_PAYMENT',
            })}
            disabled={isPending}
            onClick={() => setIsOpen(true)}
            size="sm"
          >
            <Trans>Resolve</Trans>
          </Button>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={(value) => !isPending && setIsOpen(value)}>
        {match(bannerVariant)
          .with('PAST_DUE', () => (
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  <Trans>Payment overdue</Trans>
                </DialogTitle>

                <DialogDescription>
                  <Trans>Your payment is overdue. Please settle the payment to avoid any service disruptions.</Trans>
                </DialogDescription>
              </DialogHeader>

              {canExecuteOrganisationAction('MANAGE_BILLING', organisation.currentOrganisationRole) && (
                <DialogFooter>
                  <Button loading={isPending} onClick={async () => handleCreatePortal(organisation.id)}>
                    <Trans>Resolve payment</Trans>
                  </Button>
                </DialogFooter>
              )}
            </DialogContent>
          ))
          .with('INACTIVE', () => (
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  <Trans>Subscription invalid</Trans>
                </DialogTitle>

                <DialogDescription>
                  <Trans>Your plan is no longer valid. Please subscribe to a new plan to continue using Pactira.</Trans>
                </DialogDescription>
              </DialogHeader>

              <Alert variant="neutral">
                <AlertDescription>
                  <Trans>
                    If there is any issue with your subscription, please contact us at{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
                  </Trans>
                </AlertDescription>
              </Alert>

              {canExecuteOrganisationAction('MANAGE_BILLING', organisation.currentOrganisationRole) && (
                <DialogFooter>
                  <DialogClose asChild>
                    <Button asChild>
                      <Link to={`/o/${organisation.url}/settings/billing`}>
                        <Trans>Manage Billing</Trans>
                      </Link>
                    </Button>
                  </DialogClose>
                </DialogFooter>
              )}
            </DialogContent>
          ))
          .with('PENDING_PAYMENT', () => (
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  <Trans>Payment required</Trans>
                </DialogTitle>

                <DialogDescription>
                  <Trans>This organisation is awaiting payment. Complete checkout to unlock it.</Trans>
                </DialogDescription>
              </DialogHeader>

              <Alert variant="neutral">
                <AlertDescription>
                  <Trans>
                    If there is any issue with your subscription, please contact us at{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
                  </Trans>
                </AlertDescription>
              </Alert>

              {canExecuteOrganisationAction('MANAGE_BILLING', organisation.currentOrganisationRole) && (
                <DialogFooter>
                  <DialogClose asChild>
                    <Button asChild>
                      <Link to={`/o/${organisation.url}/settings/billing`}>
                        <Trans>Manage Billing</Trans>
                      </Link>
                    </Button>
                  </DialogClose>
                </DialogFooter>
              )}
            </DialogContent>
          ))
          .exhaustive()}
      </Dialog>
    </>
  );
};

type BannerVariant = 'PAST_DUE' | 'INACTIVE' | 'PENDING_PAYMENT' | 'RENEWAL_DUE';

/** Days before the period ends that a paid organisation is reminded to renew (matches the renewal invoice). */
const RENEWAL_REMINDER_DAYS = 7;

const getBannerVariant = (organisation: ReturnType<typeof useOptionalCurrentOrganisation>): BannerVariant | null => {
  if (!organisation) {
    return null;
  }

  if (isOrganisationPendingPayment(organisation)) {
    return 'PENDING_PAYMENT';
  }

  const periodEnd = organisation.subscription?.periodEnd;

  if (
    IS_CRYPTO_BILLING_ENABLED() &&
    periodEnd &&
    new Date(periodEnd).getTime() - Date.now() < RENEWAL_REMINDER_DAYS * 24 * 60 * 60 * 1000
  ) {
    return 'RENEWAL_DUE';
  }

  const subscriptionStatus = organisation.subscription?.status;

  if (subscriptionStatus === SubscriptionStatus.PAST_DUE) {
    return 'PAST_DUE';
  }

  if (subscriptionStatus === SubscriptionStatus.INACTIVE) {
    return 'INACTIVE';
  }

  return null;
};

/** Crypto billing: no checkout portal, so the banner links straight to the billing page. */
const CryptoBillingBanner = ({
  organisation,
  variant,
}: {
  organisation: NonNullable<ReturnType<typeof useOptionalCurrentOrganisation>>;
  variant: BannerVariant;
}) => {
  const { i18n } = useLingui();

  const isWarning = variant === 'RENEWAL_DUE' || variant === 'PAST_DUE';
  const periodEnd = organisation.subscription?.periodEnd;

  return (
    <div
      className={cn({
        'bg-yellow-200 text-yellow-900 dark:bg-yellow-400': isWarning,
        'bg-destructive text-destructive-foreground': !isWarning,
      })}
    >
      <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2 font-medium text-sm">
        <div className="flex items-center">
          <AlertTriangle className="me-2.5 h-5 w-5 shrink-0" />

          {variant === 'RENEWAL_DUE' && periodEnd ? (
            <Trans>Your plan ends on {i18n.date(periodEnd, { dateStyle: 'medium' })}. Pay to keep access.</Trans>
          ) : (
            <Trans>Payment required to send documents</Trans>
          )}
        </div>

        {canExecuteOrganisationAction('MANAGE_BILLING', organisation.currentOrganisationRole) && (
          <Button
            variant="outline"
            size="sm"
            className={cn({
              'text-yellow-900 hover:bg-yellow-100 dark:hover:bg-yellow-500': isWarning,
              'text-destructive-foreground hover:bg-destructive hover:text-white': !isWarning,
            })}
            asChild
          >
            <Link to={`/o/${organisation.url}/settings/billing`}>
              <Trans>Pay now</Trans>
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
};
