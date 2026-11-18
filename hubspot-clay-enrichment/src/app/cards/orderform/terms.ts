// Turns the order form card's fields into the text of the order form quote: "Comments to buyer"
// (the order details) and "Terms" (the contract wording). Every HubSpot quote template shows
// both fields, so this works without template tokens.
//
// LEGAL: the wording below is a placeholder written from the card's fields. Until legal approves
// it, TERMS_APPROVED in legal.ts stays false: the card warns, and the quote's terms start with a
// DRAFT notice so an unapproved version can't go out looking final.

import { parseDate, readSites, siteSchedule, termEnd, termMonths, msaStatus, type Values } from './calc.ts';
import { PROTEX_ENTITY, STANDARD_MSA_URL, TERMS_APPROVED } from './legal.ts';

export { TERMS_APPROVED, PROTEX_ENTITY, STANDARD_MSA_URL };

const BILLING: Record<string, string> = {
  annually_in_advance: 'annually in advance',
  quarterly_in_advance: 'quarterly in advance',
  monthly_in_advance: 'monthly in advance',
  upfront_for_the_full_term: 'upfront for the full term',
};
const PAYMENT: Record<string, string> = {
  net_30: 'within 30 days of the invoice date',
  net_45: 'within 45 days of the invoice date',
  net_60: 'within 60 days of the invoice date',
  net_90: 'within 90 days of the invoice date',
  due_on_receipt: 'on receipt of the invoice',
};

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const lines = (s: unknown) => esc(String(s ?? '').trim()).replace(/\r?\n/g, '<br>');
const has = (v: unknown) => String(v ?? '').trim() !== '';
const longDate = (v: unknown) => {
  const d = v instanceof Date ? v : parseDate(v);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
};
const p = (...parts: (string | false | null | undefined)[]) => {
  const body = parts.filter(Boolean).join('<br>');
  return body ? `<p>${body}</p>` : '';
};

/** "Comments to buyer": who, when, how billed, and where. */
export function orderComments(v: Values): string {
  const sites = readSites(v);
  const start = parseDate(v.contract_start_date);
  const months = termMonths(v.term_year_length);
  const end = start && months ? termEnd(start, months) : null;
  const staged = v.of_rollout === 'staged_rollout';
  const ids = [has(v.of_client_company_number) && `Company number: ${esc(v.of_client_company_number)}`, has(v.of_client_tax_id) && `VAT / tax ID: ${esc(v.of_client_tax_id)}`]
    .filter(Boolean)
    .join(' · ');
  const contact = [esc(v.of_client_contact_name), has(v.of_client_contact_title) && esc(v.of_client_contact_title), esc(v.of_client_contact_email)].filter(Boolean).join(', ');
  const billingWho = [has(v.of_billing_contact_name) && esc(v.of_billing_contact_name), esc(v.client_s_email_for_invoicing_)].filter(Boolean).join(', ');
  const po = v.of_po_required === 'true' ? `PO required before invoicing${has(v.purchase_order) ? `: ${esc(v.purchase_order)}` : ''}` : has(v.purchase_order) ? `PO: ${esc(v.purchase_order)}` : '';
  return [
    p('<strong>Client</strong>', esc(v.of_client_legal_name), lines(v.of_client_legal_address), ids),
    p('<strong>Contacts</strong>', contact && `Main contact: ${contact}`, billingWho && `Billing: ${billingWho}`, has(v.of_billing_address) && `Billing address: ${lines(v.of_billing_address)}`),
    p(
      '<strong>Subscription term</strong>',
      start && `Starts ${longDate(start)}${months ? ` · ${months} months` : ''}${end ? ` · ends ${longDate(end)}` : ''}`,
      has(v.subscription_start_date) && `Billing starts ${longDate(v.subscription_start_date)}`,
    ),
    p('<strong>Billing</strong>', [BILLING[String(v.of_billing_frequency)] && `Invoiced ${BILLING[String(v.of_billing_frequency)]}`, PAYMENT[String(v.of_payment_terms)] && `payable ${PAYMENT[String(v.of_payment_terms)]}`].filter(Boolean).join(', '), po),
    sites.length
      ? p(
          `<strong>Sites (${sites.length})</strong>`,
          staged ? 'Staged rollout, each site going live on the date shown.' : 'All sites go live on the subscription start date.',
          ...siteSchedule(sites, staged, start).split('\n').map(esc),
        )
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function msaClause(v: Values): string {
  const status = msaStatus(v);
  if (status === 'standard_msa')
    return `${esc(PROTEX_ENTITY)}'s standard Master Subscription Agreement${STANDARD_MSA_URL ? ` at ${esc(STANDARD_MSA_URL)}` : ''}, which the Client accepts by signing this Order Form`;
  const date = longDate(v.of_msa_date);
  return `the Master Subscription Agreement between the parties${date ? ` dated ${date}` : ''}`;
}

/** "Terms": the contract wording, built from the card's fields. */
export function orderTerms(v: Values): string {
  const start = parseDate(v.contract_start_date);
  const months = termMonths(v.term_year_length);
  const end = start && months ? termEnd(start, months) : null;
  const sites = readSites(v);
  const staged = v.of_rollout === 'staged_rollout';
  const client = esc(v.of_client_legal_name) || 'the Client';
  const out: string[] = [];
  if (!TERMS_APPROVED) out.push('<p><strong>DRAFT TERMS: NOT YET APPROVED BY LEGAL</strong></p>');
  let n = 0;
  const clause = (title: string, text: string) => out.push(`<p><strong>${++n}. ${title}.</strong> ${text}</p>`);
  clause(
    'Agreement',
    `This Order Form is between ${esc(PROTEX_ENTITY)} and ${client} (the "Client") and is governed by ${msaClause(v)}. If this Order Form and the Master Subscription Agreement conflict, this Order Form prevails for the services it describes.`,
  );
  if (v.of_order_type === 'renewal')
    clause('Renewal', `This Order Form renews the Client's existing subscription${v.pro_rata_renewal === 'Yes' ? ', with fees pro-rated to the dates below' : ''}.`);
  if (v.of_order_type === 'expansion') clause('Expansion', "This Order Form adds to the Client's existing subscription.");
  clause(
    'Subscription term',
    `The subscription starts on ${longDate(start) || '[start date]'} and runs for ${months ? `${months} months` : '[term]'}${end ? `, ending on ${longDate(end)}` : ''}. ${
      v.of_auto_renew === 'true'
        ? 'It renews automatically for further 12-month periods unless either party gives at least 60 days’ written notice before the end of the current term.'
        : 'It does not renew automatically.'
    }`,
  );
  clause(
    'Fees and payment',
    `The Client will pay the fees set out in this Order Form, invoiced ${BILLING[String(v.of_billing_frequency)] ?? '[billing frequency]'} and payable ${PAYMENT[String(v.of_payment_terms)] ?? '[payment terms]'}.${
      v.of_po_required === 'true' ? ' The Client will provide a purchase order before the first invoice.' : ''
    } Fees exclude VAT and other applicable taxes.`,
  );
  if (sites.length)
    clause('Sites', `The subscription covers the ${sites.length} site${sites.length === 1 ? '' : 's'} listed in this Order Form${staged ? ', each from its go-live date' : ''}.`);
  if (has(v.of_offer_expiry_date)) clause('Validity', `This offer is valid until ${longDate(v.of_offer_expiry_date)}.`);
  return out.join('\n');
}
