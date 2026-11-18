// Optional special terms a rep can tick onto an order form. Each has fixed wording (with a blank
// where the deal needs a number or a choice), the order types it applies to, and who must approve
// it. Ticked terms are stored on the deal in of_special_terms and printed on the quote after the
// standard Terms and Conditions. The wording, approver and on/off switch come from the Terms
// library (settings.ts / HubDB), which legal edits on the card.

import type { Values } from './calc.ts';
import { formatClause, getLibrary } from './settings.ts';

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
  /** The clause printed on the quote (HTML), given the rep's value. */
  clause: (value: string) => string;
  /** Who approves it; null if it needs no approval. */
  role: Role | null;
  /** Order types it can be used on (all if omitted). */
  orderTypes?: OrderType[];
}

/** The special terms in the Terms library (enabled or not), as card definitions. */
export function specialTerms(includeDisabled = false): SpecialTerm[] {
  return getLibrary()
    .filter((c) => c.kind === 'special' && (includeDisabled || c.enabled !== false))
    .map((c) => {
      const kind = c.input_kind as TermInput['kind'] | undefined;
      const roleName = String(c.role ?? '').trim() as Role | '';
      return {
        id: c.id,
        title: c.title || c.id,
        summary: c.summary || '',
        ...(kind ? { input: { kind, label: c.input_label || 'Value', ...(c.input_options ? { options: c.input_options.split(',').map((o) => o.trim()).filter(Boolean) } : {}) } } : {}),
        clause: (value: string) => formatClause(c.body).replace(/\{\{value\}\}/g, escapeText(value)),
        role: roleName && ROLE_LABEL[roleName] ? roleName : null,
        ...(c.order_types ? { orderTypes: c.order_types.split(',').map((o) => o.trim()).filter(Boolean) as OrderType[] } : {}),
      };
    });
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
      .filter((t) => t && specialTerms(true).some((s) => s.id === t.id))
      .map((t) => ({ id: String(t.id), ...(t.value !== undefined && t.value !== null ? { value: String(t.value) } : {}) }));
  } catch {
    return [];
  }
}

export const termById = (id: string) => specialTerms(true).find((t) => t.id === id)!;

/** Terms available on this order type. */
export const termsFor = (orderType: unknown) => specialTerms().filter((t) => !t.orderTypes || t.orderTypes.includes(orderType as OrderType));

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
