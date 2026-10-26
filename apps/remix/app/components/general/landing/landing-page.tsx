import {
  type BillingInterval,
  formatUsd,
  INCLUDED_SEATS,
  PLAN_PRICES_CENTS,
  SENDS_PER_MONTH,
} from '@documenso/billing/plan';
import { LanguageToggle } from '@documenso/ui/components/common/language-toggle';
import { cn } from '@documenso/ui/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@documenso/ui/primitives/accordion';
import { Button } from '@documenso/ui/primitives/button';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  CheckIcon,
  FileSignatureIcon,
  FileTextIcon,
  GlobeIcon,
  LinkIcon,
  ScrollTextIcon,
  SendIcon,
  ShieldCheckIcon,
  UploadIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { BrandingLogo } from '~/components/general/branding-logo';
import { PublicLegalLinks } from '~/components/general/public-legal-links';

const FEATURES = [
  {
    icon: GlobeIcon,
    title: msg`Hebrew, English and 10 more languages`,
    description: msg`The whole app, the emails and the signed PDF follow your language, right-to-left included.`,
  },
  {
    icon: LinkIcon,
    title: msg`Email or signing links`,
    description: msg`Send by email, or copy each signer's personal link and share it on WhatsApp or anywhere else.`,
  },
  {
    icon: ScrollTextIcon,
    title: msg`Templates and public links`,
    description: msg`Save the contracts you use every day and let clients fill and sign them from one link.`,
  },
  {
    icon: ShieldCheckIcon,
    title: msg`Audit trail and certificate`,
    description: msg`Every view and signature is logged, and the finished PDF is sealed with a signing certificate.`,
  },
  {
    icon: UsersIcon,
    title: msg`Built for teams`,
    description: msg`Invite your colleagues, share templates and see every document the team sends.`,
  },
  {
    icon: WalletIcon,
    title: msg`Pay with USDT or USDC`,
    description: msg`No card and no bank needed. Payments are confirmed on the blockchain automatically.`,
  },
];

const FAQ = [
  {
    question: msg`Are electronic signatures legally valid?`,
    answer: msg`Electronic signatures are recognised in most countries, including under Israel's Electronic Signature Law and the EU's eIDAS rules. Some documents have special requirements, so check with your lawyer for unusual cases.`,
  },
  {
    question: msg`Do the people I send to need an account?`,
    answer: msg`No. Signers open the document from the email or the link you share, sign in the browser, and receive the signed copy.`,
  },
  {
    question: msg`What counts as a send?`,
    answer: msg`Each document you send for signing, by email or by creating its signing links, is one send. Drafts, templates and reminders do not count.`,
  },
  {
    question: msg`How do I pay?`,
    answer: msg`From the billing page, choose monthly or yearly and pay in USDT (TRON, Ethereum or BNB Chain) or USDC (Ethereum). Your plan activates as soon as the payment is confirmed, usually within two minutes.`,
  },
  {
    question: msg`Can I add more people later?`,
    answer: msg`Yes. Extra seats are added from the billing page at any time; you pay only for the days left in the current period.`,
  },
  {
    question: msg`What happens if I don't renew?`,
    answer: msg`You get a reminder seven days before the period ends. If it ends unpaid, sending is paused until you pay. Your documents stay safe and documents already sent can still be signed.`,
  },
];

