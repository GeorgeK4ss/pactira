import { describe, expect, it } from 'vitest';

import {
  addInterval,
  intervalStartBefore,
  nextPeriodStart,
  proratedSeatsCents,
  renewalAmountCents,
  seatCap,
} from './plan';

describe('renewalAmountCents', () => {
  it('charges the base plan plus each extra seat', () => {
    expect(renewalAmountCents('MONTH', 0)).toBe(12_900);
    expect(renewalAmountCents('MONTH', 2)).toBe(14_700);
    expect(renewalAmountCents('YEAR', 0)).toBe(131_580);
    expect(renewalAmountCents('YEAR', 1)).toBe(140_760);
  });
});

describe('seatCap', () => {
  it('includes three seats', () => {
    expect(seatCap(0)).toBe(3);
    expect(seatCap(4)).toBe(7);
  });
});

describe('proratedSeatsCents', () => {
  const periodStart = new Date('2026-10-01T00:00:00Z');
  const periodEnd = new Date('2026-10-31T00:00:00Z');

  it('charges the share of the period that is left, rounded up', () => {
    const now = new Date('2026-10-16T00:00:00Z');

    // 15 of 30 days left, 2 seats at $9: 900 * 2 * 15 / 30 = 900
    expect(proratedSeatsCents({ interval: 'MONTH', seats: 2, periodStart, periodEnd, now })).toBe(900);
  });

  it('counts a part day as a whole day', () => {
    const now = new Date('2026-10-30T23:00:00Z');

    // 1 day left: ceil(900 / 30) = 30 cents, raised to the $1.00 minimum
    expect(proratedSeatsCents({ interval: 'MONTH', seats: 1, periodStart, periodEnd, now })).toBe(100);
  });

  it('charges the full seat price at the start of the period', () => {
    expect(proratedSeatsCents({ interval: 'MONTH', seats: 1, periodStart, periodEnd, now: periodStart })).toBe(900);
  });

  it('charges nothing for zero seats', () => {
    expect(proratedSeatsCents({ interval: 'MONTH', seats: 0, periodStart, periodEnd })).toBe(0);
  });
});

describe('addInterval', () => {
  it('adds a month keeping the day', () => {
    expect(addInterval(new Date('2026-03-15T10:00:00Z'), 'MONTH').toISOString()).toBe('2026-04-15T10:00:00.000Z');
  });

  it('clamps to the last day of a shorter month', () => {
    expect(addInterval(new Date('2027-01-31T00:00:00Z'), 'MONTH').toISOString()).toBe('2027-02-28T00:00:00.000Z');
  });

  it('adds a year', () => {
    expect(addInterval(new Date('2026-10-27T00:00:00Z'), 'YEAR').toISOString()).toBe('2027-10-27T00:00:00.000Z');
  });
});

describe('nextPeriodStart', () => {
  const now = new Date('2026-10-27T00:00:00Z');

  it('continues from the current period end when paying early', () => {
    const end = new Date('2026-11-01T00:00:00Z');
    expect(nextPeriodStart(end, now)).toBe(end);
  });

  it('starts now when the period has already lapsed', () => {
    expect(nextPeriodStart(new Date('2026-10-20T00:00:00Z'), now)).toBe(now);
    expect(nextPeriodStart(null, now)).toBe(now);
  });
});

describe('seats bought while a renewal is prepaid', () => {
  it('charges per day of one interval, beyond a single interval', () => {
    const periodEnd = new Date('2026-12-01T00:00:00Z');
    const periodStart = intervalStartBefore(periodEnd, 'MONTH');
    const now = new Date('2026-10-27T00:00:00Z');

    // 35 days left in a 30-day interval: 900 * 35 / 30 = 1050
    expect(periodStart.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(proratedSeatsCents({ interval: 'MONTH', seats: 1, periodStart, periodEnd, now })).toBe(1_050);
  });
});
