// Order form arithmetic and the "ready for Juro" check, as pure functions so
// they can be tested without HubSpot.

export type Values = Record<string, string | null | undefined>;

export const MAX_SITES = 20;

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
] as const;

/** Read-only context the card shows but never writes. */
export const CONTEXT = ['dealname', 'pipeline', 'dealstage', 'renewable_date'] as const;

export const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
export const yes = (v: unknown) => v === 'true';
export const filled = (v: unknown) => String(v ?? '').trim() !== '';
const round2 = (n: number) => Math.round(n * 100) / 100;

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

export interface Site {
  i: number;
  name: string;
  cameras: number;
  goLive: Date | null;
}

export interface Computed {
  lines: { safety: number; cameras: number; ops: number; intel: number; hardware: number };
  /** Units used for site licences and camera integrations. */
  units: { safety: number; cameras: number };
  /** True where those units come from the sites because no number was typed. */
  fromSites: { safety: boolean; cameras: boolean };
  hardwareAnnual: boolean;
  annualList: number;
  discount: number;
  annual: number;
  oneOff: number;
  months: number | null;
  tcv: number | null;
  end: Date | null;
  siteCount: number;
  sites: Site[];
  siteCameras: number;
}

export function compute(v: Values): Computed {
  const siteCount = Math.max(0, Math.min(MAX_SITES, Math.round(num(v.number_of_sites_to_start))));
  const sites: Site[] = [];
  for (let i = 1; i <= siteCount; i++) {
    sites.push({
      i,
      name: String(v[`of_site_${i}_name`] ?? '').trim(),
      cameras: num(v[`of_site_${i}_cameras`]),
      goLive: parseDate(v[`of_site_${i}_go_live`]),
    });
  }
  const siteCameras = sites.reduce((s, x) => s + x.cameras, 0);

  // Site licences and camera integrations follow the sites unless a rep types a number.
  const fromSites = { safety: !yes(v.of_safety_units_manual), cameras: !yes(v.of_cameras_units_manual) };
  const units = {
    safety: fromSites.safety ? siteCount : num(v.of_safety_units),
    cameras: fromSites.cameras ? siteCameras : num(v.of_cameras_units),
  };
  const line = (k: string, u = num(v[`of_${k}_units`])) => round2(u * num(v[`of_${k}_unit_fee`]));
  const hardwareOn = yes(v.of_hardware_included);
  const hardwareAnnual = hardwareOn && v.of_hardware_billing === 'annually';
  const lines = {
    safety: line('safety', units.safety),
    cameras: line('cameras', units.cameras),
    ops: yes(v.of_ops_included) ? line('ops') : 0,
    intel: yes(v.of_intel_included) ? line('intel') : 0,
    hardware: hardwareOn ? line('hardware') : 0,
  };
  const annualList = round2(lines.safety + lines.cameras + lines.ops + lines.intel + (hardwareAnnual ? lines.hardware : 0));
  let discount = 0;
  if (yes(v.of_discount_applied)) {
    const d = Math.max(0, num(v.of_discount_value));
    discount = v.of_discount_type === 'percentage' ? (annualList * Math.min(d, 100)) / 100 : Math.min(d, annualList);
  }
  discount = round2(discount);
  const annual = round2(annualList - discount);
  const oneOff = round2(num(v.of_implementation_fee) + (hardwareOn && !hardwareAnnual ? lines.hardware : 0));
  const months = termMonths(v.term_year_length);
  const tcv = months ? round2((annual * months) / 12 + oneOff) : null;
  const start = parseDate(v.contract_start_date);
  const end = start && months ? termEnd(start, months) : null;
  return { lines, units, fromSites, hardwareAnnual, annualList, discount, annual, oneOff, months, tcv, end, siteCount, sites, siteCameras };
}

