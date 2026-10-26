/**
 * The single Pactira plan. Amounts are in US cents.
 *
 * Yearly is 15% off twelve months: 129 × 12 × 0.85 = 1,315.80 and 9 × 12 × 0.85 = 91.80.
 */
export const INCLUDED_SEATS = 3;

export type BillingInterval = 'MONTH' | 'YEAR';

export const PLAN_PRICES_CENTS: Record<BillingInterval, { base: number; seat: number }> = {
  MONTH: { base: 12_900, seat: 900 },
  YEAR: { base: 131_580, seat: 9_180 },
};

export const MINIMUM_SEAT_CHARGE_CENTS = 100;

export const seatCap = (extraSeats: number) => INCLUDED_SEATS + Math.max(0, extraSeats);

export const renewalAmountCents = (interval: BillingInterval, extraSeats: number) => {
  const prices = PLAN_PRICES_CENTS[interval];

  return prices.base + prices.seat * Math.max(0, extraSeats);
};

export type ProratedSeatsOptions = {
  interval: BillingInterval;
  seats: number;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
};

/**
 * Charge for adding `seats` now until the end of the current period, by the share of the period
 * that is left (whole days, rounded up so the first day is never free). Never below $1.00.
 */
export const proratedSeatsCents = ({
  interval,
  seats,
  periodStart,
  periodEnd,
  now = new Date(),
}: ProratedSeatsOptions) => {
  if (seats <= 0) {
    return 0;
  }

  const day = 24 * 60 * 60 * 1000;
  const totalDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / day));
  const daysLeft = Math.min(totalDays, Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / day)));

  const cents = Math.ceil((PLAN_PRICES_CENTS[interval].seat * seats * daysLeft) / totalDays);

  return Math.max(MINIMUM_SEAT_CHARGE_CENTS, cents);
};

/**
 * Adds one billing interval in UTC, keeping the day of month where it exists
 * (Jan 31 + 1 month = Feb 28/29).
 */
export const addInterval = (date: Date, interval: BillingInterval) => {
  const months = interval === 'YEAR' ? 12 : 1;

  const result = new Date(date.getTime());
  const day = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));

  return result;
};

/**
 * Where a paid renewal starts: at the end of the current period if it has not passed yet,
 * otherwise now (a lapsed organisation does not pay for the days it was restricted).
 */
export const nextPeriodStart = (periodEnd: Date | null, now: Date = new Date()) =>
  periodEnd && periodEnd.getTime() > now.getTime() ? periodEnd : now;

export const formatUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
