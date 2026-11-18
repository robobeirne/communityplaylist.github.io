// Optional special terms a rep can tick onto an order form. Each has fixed wording (with a blank
// where the deal needs a number or a choice), the order types it applies to, and who must approve
// it. Ticked terms are stored on the deal in of_special_terms and printed on the quote after the
// standard Terms and Conditions. Edit the wording here.

import type { Values } from './calc.ts';

export type Role = 'finance' | 'legal' | 'sales';
export const ROLE_LABEL: Record<Role, string> = { finance: 'Finance', legal: 'Legal', sales: 'Sales leadership' };

type OrderType = 'new_business' | 'renewal' | 'expansion';

export interface TermInput {
  kind: 'percent' | 'months' | 'days' | 'choice' | 'text';
  label: string;
  options?: string[];
}

export interface SpecialTerm {
  id: string;
  title: string;
  /** What the rep sees next to the tickbox. */
  summary: string;
  input?: TermInput;
  /** The clause printed on the quote, given the rep's value. */
  clause: (value: string) => string;
  /** Who approves it; null if it needs no approval. */
  role: Role | null;
  /** Order types it can be used on (all if omitted). */
  orderTypes?: OrderType[];
}

export const SPECIAL_TERMS: SpecialTerm[] = [
  {
    id: 'price_cap',
    title: 'Renewal price cap',
    summary: 'Renewal fees rise by no more than a set percentage.',
    input: { kind: 'percent', label: 'Maximum increase (%)' },
    clause: (x) =>
      `Notwithstanding the MSA, the fees for each Renewal Term will not increase by more than ${x}% over the fees for the preceding term.`,
    role: 'finance',
  },
  {
    id: 'expansion_lock',
    title: 'Expansion pricing lock',
    summary: 'Extra sites ordered within a set period get the same per-site and per-camera fees.',
    input: { kind: 'months', label: 'Lock period (months)' },
    clause: (x) =>
      `Additional Sites ordered within ${x} months of the Order Form Effective Date will be charged at the same per-Site and per-Camera Integration fees as set out in this Order Form, for the remainder of the Subscription Term.`,
    role: 'sales',
  },
  {
    id: 'billing_from_deployment',
    title: 'Invoice from each Deployment Date',
    summary: "Each site is invoiced from its Deployment Date, not from signature.",
    clause: () =>
      "Notwithstanding section 3C, the Subscription Fees for each Site will be invoiced from that Site's Deployment Date rather than the Order Form Effective Date.",
    role: 'finance',
    orderTypes: ['new_business', 'expansion'],
  },
  {
    id: 'ramp',
    title: 'Ramped fees',
    summary: 'Year 1 at a reduced percentage of the fees; full fees from year 2. (Line items still show full price.)',
    input: { kind: 'percent', label: 'Year 1 fees (% of full fees)' },
    clause: (x) =>
      `The Subscription Fees for the first twelve (12) months of the Subscription Term will be ${x}% of the Subscription Fees set out in this Order Form. The full Subscription Fees apply from the thirteenth (13th) month.`,
    role: 'finance',
  },
  {
    id: 'pilot_exit',
    title: 'Pilot exit',
    summary: "Client can end the order within a set number of days of first deployment if agreed success criteria aren't met.",
    input: { kind: 'days', label: 'Exit window (days after first Deployment Date)' },
    clause: (x) =>
      `Client may terminate this Order Form by written notice to accounts@protex.ai within ${x} days of the first Deployment Date if the success criteria agreed in writing between the parties before that date have not been met. On such termination, Protex AI will refund any prepaid Subscription Fees for the unused portion of the Subscription Term and Client will return all Devices.`,
    role: 'legal',
    orderTypes: ['new_business'],
  },
  {
    id: 'reference',
    title: 'Reference and logo rights',
    summary: 'Client agrees to be a reference and lets Protex use its name and logo.',
    clause: () =>
      "Client agrees that Protex AI may name Client as a customer and use Client's name and logo in its marketing materials, and Client will act as a reference for prospective customers on reasonable request.",
    role: null,
  },
  {
    id: 'data_residency',
    title: 'Data residency',
    summary: 'Client Data is hosted in a set region.',
    input: { kind: 'choice', label: 'Hosting region', options: ['European Union', 'United States', 'United Kingdom'] },
    clause: (x) => `Client Data will be hosted in the ${x}.`,
    role: 'legal',
  },
  {
    id: 'other',
    title: 'Other special term',
    summary: 'Anything else, in your own words. Always needs Legal approval.',
    input: { kind: 'text', label: 'Wording' },
    clause: (x) => x,
    role: 'legal',
  },
];

export interface ChosenTerm {
  id: string;
  value?: string;
}

/** The ticked terms, from of_special_terms (JSON), keeping only known terms. */
export function readSpecialTerms(v: Values): ChosenTerm[] {
  try {
    const list = JSON.parse(String(v.of_special_terms || '[]'));
    if (!Array.isArray(list)) return [];
    return list
      .filter((t) => t && SPECIAL_TERMS.some((s) => s.id === t.id))
      .map((t) => ({ id: String(t.id), ...(t.value !== undefined && t.value !== null ? { value: String(t.value) } : {}) }));
  } catch {
    return [];
  }
}

export const termById = (id: string) => SPECIAL_TERMS.find((t) => t.id === id)!;

/** Terms available on this order type. */
export const termsFor = (orderType: unknown) => SPECIAL_TERMS.filter((t) => !t.orderTypes || t.orderTypes.includes(orderType as OrderType));

/** Ticked terms that apply to this order type, with their definitions. */
export function activeTerms(v: Values): { term: SpecialTerm; value: string }[] {
  const allowed = termsFor(v.of_order_type);
  return readSpecialTerms(v)
    .filter((c) => allowed.some((t) => t.id === c.id))
    .map((c) => ({ term: termById(c.id), value: String(c.value ?? '').trim() }));
}

/** A ticked term that still needs its blank filled in. */
export function termMissingValue(term: SpecialTerm, value: string): boolean {
  if (!term.input) return false;
  if (term.input.kind === 'text' || term.input.kind === 'choice') return !value;
  const n = Number(value);
  return !(value && Number.isFinite(n) && n > 0);
}
