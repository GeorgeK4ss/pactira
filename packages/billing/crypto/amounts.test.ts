import { describe, expect, it } from 'vitest';

import { formatUnits, parseUnits, toCents, uniqueAmountCents } from './amounts';
import { isEvmAddress } from './chains/evm';
import { isTronAddress, tronHexToAddress } from './chains/tron';

describe('formatUnits / parseUnits', () => {
  it('round-trips 6-decimal USDT exactly', () => {
    expect(formatUnits(129_070_000n, 6)).toBe('129.07');
    expect(parseUnits('129.07', 6)).toBe(129_070_000n);
  });

  it('round-trips 18-decimal BSC USDT exactly', () => {
    const units = 129_070_000_000_000_000_000n;
    expect(formatUnits(units, 18)).toBe('129.07');
    expect(parseUnits('129.07', 18)).toBe(units);
  });

  it('keeps sub-cent dust instead of rounding it away', () => {
    expect(formatUnits(129_070_000_000_000_000_001n, 18)).toBe('129.070000000000000001');
  });

  it('rejects malformed amounts', () => {
    expect(() => parseUnits('12.3456789', 6)).toThrow();
    expect(() => parseUnits('-1', 6)).toThrow();
  });
});

describe('toCents', () => {
  it('truncates below a cent', () => {
    expect(toCents('129.07')).toBe(12_907n);
    expect(toCents('129.079999')).toBe(12_907n);
    expect(toCents('129')).toBe(12_900n);
  });
});

describe('uniqueAmountCents', () => {
  it('never asks for less than the invoice', () => {
    for (let i = 0; i < 500; i++) {
      const amount = uniqueAmountCents(12_950, new Set());
      expect(Number(toCents(amount))).toBeGreaterThanOrEqual(12_950);
      expect(Number(toCents(amount))).toBeLessThan(13_100);
    }
  });

  it('avoids amounts already taken by open requests', () => {
    let i = 0;
    const sequence = [0, 0.5];
    const amount = uniqueAmountCents(12_900, new Set(['129.01']), () => sequence[i++ % sequence.length]);

    expect(amount).toBe('129.50');
  });

  it('gives up when every amount is taken', () => {
    const taken = new Set(Array.from({ length: 99 }, (_, k) => `129.${String(k + 1).padStart(2, '0')}`));
    expect(() => uniqueAmountCents(12_900, taken)).toThrow();
  });
});

describe('addresses', () => {
  it('accepts a real TRON address and rejects a broken checksum', () => {
    expect(isTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe(true);
    expect(isTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u')).toBe(false);
    expect(isTronAddress('0x55d398326f99059fF775485246999027B3197955')).toBe(false);
  });

  it('converts TronGrid event hex back to the base58 address', () => {
    expect(tronHexToAddress('0xa614f803b6fd780986a42c78ec9c7f77e6ded13c')).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
  });

  it('validates EVM addresses', () => {
    expect(isEvmAddress('0x55d398326f99059fF775485246999027B3197955')).toBe(true);
    expect(isEvmAddress('0x55d398326f99059fF775485246999027B319795')).toBe(false);
  });
});
