// Order form arithmetic and the "ready to send" check, as pure functions so they can be tested
// without HubSpot. Pricing comes from the deal's line items (see lines.ts); sites come from the
// card's site list, which has no upper limit.

import { lineIssues, pricingTable, quantityRule, totals, type Line, type Totals } from './lines.ts';
import { STANDARD_MSA_URL } from './legal.ts';
import { approvalState, ROLE_LABEL } from './approvals.ts';
import { activeTerms, termMissingValue } from './specialterms.ts';
import { amendmentSummary, openRound, readAmendments } from './amendments.ts';

export type Values = Record<string, string | null | undefined>;

/** Sites written to the numbered Site 1–20 fields, for documents that list sites one by one. */
export const NUMBERED_SITES = 20;

/** Existing deal properties the order form reuses instead of duplicating. */
export const REUSED = [
  'deal_currency_code',
  'contract_start_date',
  'term_year_length',
  'subscription_start_date',
  'client_s_email_for_invoicing_',
  'purchase_order',
  'coterm_site_renewals',
  'pro_rata_renewal',
  'number_of_sites_to_start',
  'amount',
] as const;

/** Read-only context the card shows but never writes. */
export const CONTEXT = ['dealname', 'pipeline', 'dealstage', 'renewable_date'] as const;

export const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
export const yes = (v: unknown) => v === 'true';
export const filled = (v: unknown) => String(v ?? '').trim() !== '';

/** "12 months" → 12. */
export function termMonths(v: unknown): number | null {
  const m = String(v ?? '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** HubSpot date values arrive as "YYYY-MM-DD" or as midnight-UTC epoch milliseconds. */
export function parseDate(v: unknown): Date | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{10,}$/.test(s)) return new Date(Number(s));
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The last day of a term that starts on `start` and runs for `months`. */
export function termEnd(start: Date, months: number): Date {
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 1);
  return end;
}

export function orderTypeFromPipeline(pipeline: unknown): 'new_business' | 'renewal' | 'expansion' {
  if (pipeline === '497851373') return 'renewal';
  if (pipeline === '25788392') return 'expansion';
  return 'new_business';
}

/* ---------------- status ---------------- */

export type Status = 'draft' | 'ready_to_send' | 'sent' | 'signed';

/** The card's status, reading the old Juro-era values as their new equivalents. */
export function normaliseStatus(v: unknown): Status {
  const s = String(v ?? '');
  if (s === 'ready_to_send' || s === 'ready_for_juro') return 'ready_to_send';
  if (s === 'sent' || s === 'sent_to_juro') return 'sent';
  if (s === 'signed') return 'signed';
  return 'draft';
}

/** MSA status, defaulting older deals that answered "Is there an existing MSA? Yes". */
export function msaStatus(v: Values): string {
  if (filled(v.of_msa_status)) return String(v.of_msa_status);
  return v.of_existing_msa === 'yes' ? 'existing_msa' : '';
}

/* ---------------- sites ---------------- */

export interface Site {
  name: string;
  /** Delivery address: devices ship here (DAP). Only needed for new sites. */
  address: string;
  /**
   * A site being added with this order, as opposed to one the client already has. Unset means the
   * default for the order type: new for new business and expansions, existing for renewals.
   */
  isNew?: boolean;
  cameras: number;
  /** ISO date, or "" */
  goLive: string;
  /** The Sites record this is (picked from the company's sites, or created at signature). */
  recordId?: string;
}

/**
 * The deal's sites. The card keeps the full list in `of_sites` (JSON), so there's no limit;
 * older deals that only have the numbered Site 1–20 fields are read from those.
 */
export function readSites(v: Values): Site[] {
  const raw = String(v.of_sites ?? '').trim();
  if (raw) {
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list))
        return list.map((s) => ({
          name: String(s?.name ?? ''),
          address: String(s?.address ?? ''),
          cameras: num(s?.cameras),
          goLive: String(s?.goLive ?? ''),
          ...(typeof s?.isNew === 'boolean' ? { isNew: s.isNew } : {}),
          ...(s?.recordId ? { recordId: String(s.recordId) } : {}),
        }));
    } catch {
      /* fall through to the numbered fields */
    }
  }
  const count = Math.max(0, Math.min(NUMBERED_SITES, Math.round(num(v.number_of_sites_to_start))));
  const out: Site[] = [];
  for (let i = 1; i <= count; i++) {
    const d = parseDate(v[`of_site_${i}_go_live`]);
    out.push({ name: String(v[`of_site_${i}_name`] ?? '').trim(), address: '', cameras: num(v[`of_site_${i}_cameras`]), goLive: d ? isoDate(d) : '' });
  }
  return out;
}