const longDate = (d: Date) =>
  `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** One line per site, for the Juro template: "1. Amesbury — 12 camera integrations — go-live 1 Feb 2027". */
export function siteSchedule(c: Computed, staged: boolean, start: Date | null): string {
  return c.sites
    .map((s) => {
      const parts = [`${s.i}. ${s.name || `Site ${s.i}`}`];
      if (s.cameras) parts.push(`${s.cameras} camera integration${s.cameras === 1 ? '' : 's'}`);
      const live = staged ? s.goLive : start;
      if (live) parts.push(`go-live ${longDate(live)}`);
      return parts.join(' — ');
    })
    .join('\n');
}

/** The calculated properties the card writes alongside what the rep typed. */
export function computedProperties(v: Values): Record<string, string> {
  const c = compute(v);
  const money = (n: number) => String(n);
  const out: Record<string, string> = {
    of_safety_units: String(c.units.safety),
    of_cameras_units: String(c.units.cameras),
    of_safety_total: money(c.lines.safety),
    of_cameras_total: money(c.lines.cameras),
    of_ops_total: money(c.lines.ops),
    of_intel_total: money(c.lines.intel),
    of_hardware_total: money(c.lines.hardware),
    of_annual_list_fee: money(c.annualList),
    of_discount_amount: money(c.discount),
    of_annual_subscription_fee: money(c.annual),
    of_one_off_fees: money(c.oneOff),
    of_total_contract_value: c.tcv === null ? '' : money(c.tcv),
    of_contract_end_date: c.end ? isoDate(c.end) : '',
    of_site_schedule: siteSchedule(c, v.of_rollout === 'staged_rollout', parseDate(v.contract_start_date)),
  };
  return out;
}

export type Section = 'client' | 'order' | 'pricing' | 'sites' | 'legal';
export const SECTIONS: { key: Section; title: string }[] = [
  { key: 'order', title: 'Order and term' },
  { key: 'client', title: 'Client and contacts' },
  { key: 'sites', title: 'Sites and rollout' },
  { key: 'pricing', title: 'Pricing' },
  { key: 'legal', title: 'Legal, MSA and signatures' },
];

export interface Gap {
  section: Section;
  label: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What's still needed before the order form can go to Juro, and anything that looks wrong. */
export function readiness(v: Values): { missing: Gap[]; warnings: Gap[]; required: number } {
  const c = compute(v);
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

  // Client
  need('client', has('of_client_legal_name'), "Client's legal entity name");
  need('client', has('of_client_legal_address'), "Client's legal entity address");
  need('client', has('of_client_contact_name'), 'Client contact name');
  need('client', has('of_client_contact_email'), 'Client contact email');
  need('client', has('client_s_email_for_invoicing_'), 'Billing email');
  email('client', 'of_client_contact_email', 'Client contact email');
  email('client', 'client_s_email_for_invoicing_', 'Billing email');

  // Order and term
  need('order', has('of_order_type'), 'Order type');
  need('order', has('of_quote_date'), 'Date of this quote');
  need('order', has('of_offer_expiry_date'), 'Offer expiry date');
  need('order', has('of_target_signature_date'), 'Target signature date');
  need('order', has('deal_currency_code'), 'Currency');
  need('order', has('contract_start_date'), 'Contract start date');
  need('order', has('term_year_length'), 'Contract term');
  need('order', has('of_billing_frequency'), 'Billing frequency');
  need('order', has('of_payment_terms'), 'Payment terms');
  if (v.of_order_type === 'renewal') need('order', has('pro_rata_renewal'), 'Pro-rata renewal?');
  const quote = parseDate(v.of_quote_date);
  const expiry = parseDate(v.of_offer_expiry_date);
  const target = parseDate(v.of_target_signature_date);
  if (quote && expiry && expiry < quote) warnings.push({ section: 'order', label: 'The offer expires before the quote date' });
  if (target && expiry && target > expiry) warnings.push({ section: 'order', label: 'The target signature date is after the offer expires' });

  // Pricing
  const priced = (k: string, label: string, units = num(v[`of_${k}_units`])) => {
    need('pricing', units > 0, `${label}: units`);
    need('pricing', num(v[`of_${k}_unit_fee`]) > 0, `${label}: fee per unit`);
  };
  priced('safety', 'Site licenses (Safety Pack)', c.units.safety);
  priced('cameras', 'Camera integrations', c.units.cameras);
  if (yes(v.of_ops_included)) priced('ops', 'Operations License');
  if (yes(v.of_intel_included)) priced('intel', 'Protex Intelligence');
  if (yes(v.of_hardware_included)) {
    priced('hardware', 'Hardware');
    need('pricing', has('of_hardware_billing'), 'Hardware: one-off or annual');
  }
  if (yes(v.of_discount_applied)) {
    need('pricing', has('of_discount_type'), 'Discount type');
    need('pricing', num(v.of_discount_value) > 0, 'Discount amount');
    need('pricing', has('of_discount_reason'), 'Reason for the discount');
    if (v.of_discount_type === 'percentage' && num(v.of_discount_value) > 100)
      warnings.push({ section: 'pricing', label: 'The discount is over 100%' });
  }

  // Sites
  need('sites', c.siteCount > 0, 'Number of sites');
  need('sites', has('of_rollout'), 'Rollout: all together or staged');
  if (num(v.number_of_sites_to_start) > MAX_SITES)
    warnings.push({ section: 'sites', label: `The order form has room for ${MAX_SITES} sites; list the rest in the notes for legal` });
  const staged = v.of_rollout === 'staged_rollout';
  const start = parseDate(v.contract_start_date);
  for (const s of c.sites) {
    need('sites', !!s.name, `Site ${s.i}: name`);
    if (staged) {
      need('sites', !!s.goLive, `Site ${s.i}: go-live date`);
      if (s.goLive && start && s.goLive < start) warnings.push({ section: 'sites', label: `Site ${s.i} goes live before the contract starts` });
    }
  }
  if (!c.fromSites.cameras && c.siteCameras > 0 && c.units.cameras !== c.siteCameras)
    warnings.push({ section: 'pricing', label: `Cameras per site add up to ${c.siteCameras}, but ${c.units.cameras} camera integrations are priced` });
  if (!c.fromSites.safety && c.siteCount > 0 && c.units.safety !== c.siteCount)
    warnings.push({ section: 'pricing', label: `${c.units.safety} site licenses are priced for ${c.siteCount} sites` });

  // Legal, MSA and signatures
  need('legal', has('of_existing_msa'), 'Is there an existing MSA?');
  if (v.of_existing_msa === 'yes') need('legal', has('of_msa_details'), 'MSA details or link');
  need('legal', has('of_counterparty_signer_name'), 'Counterparty signer name');
  need('legal', has('of_counterparty_signer_email'), 'Counterparty signer email');
  need('legal', has('of_counterparty_signer_title'), 'Counterparty signer job title');
  need('legal', has('of_protex_signer_name'), 'Protex signatory');
  need('legal', has('of_protex_signer_email'), 'Protex signatory email');
  need('legal', has('of_protex_signer_title'), 'Protex signatory job title');
  email('legal', 'of_counterparty_signer_email', 'Counterparty signer email');

  return { missing, warnings, required };
}
