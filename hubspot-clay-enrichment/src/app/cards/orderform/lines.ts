// Line items: the deal's products, priced from the product library, with a discount per line.
// The arithmetic mirrors HubSpot's own line item calculation, so the card's totals match the
// line items' Net price, ARR and TCV.

/** Discounts at or above this share of list price are flagged as needing approval. */
export const DISCOUNT_APPROVAL_PCT = 20;

export type Currency = 'GBP' | 'EUR' | 'USD' | 'CAD';

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  /** List price per currency, from hs_price_gbp etc. */
  prices: Partial<Record<Currency, number>>;
  /** "annually", "monthly"…, or "" for a one-time product. */
  frequency: string;
}

/** A line item as stored in HubSpot (the properties the card reads). */
export interface RawLine {
  id: string;
  properties: Record<string, string | null | undefined>;
}

/** What a rep can change on a line before saving. */
export interface LineEdit {
  quantity?: number;
  discountMode?: 'percent' | 'amount';
  discountValue?: number;
  /** Put the unit price back to the product's list price in the deal currency. */
  resetPrice?: boolean;
  remove?: boolean;
}

/** Lines added in the card but not saved yet have ids starting with this. */
export const NEW_PREFIX = 'new-';

export interface Line {
  id: string;
  productId: string;
  name: string;
  sku: string;
  currency: string;
  quantity: number;
  /** Unit price on the line item. */
  price: number;
  /** List price from the product library, in the deal's currency (null if the product has none). */
  listPrice: number | null;
  discountMode: 'percent' | 'amount';
  /** Percentage, or amount off each unit. */
  discountValue: number;
  frequency: string;
  recurring: boolean;
  /** Billing periods per year: 1 for annual, 12 for monthly; 0 for one-time. */
  periodsPerYear: number;
  /** Quantity × unit price, before discount, per billing period. */
  gross: number;
  discount: number;
  /** After discount, per billing period (HubSpot's "Net price"). */
  net: number;
  /** Per year for recurring lines; the one-off amount for one-time lines. */
  annualGross: number;
  annualNet: number;
  discountPct: number;
  removed: boolean;
}

export const LINE_PROPERTIES = [
  'name',
  'hs_product_id',
  'hs_sku',
  'quantity',
  'price',
  'discount',
  'hs_discount_percentage',
  'amount',
  'hs_line_item_currency_code',
  'recurringbillingfrequency',
  'hs_recurring_billing_period',
  'hs_recurring_billing_start_date',
];

const PERIODS: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  per_six_months: 2,
  annually: 1,
  per_two_years: 0.5,
  per_three_years: 1 / 3,
  per_four_years: 0.25,
  per_five_years: 0.2,
};

const n = (v: unknown) => {
  const x = parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : 0;
};
const has = (v: unknown) => String(v ?? '').trim() !== '';
const round2 = (x: number) => Math.round(x * 100) / 100;

export function toLine(raw: RawLine, edit: LineEdit | undefined, products: Product[], dealCurrency: string): Line {
  const p = raw.properties;
  const product = products.find((x) => x.id === String(p.hs_product_id ?? ''));
  const storedMode: 'percent' | 'amount' = has(p.discount) && n(p.discount) > 0 && !(n(p.hs_discount_percentage) > 0) ? 'amount' : 'percent';
  const discountMode = edit?.discountMode ?? storedMode;
  const storedValue = storedMode === 'amount' ? n(p.discount) : n(p.hs_discount_percentage);
  const discountValue = Math.max(0, edit?.discountValue ?? (edit?.discountMode && edit.discountMode !== storedMode ? 0 : storedValue));
  const quantity = Math.max(0, edit?.quantity ?? n(p.quantity));
  const listPrice = product?.prices[(dealCurrency || String(p.hs_line_item_currency_code ?? '')) as Currency] ?? null;
  const reset = !!edit?.resetPrice && listPrice !== null;
  const price = reset ? listPrice! : n(p.price);
  const frequency = String(p.recurringbillingfrequency ?? '');
  const periodsPerYear = frequency ? PERIODS[frequency] ?? 1 : 0;
  const gross = round2(quantity * price);
  const discount = round2(discountMode === 'percent' ? (gross * Math.min(discountValue, 100)) / 100 : Math.min(discountValue, price) * quantity);
  const net = round2(gross - discount);
  const mult = periodsPerYear || 1;
  const currency = reset ? dealCurrency : String(p.hs_line_item_currency_code || dealCurrency || '');
  return {
    id: raw.id,
    productId: String(p.hs_product_id ?? ''),
    name: String(p.name ?? product?.name ?? 'Line item'),
    sku: String(p.hs_sku ?? product?.sku ?? ''),
    currency,
    quantity,
    price,
    listPrice,
    discountMode,
    discountValue,
    frequency,
    recurring: periodsPerYear > 0,
    periodsPerYear,
    gross,
    discount,
    net,
    annualGross: round2(gross * mult),
    annualNet: round2(net * mult),
    discountPct: gross > 0 ? round2((discount / gross) * 100) : 0,
    removed: !!edit?.remove,
  };
}

