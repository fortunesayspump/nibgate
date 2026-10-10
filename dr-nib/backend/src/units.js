import { Prisma } from '@prisma/client';

// Money is USDC: 6 decimals. It is stored as an exact numeric column, never as
// a float, because a ledger that accumulates 0.1 + 0.2 error is not a ledger.
// Numbers cross the API as plain numbers (that is what the UI speaks) and are
// converted at the edge; the arithmetic in between is decimal.
export const USDC_SCALE = 6;

export function toDb(value) {
  if (value == null) return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(String(value));
}

export function toNum(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

export function sumDb(values) {
  return values.reduce((total, v) => total.plus(toDb(v)), new Prisma.Decimal(0));
}

// Route-boundary guard: a Decimal reaching res.json serialises as a string,
// which would quietly change the API's number contract, and a BigInt
// reaching it throws ("Do not know how to serialize a BigInt") — a 500 on
// run detail with no useful message. Walk the payload and hand back numbers.
export function jsonSafe(value) {
  if (value == null) return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}