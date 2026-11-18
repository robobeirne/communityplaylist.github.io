// Which parts of an order form need approval, by whom, and whether that approval is current.
//
// Approval is needed for: a line discounted at or above the threshold (Sales leadership), payment
// terms and billing frequencies not on the allowed lists (Finance), a discount at or above the
// second tier (if set) also needs an Executive, auto-renewal switched off (the
// role set in the rules), and any ticked special term that names an approver. The thresholds and
// lists are the order form rules (settings.ts / HubDB), which leadership edits on the card. Each reason has a key
// that includes its value, so changing anything approved (say Net 60 to Net 90) makes the approval
// out of date and it has to be asked for again.

import type { Values } from './calc.ts';
import type { Line } from './lines.ts';
import { discountApprovalPct, discountTier2Pct, rule, ruleList } from './settings.ts';
import { activeTerms, ROLE_LABEL, ROLES, type Role } from './specialterms.ts';
import { readAmendments, shortHash } from './amendments.ts';

export { ROLE_LABEL, ROLES, type Role };

export interface ApprovalReason {
  key: string;
  label: string;
  role: Role;
}

const PAYMENT_LABEL: Record<string, string> = { net_30: 'Net 30', net_45: 'Net 45', net_60: 'Net 60', net_90: 'Net 90', due_on_receipt: 'Due on receipt' };
const BILLING_LABEL: Record<string, string> = {
  annually_in_advance: 'annually in advance',
  quarterly_in_advance: 'quarterly in advance',
  monthly_in_advance: 'monthly in advance',
  upfront_for_the_full_term: 'upfront for the full term',
};

export function approvalReasons(v: Values, lines: Line[]): ApprovalReason[] {
  const out: ApprovalReason[] = [];
  for (const l of lines.filter((x) => !x.removed && x.discountPct >= discountApprovalPct()))
    out.push({ key: `discount:${l.productId || l.name}:${l.discountPct}`, label: `${l.name}: ${l.discountPct}% discount`, role: 'sales' });
  // A second, higher tier also needs an Executive (off until leadership sets it).
  const tier2 = discountTier2Pct();
  if (tier2 !== null)
    for (const l of lines.filter((x) => !x.removed && x.discountPct >= tier2))
      out.push({ key: `discount_exec:${l.productId || l.name}:${l.discountPct}`, label: `${l.name}: ${l.discountPct}% discount (over ${tier2}%)`, role: 'exec' });
  const pay = String(v.of_payment_terms ?? '');
  if (pay && !ruleList('payment_terms_allowed').includes(pay)) out.push({ key: `payment:${pay}`, label: `Payment terms: ${PAYMENT_LABEL[pay] ?? pay}`, role: 'finance' });
  const bill = String(v.of_billing_frequency ?? '');
  if (bill && !ruleList('billing_allowed').includes(bill)) out.push({ key: `billing:${bill}`, label: `Billing ${BILLING_LABEL[bill] ?? bill}`, role: 'finance' });
  const autoRole = rule('auto_renew_off_role') as Role | 'none';
  if (v.of_auto_renew === 'false' && autoRole !== 'none' && ROLE_LABEL[autoRole as Role])
    out.push({ key: 'auto_renew:off', label: 'Auto-renewal switched off', role: autoRole as Role });
  for (const { term, value } of activeTerms(v))
    if (term.role) out.push({ key: `term:${term.id}:${value}`, label: `Special term: ${term.title}${value && term.input?.kind !== 'text' ? ` (${value}${term.input?.kind === 'percent' ? '%' : ''})` : ''}`, role: term.role });
  // Contract wording amended for this deal by someone who isn't a legal editor.
  for (const a of readAmendments(v).amendments.filter((x) => !x.byLegal))
    out.push({ key: `amend:${a.clauseId}:${a.removed ? 'removed' : shortHash(a.text)}`, label: `Wording ${a.removed ? 'removed' : 'amended'}: ${a.label || a.clauseId}${a.reason ? ` (${a.reason})` : ''}`, role: 'legal' });
  return out;
}

/** Identifies exactly what was approved. */
export const fingerprint = (reasons: ApprovalReason[]) => reasons.map((r) => r.key).sort().join('|');

export type Decision = 'pending' | 'approved' | 'rejected';
export interface RoleApproval {
  approver: { id: string; email: string; name: string };
  status: Decision;
  by?: string;
  at?: string;
  note?: string;
  taskId?: string;
}
export interface ApprovalRecord {
  fingerprint: string;
  reasons: ApprovalReason[];
  requestedBy?: string;
  requestedAt?: string;
  roles: Partial<Record<Role, RoleApproval>>;
}

export function readApproval(v: Values): ApprovalRecord | null {
  try {
    const r = JSON.parse(String(v.of_approval || ''));
    return r && typeof r === 'object' && typeof r.fingerprint === 'string' && r.roles ? (r as ApprovalRecord) : null;
  } catch {
    return null;
  }
}

export type ApprovalStatus = 'not_needed' | 'needed' | 'pending' | 'approved' | 'rejected';

/** Where approval stands for the order form as it is now. */
export function approvalState(v: Values, lines: Line[]): { status: ApprovalStatus; reasons: ApprovalReason[]; roles: Role[]; record: ApprovalRecord | null } {
  const reasons = approvalReasons(v, lines);
  const roles = [...new Set(reasons.map((r) => r.role))];
  const record = readApproval(v);
  if (!reasons.length) return { status: 'not_needed', reasons, roles, record };
  if (!record || record.fingerprint !== fingerprint(reasons)) return { status: 'needed', reasons, roles, record };
  const decisions = roles.map((r) => record.roles[r]?.status);
  if (decisions.some((d) => d === 'rejected')) return { status: 'rejected', reasons, roles, record };
  if (decisions.every((d) => d === 'approved')) return { status: 'approved', reasons, roles, record };
  return { status: 'pending', reasons, roles, record };
}