export interface Totals {
  /** Recurring lines, per year, before and after discount. */
  annualList: number;
  annualDiscount: number;
  annual: number;
  /** One-time lines, after discount. */
  oneOff: number;
  oneOffDiscount: number;
  /** Discount across everything, as a share of list. */
  discountPct: number;
  tcv: number | null;
  discounted: boolean;
}

export function totals(lines: Line[], months: number | null): Totals {
  const live = lines.filter((l) => !l.removed);
  const rec = live.filter((l) => l.recurring);
  const one = live.filter((l) => !l.recurring);
  const annualList = round2(rec.reduce((s, l) => s + l.annualGross, 0));
  const annual = round2(rec.reduce((s, l) => s + l.annualNet, 0));
  const oneOffGross = round2(one.reduce((s, l) => s + l.gross, 0));
  const oneOff = round2(one.reduce((s, l) => s + l.net, 0));
  const listAll = annualList + oneOffGross;
  const discountAll = annualList - annual + (oneOffGross - oneOff);
  return {
    annualList,
    annualDiscount: round2(annualList - annual),
    annual,
    oneOff,
    oneOffDiscount: round2(oneOffGross - oneOff),
    discountPct: listAll > 0 ? round2((discountAll / listAll) * 100) : 0,
    tcv: months ? round2((annual * months) / 12 + oneOff) : null,
    discounted: live.some((l) => l.discount > 0),
  };
}

/** Licences are one per site; camera products follow the cameras across sites. */
export function defaultQuantity(product: Pick<Product, 'name' | 'sku'>, siteCount: number, siteCameras: number): number {
  const label = `${product.name} ${product.sku}`.toLowerCase();
  if (/camera/.test(label)) return siteCameras || 1;
  if (/licen[cs]e/.test(label) && !/intelligence \(free\)/.test(label)) return siteCount || 1;
  return 1;
}

export type QuantityRule = 'sites' | 'cameras' | null;
export function quantityRule(line: Pick<Line, 'name' | 'sku'>): QuantityRule {
  const label = `${line.name} ${line.sku}`.toLowerCase();
  if (/camera/.test(label)) return 'cameras';
  if (/site licen[cs]e|licen[cs]e - (safety|operations|signal)|platform/.test(label)) return 'sites';
  return null;
}

export interface LineIssue {
  lineId: string;
  label: string;
  /** "missing" blocks Ready for Juro; "check" is a warning. */
  kind: 'missing' | 'check';
}

