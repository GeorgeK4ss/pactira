/**
 * Exact amount helpers. Token amounts are never JS numbers: USDT on BNB Chain has 18 decimals.
 */

/** Base units (e.g. 129070000) → exact decimal string ("129.07"), trailing zeros trimmed. */
export const formatUnits = (value: bigint, decimals: number) => {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');

  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
};

/** Exact decimal string → base units. Extra decimal places beyond `decimals` are rejected. */
export const parseUnits = (value: string, decimals: number) => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());

  if (!match) {
    throw new Error(`Invalid amount: ${value}`);
  }

  const [, whole, fraction = ''] = match;

  if (fraction.length > decimals) {
    throw new Error(`Too many decimals: ${value}`);
  }

  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
};

/** Decimal string → whole cents, dropping anything below a cent. */
export const toCents = (value: string) => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());

  if (!match) {
    throw new Error(`Invalid amount: ${value}`);
  }

  const [, whole, fraction = ''] = match;

  return BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0'));
};

export const centsToDecimal = (cents: bigint | number) => {
  const value = BigInt(cents);

  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
};

/**
 * Picks the amount a customer is asked to send: the invoice amount with the cents replaced by
 * 1–99 random cents not used by another open request to the same address, and never below the
 * invoice. The cents are what tells one payment from another on a shared receiving address.
 */
export const uniqueAmountCents = (invoiceCents: number, taken: Set<string>, random: () => number = Math.random) => {
  const whole = Math.floor(invoiceCents / 100) * 100;

  for (let attempt = 0; attempt < 400; attempt++) {
    const suffix = 1 + Math.floor(random() * 99);
    let cents = whole + suffix;

    if (cents < invoiceCents) {
      cents += 100;
    }

    const asDecimal = centsToDecimal(cents);

    if (!taken.has(asDecimal)) {
      return asDecimal;
    }
  }

  throw new Error('No free payment amount left for this address; try again later');
};
