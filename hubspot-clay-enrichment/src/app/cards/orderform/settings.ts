// Order form settings leadership and legal can change without a code change: the approval rules
// and the Terms library (every standard clause and special term). They live in two HubDB tables,
// order_form_rules and order_form_terms; the card loads them through the app function and calls
// setSettings(). Until then (or if HubDB isn't set up) the defaults below apply. The setup script
// seeds the HubDB tables from these defaults (scripts/hubdb-seed.json is generated from them).
//
// Wording markers: **bold**, __underline__. Placeholders filled per deal:
//   {{entity}} {{msa_link}} {{billing}} {{payment}} {{from_start}}   (standard clauses)
//   {{value}}                                                     (special terms: the rep's value)
// Conditions on standard clauses: renewal, not_renewal, ships_devices, auto_renew (blank = always).

export interface Clause {
  id: string;
  kind: 'standard' | 'special';
  /** Standard clauses: the section they belong to and their order within it. */
  section?: number;
  position?: number;
  condition?: string;
  /** Special terms. */
  title?: string;
  summary?: string;
  input_kind?: string;
  input_label?: string;
  input_options?: string;
  role?: string;
  order_types?: string;
  enabled?: boolean;
  body: string;
  version?: number;
  updated_by?: string;
  updated_at?: string;
}

export type Rules = Record<string, string>;

export const DEFAULT_RULES: Rules = {
  discount_approval_pct: '20',
  payment_terms_allowed: 'net_30',
  billing_allowed: 'annually_in_advance',
  auto_renew_off_role: 'legal',
  approver_finance: 'aoife.harte@protex.ai',
  approver_legal: 'aoife.harte@protex.ai',
  approver_sales: 'scott.cahill@protex.ai',
  legal_editors: 'jemima.davison@protex.ai, aoife.harte@protex.ai',
  rules_editors: 'jemima.davison@protex.ai, aoife.harte@protex.ai, scott.cahill@protex.ai, rob.obeirne@protex.ai',
};

const std = (id: string, section: number, position: number, body: string, condition = ''): Clause => ({ id, kind: 'standard', section, position, condition, body });