export function lineIssues(lines: Line[], dealCurrency: string, siteCount: number, siteCameras: number): LineIssue[] {
  const out: LineIssue[] = [];
  for (const l of lines.filter((x) => !x.removed)) {
    if (dealCurrency && l.currency && l.currency !== dealCurrency)
      out.push({ lineId: l.id, kind: 'missing', label: `${l.name} is priced in ${l.currency}, but the deal is in ${dealCurrency}` });
    if (l.id.startsWith(NEW_PREFIX) && l.listPrice === null)
      out.push({ lineId: l.id, kind: 'missing', label: `${l.name} has no ${dealCurrency || 'deal currency'} price in the product library` });
    if (l.quantity <= 0) out.push({ lineId: l.id, kind: 'missing', label: `${l.name}: quantity` });
    if (l.listPrice !== null && Math.abs(l.price - l.listPrice) > 0.005 && l.currency === dealCurrency)
      out.push({
        lineId: l.id,
        kind: 'check',
        label: `${l.name}: the unit price (${fmt(l.price, dealCurrency)}) isn't the list price (${fmt(l.listPrice, dealCurrency)}). Reset it to list so any discount is visible`,
      });
    if (l.discountPct >= DISCOUNT_APPROVAL_PCT)
      out.push({ lineId: l.id, kind: 'check', label: `${l.name}: ${l.discountPct}% discount is at or above the ${DISCOUNT_APPROVAL_PCT}% approval threshold` });
    const rule = quantityRule(l);
    if (rule === 'sites' && siteCount > 0 && l.quantity !== siteCount)
      out.push({ lineId: l.id, kind: 'check', label: `${l.name}: ${l.quantity} licences for ${siteCount} sites` });
    if (rule === 'cameras' && siteCameras > 0 && l.quantity !== siteCameras)
      out.push({ lineId: l.id, kind: 'check', label: `${l.name}: ${l.quantity} cameras, but the sites add up to ${siteCameras}` });
  }
  return out;
}

const fmt = (x: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 2 }).format(x);
  } catch {
    return `${currency} ${x.toFixed(2)}`;
  }
};

/** One line per product, for the Juro template. */
export function pricingTable(lines: Line[], currency: string): string {
  return lines
    .filter((l) => !l.removed)
    .map((l) => {
      const parts = [`${l.name}${l.sku ? ` (${l.sku})` : ''}`, `${l.quantity} × ${fmt(l.price, currency)}`];
      if (l.discount > 0) parts.push(l.discountMode === 'percent' ? `${l.discountValue}% discount` : `${fmt(l.discountValue, currency)} off per unit`);
      parts.push(l.recurring ? `${fmt(l.annualNet, currency)} per year` : `${fmt(l.net, currency)} one-off`);
      return parts.join(' — ');
    })
    .join('\n');
}

/** The line item properties to write for a rep's edit. */
export function lineUpdate(l: Line): Record<string, string> {
  return {
    quantity: String(l.quantity),
    hs_discount_percentage: l.discountMode === 'percent' && l.discountValue > 0 ? String(l.discountValue) : '',
    discount: l.discountMode === 'amount' && l.discountValue > 0 ? String(l.discountValue) : '',
  };
}

/** Recurring lines should run for the contract term from the billing start date. */
export function termUpdate(raw: RawLine, months: number | null, startIso: string): Record<string, string> | null {
  const p = raw.properties;
  if (!p.recurringbillingfrequency || !months) return null;
  const out: Record<string, string> = {};
  const period = `P${months}M`;
  if (p.hs_recurring_billing_period !== period) out.hs_recurring_billing_period = period;
  if (startIso && String(p.hs_recurring_billing_start_date ?? '').slice(0, 10) !== startIso) out.hs_recurring_billing_start_date = startIso;
  return Object.keys(out).length ? out : null;
}

/** A line added in the card, shaped like a stored line item so the same arithmetic applies. */
export function newRawLine(id: string, product: Product, dealCurrency: string): RawLine {
  return {
    id,
    properties: {
      hs_product_id: product.id,
      name: product.name,
      hs_sku: product.sku,
      quantity: '1',
      price: String(product.prices[dealCurrency as Currency] ?? 0),
      hs_line_item_currency_code: dealCurrency,
      recurringbillingfrequency: product.frequency,
    },
  };
}

/**
 * Fixing a hidden discount: put the unit price back to list and, when there was no discount on the
 * line, carry the difference over as a per-unit discount so the net price doesn't change.
 */
export function resetToList(l: Line): LineEdit {
  if (l.listPrice === null) return {};
  const diff = Math.round((l.listPrice - l.price) * 100) / 100;
  if (l.discount === 0 && diff > 0) return { resetPrice: true, discountMode: 'amount', discountValue: diff };
  return { resetPrice: true };
}
