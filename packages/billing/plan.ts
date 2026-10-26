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

/**
 * Documents an organisation can send for signing per billing month (emailed or as signing links;
 * yearly plans reset monthly too). Uploads and drafts are not limited.
 */
export const SENDS_PER_MONTH = 250;

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
 * Charge for adding `seats` now until `periodEnd`, priced per day of a billing interval
 * (`periodStart`..`periodEnd` is one interval; see `intervalStartBefore`). Whole days, rounded up so
 * the first day is never free. Never below $1.00.
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
  // Not capped at totalDays: a period renewed early can run more than one interval ahead.
  const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / day));

  const cents = Math.ceil((PLAN_PRICES_CENTS[interval].seat * seats * daysLeft) / totalDays);

  return Math.max(MINIMUM_SEAT_CHARGE_CENTS, cents);
};

/** Start of the billing interval that ends at `end`. */
export const intervalStartBefore = (end: Date, interval: BillingInterval) =>
  shiftMonths(end, interval === 'YEAR' ? -12 : -1);

const shiftMonths = (date: Date, months: number) => {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));

  return result;
};

/**
 * Adds one billing interval in UTC, keeping the day of month where it exists
 * (Jan 31 + 1 month = Feb 28/29).
 */
export const addInterval = (date: Date, interval: BillingInterval) => shiftMonths(date, interval === 'YEAR' ? 12 : 1);

/**
 * Where a paid renewal starts: at the end of the current period if it has not passed yet,
 * otherwise now (a lapsed organisation does not pay for the days it was restricted).
 */
export const nextPeriodStart = (periodEnd: Date | null, now: Date = new Date()) =>
  periodEnd && periodEnd.getTime() > now.getTime() ? periodEnd : now;

export const formatUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Start of the billing month that `now` falls in, counted back in whole months from the period end
 * so the count resets on the same day each month (the day the plan renews).
 */
export const usageMonthStart = (periodEnd: Date, now: Date = new Date()) => {
  // A period paid early can run up to two intervals ahead, so look back far enough for that.
  for (let months = 1; months <= 36; months++) {
    const start = shiftMonths(periodEnd, -months);

    if (start.getTime() <= now.getTime()) {
      return start;
    }
  }

  return shiftMonths(now, -1);
};