export const DEFAULT_LIBRARY: Clause[] = [
  std(
    'tc_1a',
    1,
    1,
    'By signing this Order Form ("**Order Form**"), issuing a purchase order referencing this Order Form or accessing the Protex AI Offering, Client\'s use is subject to the Master Services Agreement or similar agreement separately executed between Client and {{entity}}, if such an agreement is in effect; or, if no such executed agreement exists, then {{msa_link}} ("**MSA**").',
  ),
  std('tc_1b', 1, 2, 'Capitalized terms not otherwise defined in this Order Form shall have the meanings ascribed to them in the MSA.'),
  std(
    'tc_2a',
    2,
    1,
    'Unless otherwise agreed in writing, the duration of the Subscription Term set out in this Order Form is a fixed-term minimum commitment from each Site\'s relevant Deployment Date. The "**Deployment Date**" is the date on which the first camera has been connected to the Device at a Site, and the first snapshot from the first camera is captured. Each Site will have its own Deployment Date.',
    'not_renewal',
  ),
  std('tc_2a_renewal', 2, 1, 'Unless otherwise agreed in writing, the duration of the Subscription Term set out in this Order Form is a fixed-term minimum commitment{{from_start}}.', 'renewal'),
  std(
    'tc_3a',
    3,
    1,
    'Fees exclude applicable sales tax, goods and services tax, withholding tax or VAT. If Client requires any withholding, then Fees will be grossed up to cover this deduction.',
  ),
  std(
    'tc_3b',
    3,
    2,
    'Unless expressly stated otherwise, Subscription Fees shown above are annual amounts payable for each year of the Subscription Term, subject to any applicable fee adjustments under the Agreement.',
  ),
  std(
    'tc_3c',
    3,
    3,
    'Fees are {{billing}}, with the first invoice being issued on or around the Order Form Effective Date. The "**Order Form Effective Date**" is the earlier of (i) the date of the last party signature below, and (ii) Protex AI\'s receipt of a purchase order.',
  ),
  std('tc_3d', 3, 4, '{{payment}}'),
  std(
    'tc_3e',
    3,
    5,
    'Devices will be delivered DAP to the agreed Site delivery address (Incoterms® 2020). Client is responsible for import clearance, import duties and taxes, and unloading. Shipping charges and lead times will be confirmed upon order confirmation. Protex AI may invoice Client separately for any pre-approved reasonably incurred travel and accommodation expenses.',
    'ships_devices',
  ),
  std(
    'tc_4a',
    4,
    1,
    '__Auto-Renewal__. Upon expiry of the initial Subscription Term for each Site, the Subscription Term shall automatically renew for successive periods of twelve (12) months (each, a "**Renewal Term**") at the then-current rates, as adjusted in accordance with the MSA, unless either party provides written notice of non-renewal at least sixty (60) days prior to the end of the then-current Subscription Term. Client must send any notice of non-renewal to accounts@protex.ai. Fees for each Renewal Term shall be invoiced annually in advance. For clarity, each Site\'s Subscription Term renews independently based on its respective Deployment Date.',
    'auto_renew',
  ),
  std(
    'tc_5a',
    5,
    1,
    '__Purchase Order Details__. If Client requires a purchase order number to be quoted on their invoices, this must be sent at the Order Form Effective Date by email to accounts@protex.ai and be for the full contract value. If it is not received, Protex AI shall be entitled to invoice without it.',
  ),
  std(
    'tc_5b',
    5,
    2,
    '__Billing Details__. (i) Protex AI shall invoice the Client using the Billing Details set out at the top of this Order Form. (ii) If the Client is unable to provide each of the Billing Details (Billing Address, Billing Email, EU VAT Number (if applicable) at the Order Form Effective Date, these should be sent by email to accounts@protex.ai as soon as reasonably possible. (iii) If the Client fails to provide Billing Details or Billing Details are inaccurate or unclear, Protex AI shall retain the right to suspend Client\'s access to Offering pending receipt.',
  ),
  std(
    'tc_6a',
    6,
    1,
    'Acceptance of this Order Form is limited to the terms of Protex AI\'s offer. Once accepted, these terms are the complete and exclusive statement of the agreement. Any modifications are expressly rejected by Protex AI and shall not become part of the agreement absent written acceptance.',
  ),
  std(
    'tc_7a',
    7,
    1,
    'This Order Form may be executed in any number and separate counterparts. Each counterpart when so executed shall be deemed to be an original and all of which together shall constitute one agreement. Transmission of the executed counterpart of this Order Form by email (in PDF, JPEG or other agreed format) shall take effect as delivery of an executed counterpart of this order form.',
  ),
  std(
    'tc_7b',
    7,
    2,
    'By signing below or issuing a purchase order which references this Order Form, the person doing so on behalf of Client represents and warrants that they have the full authority to bind the Client to this Order Form, which constitutes a binding contract between Client and Protex AI.',
  ),
  {
    id: 'price_cap',
    kind: 'special',
    title: 'Renewal price cap',
    summary: 'Renewal fees rise by no more than a set percentage.',
    input_kind: 'percent',
    input_label: 'Maximum increase (%)',
    role: 'finance',
    body: 'Notwithstanding the MSA, the fees for each Renewal Term will not increase by more than {{value}}% over the fees for the preceding term.',
  },
  {
    id: 'expansion_lock',
    kind: 'special',
    title: 'Expansion pricing lock',
    summary: 'Extra sites ordered within a set period get the same per-site and per-camera fees.',
    input_kind: 'months',
    input_label: 'Lock period (months)',
    role: 'sales',
    body: 'Additional Sites ordered within {{value}} months of the Order Form Effective Date will be charged at the same per-Site and per-Camera Integration fees as set out in this Order Form, for the remainder of the Subscription Term.',
  },
  {
    id: 'billing_from_deployment',
    kind: 'special',
    title: 'Invoice from each Deployment Date',
    summary: 'Each site is invoiced from its Deployment Date, not from signature.',
    role: 'finance',
    order_types: 'new_business, expansion',
    body: "Notwithstanding section 3C, the Subscription Fees for each Site will be invoiced from that Site's Deployment Date rather than the Order Form Effective Date.",
  },
  {
    id: 'ramp',
    kind: 'special',
    title: 'Ramped fees',
    summary: 'Year 1 at a reduced percentage of the fees; full fees from year 2. (Line items still show full price.)',
    input_kind: 'percent',
    input_label: 'Year 1 fees (% of full fees)',
    role: 'finance',
    body: 'The Subscription Fees for the first twelve (12) months of the Subscription Term will be {{value}}% of the Subscription Fees set out in this Order Form. The full Subscription Fees apply from the thirteenth (13th) month.',
  },
  {
    id: 'pilot_exit',
    kind: 'special',
    title: 'Pilot exit',
    summary: "Client can end the order within a set number of days of first deployment if agreed success criteria aren't met.",
    input_kind: 'days',
    input_label: 'Exit window (days after first Deployment Date)',
    role: 'legal',
    order_types: 'new_business',
    body: 'Client may terminate this Order Form by written notice to accounts@protex.ai within {{value}} days of the first Deployment Date if the success criteria agreed in writing between the parties before that date have not been met. On such termination, Protex AI will refund any prepaid Subscription Fees for the unused portion of the Subscription Term and Client will return all Devices.',
  },
  {
    id: 'reference',
    kind: 'special',
    title: 'Reference and logo rights',
    summary: 'Client agrees to be a reference and lets Protex use its name and logo.',
    role: '',
    body: "Client agrees that Protex AI may name Client as a customer and use Client's name and logo in its marketing materials, and Client will act as a reference for prospective customers on reasonable request.",
  },
  {
    id: 'data_residency',
    kind: 'special',
    title: 'Data residency',
    summary: 'Client Data is hosted in a set region.',
    input_kind: 'choice',
    input_label: 'Hosting region',
    input_options: 'European Union, United States, United Kingdom',
    role: 'legal',
    body: 'Client Data will be hosted in the {{value}}.',
  },
  {
    id: 'other',
    kind: 'special',
    title: 'Other special term',
    summary: 'Anything else, in your own words. Always needs Legal approval.',
    input_kind: 'text',
    input_label: 'Wording',
    role: 'legal',
    body: '{{value}}',
  },
];