export const LandingPage = () => {
  const { _ } = useLingui();

  const [interval, setInterval] = useState<BillingInterval>('MONTH');

  const prices = PLAN_PRICES_CENTS[interval];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-between gap-4 px-4 md:px-8">
          <Link to="/" aria-label="Pactira" className="shrink-0">
            <BrandingLogo className="h-6 w-auto" />
          </Link>

          <nav className="hidden items-center gap-6 text-muted-foreground text-sm md:flex">
            <a href="#features" className="hover:text-foreground">
              <Trans>Features</Trans>
            </a>
            <a href="#how-it-works" className="hover:text-foreground">
              <Trans>How it works</Trans>
            </a>
            <a href="#pricing" className="hover:text-foreground">
              <Trans>Pricing</Trans>
            </a>
            <a href="#faq" className="hover:text-foreground">
              <Trans>FAQ</Trans>
            </a>
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:block">
              <LanguageToggle />
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/signin">
                <Trans>Sign in</Trans>
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/signup">
                <Trans>Get started</Trans>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-screen-xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:px-8 md:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-muted-foreground text-xs">
              <BadgeCheckIcon className="h-3.5 w-3.5 text-primary" />
              <Trans>Electronic signatures for teams</Trans>
            </p>

            <h1 className="mt-6 text-balance font-semibold text-4xl leading-tight tracking-tight md:text-5xl">
              <Trans>Get documents signed in minutes, not days.</Trans>
            </h1>

            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              <Trans>
                Upload a contract, mark where to sign, and send it by email or link. Track every step and get a sealed
                PDF with a full audit trail.
              </Trans>
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/signup">
                  <Trans>Create your account</Trans>
                  <ArrowRightIcon className="ms-2 h-4 w-4 rtl:-scale-x-100" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#pricing">
                  <Trans>See pricing</Trans>
                </a>
              </Button>
            </div>

            <p className="mt-4 text-muted-foreground text-sm">
              <Trans>Sign up in seconds. No email confirmation needed.</Trans>
            </p>
          </div>

          <HeroIllustration />
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t bg-muted/30">
          <div className="mx-auto max-w-screen-xl px-4 py-16 md:px-8 md:py-24">
            <h2 className="font-semibold text-3xl tracking-tight">
              <Trans>Everything you need to sign and send</Trans>
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              <Trans>One simple plan with the tools law offices, agencies and sales teams use every day.</Trans>
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title.id} className="rounded-xl border bg-background p-6">
                  <feature.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-4 font-medium">{_(feature.title)}</h3>
                  <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{_(feature.description)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-screen-xl scroll-mt-20 px-4 py-16 md:px-8 md:py-24">
          <h2 className="font-semibold text-3xl tracking-tight">
            <Trans>How it works</Trans>
          </h2>

          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            <Step number={1} icon={UploadIcon} title={msg`Upload`}>
              <Trans>Upload a PDF, or start from one of your templates.</Trans>
            </Step>
            <Step number={2} icon={FileSignatureIcon} title={msg`Add signers and fields`}>
              <Trans>Add who needs to sign and drag signature, date and text fields onto the page.</Trans>
            </Step>
            <Step number={3} icon={SendIcon} title={msg`Send and get it signed`}>
              <Trans>Send by email or link. Everyone signs from their phone, and you get the sealed PDF.</Trans>
            </Step>
          </ol>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 border-t bg-muted/30">
          <div className="mx-auto max-w-screen-xl px-4 py-16 md:px-8 md:py-24">
            <div className="text-center">
              <h2 className="font-semibold text-3xl tracking-tight">
                <Trans>Simple pricing</Trans>
              </h2>
              <p className="mt-3 text-muted-foreground">
                <Trans>One plan, everything included. Pay monthly or save 15% yearly.</Trans>
              </p>

              <div className="mt-6 inline-flex rounded-lg border bg-background p-1">
                {(['MONTH', 'YEAR'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setInterval(value)}
                    className={cn(
                      'rounded-md px-4 py-1.5 font-medium text-sm transition-colors',
                      interval === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {value === 'MONTH' ? <Trans>Monthly</Trans> : <Trans>Yearly (15% off)</Trans>}
                  </button>
                ))}
              </div>
            </div>

            <div className="mx-auto mt-10 max-w-md rounded-2xl border bg-background p-8 shadow-sm">
              <h3 className="font-semibold text-lg">
                <Trans>Pactira plan</Trans>
              </h3>

              <p className="mt-4 flex items-baseline gap-2">
                <span className="font-semibold text-4xl tracking-tight" dir="ltr">
                  {formatUsd(prices.base)}
                </span>
                <span className="text-muted-foreground">
                  {interval === 'MONTH' ? <Trans>/ month</Trans> : <Trans>/ year</Trans>}
                </span>
              </p>

              <ul className="mt-6 space-y-3 text-sm">
                <PlanItem>
                  <Trans>{INCLUDED_SEATS} team members included</Trans>
                </PlanItem>
                <PlanItem>
                  <Trans>{SENDS_PER_MONTH} documents sent per month</Trans>
                </PlanItem>
                <PlanItem>
                  <Trans>Unlimited drafts and templates</Trans>
                </PlanItem>
                <PlanItem>
                  <Trans>Signing links, audit trail and certificate</Trans>
                </PlanItem>
                <PlanItem>
                  {interval === 'MONTH' ? (
                    <Trans>Extra members {formatUsd(prices.seat)} each per month</Trans>
                  ) : (
                    <Trans>Extra members {formatUsd(prices.seat)} each per year</Trans>
                  )}
                </PlanItem>
              </ul>

              <Button className="mt-8 w-full" size="lg" asChild>
                <Link to="/signup">
                  <Trans>Get started</Trans>
                </Link>
              </Button>

              <p className="mt-4 text-center text-muted-foreground text-xs">
                <Trans>Pay with USDT on TRON, Ethereum or BNB Chain, or USDC on Ethereum.</Trans>
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16 md:px-8 md:py-24">
          <h2 className="font-semibold text-3xl tracking-tight">
            <Trans>Questions and answers</Trans>
          </h2>

          <Accordion type="single" collapsible className="mt-8">
            {FAQ.map((item) => (
              <AccordionItem key={item.question.id} value={item.question.id ?? ''}>
                <AccordionTrigger className="text-start">{_(item.question)}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">{_(item.answer)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Final call to action */}
        <section className="border-t">
          <div className="mx-auto flex max-w-screen-xl flex-col items-center px-4 py-16 text-center md:px-8 md:py-20">
            <h2 className="font-semibold text-3xl tracking-tight">
              <Trans>Ready to send your first document?</Trans>
            </h2>
            <p className="mt-3 text-muted-foreground">
              <Trans>Create your account now and have it signed today.</Trans>
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" asChild>
                <Link to="/signup">
                  <Trans>Create your account</Trans>
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/signin">
                  <Trans>Sign in</Trans>
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-screen-xl flex-col items-center justify-between gap-4 px-4 py-8 text-muted-foreground text-sm md:flex-row md:px-8">
          <div className="flex items-center gap-3">
            <BrandingLogo className="h-5 w-auto" />
            <span>© {new Date().getFullYear()} Pactira</span>
          </div>

          <PublicLegalLinks />

          <div className="sm:hidden">
            <LanguageToggle />
          </div>
        </div>
      </footer>
    </div>
  );
};

const Step = ({
  number,
  icon: Icon,
  title,
  children,
}: {
  number: number;
  icon: typeof UploadIcon;
  title: ReturnType<typeof msg>;
  children: React.ReactNode;
}) => {
  const { _ } = useLingui();

  return (
    <li className="rounded-xl border p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm">
          {number}
        </span>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mt-4 font-medium">{_(title)}</h3>
      <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{children}</p>
    </li>
  );
};

const PlanItem = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-3">
    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
    <span>{children}</span>
  </li>
);

/** A drawn document with signature fields, so the page needs no screenshots to stay current. */
const HeroIllustration = () => (
  <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
    <div className="absolute -inset-6 -z-10 rounded-3xl bg-primary/10 blur-2xl" />

    <div className="rounded-2xl border bg-background p-6 shadow-lg">
      <div className="flex items-center gap-3">
        <FileTextIcon className="h-5 w-5 text-muted-foreground" />
        <div className="h-3 w-40 rounded bg-muted" />
      </div>

      <div className="mt-6 space-y-2.5">
        <div className="h-2.5 w-full rounded bg-muted" />
        <div className="h-2.5 w-11/12 rounded bg-muted" />
        <div className="h-2.5 w-full rounded bg-muted" />
        <div className="h-2.5 w-4/5 rounded bg-muted" />
        <div className="h-2.5 w-full rounded bg-muted" />
        <div className="h-2.5 w-2/3 rounded bg-muted" />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="rounded-lg border-2 border-primary border-dashed bg-primary/5 p-3">
          <div className="h-2 w-12 rounded bg-primary/40" />
          <svg viewBox="0 0 120 40" className="mt-2 h-8 w-full text-foreground">
            <path
              d="M4 30 C 18 6, 26 34, 38 18 S 58 8, 64 24 S 84 34, 96 14 L 116 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="rounded-lg border-2 border-muted-foreground/30 border-dashed p-3">
          <div className="h-2 w-12 rounded bg-muted" />
          <div className="mt-4 h-2.5 w-20 rounded bg-muted" />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-lg bg-muted/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <div className="h-2.5 w-24 rounded bg-muted-foreground/30" />
        </div>
        <CheckIcon className="h-4 w-4 text-primary" />
      </div>
    </div>
  </div>
);