/**
 * A pasted site list, one site per line: "Leeds DC, 12, 2027-02-01". Cameras and the go-live date
 * are optional and are read from the end of the line, so a name can contain commas. Columns copied
 * from a spreadsheet (tab-separated) can also carry the delivery address:
 * Name | Address | Cameras | Go-live.
 */
export function parseSiteList(text: string): Site[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const tabbed = line.includes('\t');
      const parts = line.split(tabbed ? /\t/ : /,|;/).map((p) => p.trim());
      while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
      let goLive = '';
      let cameras = 0;
      if (parts.length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(parts[parts.length - 1])) goLive = parts.pop()!;
      if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) cameras = Number(parts.pop());
      if (tabbed) return { name: parts[0] ?? '', address: parts.slice(1).filter(Boolean).join(', '), cameras, goLive };
      return { name: parts.filter(Boolean).join(', ').trim(), address: '', cameras, goLive };
    })
    .filter((s) => s.name);
}

const longDate = (d: Date) =>
  `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** One line per site, for the order form: "1. Amesbury — 12 camera integrations — go-live 1 Feb 2027". */
export function siteSchedule(sites: Site[], staged: boolean, start: Date | null, orderType?: unknown): string {
  const marked = orderType === 'renewal' || orderType === 'expansion';
  return sites
    .map((s, idx) => {
      const parts = [`${idx + 1}. ${s.name || `Site ${idx + 1}`}`];
      if (marked) parts.push(isNewSite(s, orderType) ? 'new site' : 'existing site');
      if (s.address) parts.push(s.address);
      if (s.cameras) parts.push(`${s.cameras} camera integration${s.cameras === 1 ? '' : 's'}`);
      const live = staged ? parseDate(s.goLive) : start;
      if (live) parts.push(`go-live ${longDate(live)}`);
      return parts.join(' — ');
    })
    .join('\n');
}

/** Whether a site is new with this order. New business: always. Renewals default to existing, expansions to new. */
export function isNewSite(site: Site, orderType: unknown): boolean {
  if (orderType !== 'renewal' && orderType !== 'expansion') return true;
  return site.isNew ?? orderType === 'expansion';
}

/* ---------------- summary ---------------- */

export interface Summary {
  sites: Site[];
  siteCount: number;
  siteCameras: number;
  months: number | null;
  end: Date | null;
  totals: Totals;
}

export function summarise(v: Values, lines: Line[]): Summary {
  const sites = readSites(v);
  const months = termMonths(v.term_year_length);
  const start = parseDate(v.contract_start_date);
  return {
    sites,
    siteCount: sites.length,
    siteCameras: sites.reduce((s, x) => s + x.cameras, 0),
    months,
    end: start && months ? termEnd(start, months) : null,
    totals: totals(lines, months),
  };
}

/**
 * The deal's Amount, following Protex's convention: the annual value (ARR), not the TCV. It's the
 * annual subscription after discounts; a deal with only one-off lines uses their total. Null when
 * the deal has no line items, so a rep's own Amount is left alone.
 */
export function dealAmount(lines: Line[]): number | null {
  const live = lines.filter((l) => !l.removed);
  if (!live.length) return null;
  const t = totals(live, null);
  return live.some((l) => l.recurring) ? t.annual : t.oneOff;
}

/** The calculated deal properties the card writes alongside what the rep typed, for the order form and reporting. */
export function computedProperties(v: Values, lines: Line[]): Record<string, string> {
  const s = summarise(v, lines);
  const t = s.totals;
  const currency = String(v.deal_currency_code ?? '');
  const out: Record<string, string> = {
    of_sites: JSON.stringify(s.sites),
    number_of_sites_to_start: String(s.siteCount),
    of_site_schedule: siteSchedule(s.sites, v.of_rollout === 'staged_rollout', parseDate(v.contract_start_date), v.of_order_type),
    of_pricing_table: pricingTable(lines, currency),
    of_annual_list_fee: String(t.annualList),
    of_discount_amount: String(t.annualDiscount),
    of_discount_pct: String(t.discountPct),
    of_annual_subscription_fee: String(t.annual),
    of_one_off_fees: String(t.oneOff),
    of_total_contract_value: t.tcv === null ? '' : String(t.tcv),
    of_contract_end_date: s.end ? isoDate(s.end) : '',
    of_approval_status: approvalState(v, lines).status,
    of_amendment_summary: amendmentSummary(readAmendments(v)),
  };
  const amount = dealAmount(lines);
  if (amount !== null) out.amount = String(amount);
  for (let i = 1; i <= NUMBERED_SITES; i++) {
    const site = s.sites[i - 1];
    out[`of_site_${i}_name`] = site?.name ?? '';
    out[`of_site_${i}_cameras`] = site ? String(site.cameras) : '';
    out[`of_site_${i}_go_live`] = site?.goLive ?? '';
  }
  return out;
}

/* ---------------- readiness ---------------- */

export type Section = 'client' | 'order' | 'pricing' | 'sites' | 'legal' | 'approval';
export const SECTIONS: { key: Section; title: string }[] = [
  { key: 'order', title: 'Order and term' },
  { key: 'client', title: 'Client and contacts' },
  { key: 'sites', title: 'Sites and rollout' },
  { key: 'pricing', title: 'Products and pricing' },
  { key: 'legal', title: 'Legal, MSA and signatures' },
  { key: 'approval', title: 'Approval' },
];

export interface Gap {
  section: Section;
  label: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What's still needed before the order form can be sent, and anything that looks wrong. */
export function readiness(v: Values, lines: Line[]): { missing: Gap[]; warnings: Gap[]; required: number } {
  const s = summarise(v, lines);
  const missing: Gap[] = [];
  const warnings: Gap[] = [];
  let required = 0;
  const need = (section: Section, ok: boolean, label: string) => {
    required++;
    if (!ok) missing.push({ section, label });
  };
  const has = (k: string) => filled(v[k]);
  const email = (section: Section, k: string, label: string) => {
    if (has(k) && !EMAIL.test(String(v[k]).trim())) warnings.push({ section, label: `${label} doesn't look like an email address` });
  };

  // Order and term
  need('order', has('of_order_type'), 'Order type');
  need('order', has('of_quote_date'), 'Date of this quote');
  need('order', has('of_offer_expiry_date'), 'Offer expiry date');
  need('order', has('of_target_signature_date'), 'Target signature date');
  need('order', has('deal_currency_code'), 'Currency');
  // New business and expansions run from each site's Deployment Date; renewals have fixed dates.
  if (v.of_order_type === 'renewal') need('order', has('contract_start_date'), 'Contract start date');
  need('order', has('term_year_length'), 'Contract term');
  need('order', has('of_billing_frequency'), 'Billing frequency');
  need('order', has('of_payment_terms'), 'Payment terms');
  if (v.of_order_type === 'renewal') need('order', has('pro_rata_renewal'), 'Pro-rata renewal?');
  const quote = parseDate(v.of_quote_date);
  const expiry = parseDate(v.of_offer_expiry_date);
  const target = parseDate(v.of_target_signature_date);
  if (quote && expiry && expiry < quote) warnings.push({ section: 'order', label: 'The offer expires before the quote date' });
  if (target && expiry && target > expiry) warnings.push({ section: 'order', label: 'The target signature date is after the offer expires' });

  // Client
  need('client', has('of_client_legal_name'), "Client's legal entity name");
  need('client', has('of_client_legal_address'), "Client's legal entity address");
  need('client', has('of_client_contact_name'), 'Client contact name');
  need('client', has('of_client_contact_email'), 'Client contact email');

  email('client', 'of_client_contact_email', 'Client contact email');
  email('client', 'client_s_email_for_invoicing_', 'Billing email');

  // Sites
  need('sites', s.siteCount > 0, 'At least one site');
  need('sites', has('of_rollout'), 'Rollout: all together or staged');
  const staged = v.of_rollout === 'staged_rollout';
  const start = parseDate(v.contract_start_date);
  s.sites.forEach((site, idx) => {
    need('sites', !!site.name, `Site ${idx + 1}: name`);
    if (isNewSite(site, v.of_order_type) && !site.address.trim())
      warnings.push({ section: 'sites', label: `Site ${idx + 1}: no delivery address (it's a new site, so its device ships there)` });
    if (staged) {
      need('sites', !!site.goLive, `Site ${idx + 1}: go-live date`);
      const live = parseDate(site.goLive);
      if (live && start && live < start) warnings.push({ section: 'sites', label: `Site ${idx + 1} goes live before the contract starts` });
    }
  });
  if (s.siteCount > NUMBERED_SITES)
    warnings.push({
      section: 'sites',
      label: `${s.siteCount} sites: only Sites 1–${NUMBERED_SITES} fit the numbered site fields. Every site is on the order form in the site schedule.`,
    });

  // Products and pricing
  const live = lines.filter((l) => !l.removed);
  need('pricing', live.length > 0, 'At least one product');
  need('pricing', live.some((l) => quantityRule(l) === 'sites'), 'A platform licence product');
  const currency = String(v.deal_currency_code ?? '');
  for (const issue of lineIssues(lines, currency, s.siteCount, s.siteCameras)) {
    if (issue.kind === 'missing') need('pricing', false, issue.label);
    else warnings.push({ section: 'pricing', label: issue.label });
  }
  if (s.totals.discounted) need('pricing', has('of_discount_reason'), 'Reason for the discounts');

  // Legal, MSA and signatures
  const msa = msaStatus(v);
  need('legal', !!msa, 'MSA status');
  if (msa === 'negotiating_in_juro') need('legal', false, 'The MSA signed in Juro (then set MSA status to Signed in Juro)');
  if (msa === 'standard_msa' && !STANDARD_MSA_URL) need('legal', false, 'A link to the standard MSA (legal to add it to the card)');
  if (v.of_auto_renew === 'false')
    warnings.push({ section: 'order', label: 'Auto-renewal is off, so the order form leaves out the auto-renewal clause. Check this with legal.' });
  need('legal', has('of_counterparty_signer_name'), 'Counterparty signer name');
  need('legal', has('of_counterparty_signer_email'), 'Counterparty signer email');
  need('legal', has('of_counterparty_signer_title'), 'Counterparty signer job title');
  need('legal', has('of_counterparty_signer_contact_id'), 'Counterparty signer picked from a deal contact (they e-sign the quote)');
  need('legal', has('of_protex_signer_name'), 'Protex signatory');
  need('legal', has('of_protex_signer_email'), 'Protex signatory email');
  need('legal', has('of_protex_signer_title'), 'Protex signatory job title');
  email('legal', 'of_counterparty_signer_email', 'Counterparty signer email');

  // A client redline round that's still open: resolve it before sending a new version.
  const round = openRound(readAmendments(v));
  if (round) need('legal', false, `Client redlines (round ${round.n}): resolve them, then mark the round resolved`);

  // Special terms: a ticked term needs its blank filled in.
  for (const { term, value } of activeTerms(v)) if (termMissingValue(term, value)) need('legal', false, `Special term "${term.title}": ${term.input!.label}`);

  // Approval of non-standard price and terms.
  const approval = approvalState(v, lines);
  if (approval.status !== 'not_needed') {
    const who = (roles: string[]) => roles.map((r) => ROLE_LABEL[r as keyof typeof ROLE_LABEL]).join(', ');
    const pending = approval.roles.filter((r) => approval.record?.roles[r]?.status !== 'approved');
    const label =
      approval.status === 'needed'
        ? `Approval from ${who(approval.roles)}: request it in the Approval box`
        : approval.status === 'pending'
          ? `Approval pending from ${who(pending)}`
          : `Approval rejected by ${who(approval.roles.filter((r) => approval.record?.roles[r]?.status === 'rejected'))}: change the terms and ask again`;
    need('approval', approval.status === 'approved', label);
  }

  return { missing, warnings, required };
}