/* ---------------- current settings ---------------- */

let rules: Rules = { ...DEFAULT_RULES };
let library: Clause[] = DEFAULT_LIBRARY.map((c) => ({ ...c, enabled: c.enabled ?? true }));

/** Use the settings loaded from HubDB. Missing rules and clauses fall back to the defaults. */
export function setSettings(next: { rules?: Rules; library?: Clause[] } | null) {
  rules = { ...DEFAULT_RULES, ...(next?.rules ?? {}) };
  const loaded = new Map((next?.library ?? []).map((c) => [c.id, c]));
  const ids = new Set([...DEFAULT_LIBRARY.map((c) => c.id), ...loaded.keys()]);
  library = [...ids].map((id) => {
    const base = DEFAULT_LIBRARY.find((c) => c.id === id);
    const mine = loaded.get(id);
    return { ...(base ?? {}), ...(mine ?? {}), enabled: (mine?.enabled ?? base?.enabled ?? true) !== false } as Clause;
  });
}

export const getRules = () => rules;
export const getLibrary = () => library;
export const rule = (key: string) => String(rules[key] ?? DEFAULT_RULES[key] ?? '');
export const ruleList = (key: string) =>
  rule(key)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
export const discountApprovalPct = () => {
  const n = Number(rule('discount_approval_pct'));
  return Number.isFinite(n) && n > 0 ? n : 20;
};
const emails = (key: string) => ruleList(key).map((e) => e.toLowerCase());
export const isRulesEditor = (email: string) => !!email && emails('rules_editors').includes(email.toLowerCase());
export const isLegalEditor = (email: string) => !!email && emails('legal_editors').includes(email.toLowerCase());

/** Clause wording as HTML: text escaped, then **bold** and __underline__ markers applied. */
export function formatClause(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>');
}
