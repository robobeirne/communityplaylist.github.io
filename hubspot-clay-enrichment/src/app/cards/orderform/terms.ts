// Turns the order form card's fields into the text of the order form quote: "Comments to buyer"
// (client and billing details, notes and site information) and "Terms" (the Terms and Conditions).
// Every HubSpot quote template shows both fields, so this works without template tokens.
//
// The Terms and Conditions are Protex's new business order form wording, word for word. Only the
// parts that vary by deal are filled in: billing frequency, payment terms, and the auto-renewal
// clause (left out if auto-renewal is switched off). TERMS_APPROVED in legal.ts controls the DRAFT
// notice until legal confirms this version.

import { parseDate, readSites, termEnd, termMonths, type Site, type Values } from './calc.ts';
import { PROTEX_ENTITY, STANDARD_MSA_URL, TERMS_APPROVED } from './legal.ts';

export { TERMS_APPROVED, PROTEX_ENTITY, STANDARD_MSA_URL };

const BILLING: Record<string, string> = {
  annually_in_advance: 'invoiced annually in advance',
  quarterly_in_advance: 'invoiced quarterly in advance',
  monthly_in_advance: 'invoiced monthly in advance',
  upfront_for_the_full_term: 'invoiced upfront for the full Subscription Term',
};
const NET: Record<string, string> = { net_30: '30', net_45: '45', net_60: '60', net_90: '90' };

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const oneLine = (s: unknown) => esc(String(s ?? '').trim()).replace(/\s*\r?\n\s*/g, ', ');
const has = (v: unknown) => String(v ?? '').trim() !== '';
const longDate = (v: unknown) => {
  const d = v instanceof Date ? v : parseDate(v);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
};
const para = (...parts: (string | false | null | undefined)[]) => {
  const body = parts.filter(Boolean).join('<br>');
  return body ? `<p>${body}</p>` : '';
};
const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '');

/** Auto-renewal is on unless the rep switched it off: it's part of the standard order form. */
export const autoRenews = (v: Values) => v.of_auto_renew !== 'false';

/** The subscription term as the order form states it. */
export function subscriptionTerm(v: Values): string {
  const months = termMonths(v.term_year_length);
  if (!months) return '';
  if (v.of_order_type === 'renewal') {
    const start = parseDate(v.contract_start_date);
    return start ? `${months} months from ${longDate(start)} to ${longDate(termEnd(start, months))}` : `${months} months`;
  }
  return `${months} months from each Site's Deployment Date`;
}

/** "15 Camera Integrations per Site", or the split per site when it isn't even. */
export function cameraApportionment(sites: Site[]): string {
  const withCams = sites.filter((s) => s.cameras > 0);
  if (!sites.length || !withCams.length) return '';
  const first = sites[0].cameras;
  if (sites.every((s) => s.cameras === first)) return `${first} Camera Integration${first === 1 ? '' : 's'} per Site`;
  return sites.map((s, i) => `${s.name || `Site ${i + 1}`}: ${s.cameras}`).join('; ');
}

/** "Comments to buyer": client and billing details, the notes, and the site information. */
export function orderComments(v: Values): string {
  const sites = readSites(v);
  const staged = v.of_rollout === 'staged_rollout';
  const term = subscriptionTerm(v);
  const apportion = cameraApportionment(sites);
  const po = has(v.purchase_order) ? esc(v.purchase_order) : v.of_po_required === 'true' ? 'Required (to be sent to accounts@protex.ai)' : '';
  return [
    para(`Quote Date: ${longDate(v.of_quote_date) || '—'} | Offer Expiry Date: ${longDate(v.of_offer_expiry_date) || '—'}`),
    para(
      '<strong>Client Details</strong>',
      `Legal Entity Name: ${esc(v.of_client_legal_name)}`,
      `Legal Entity Address: ${oneLine(v.of_client_legal_address)}`,
      has(v.of_client_company_number) && `Company Number: ${esc(v.of_client_company_number)}`,
      `Attn: ${esc(v.of_client_contact_name)}`,
      `Contact Email: ${esc(v.of_client_contact_email)}`,
    ),
    para(
      '<strong>Billing Details</strong>',
      `Billing Email: ${has(v.client_s_email_for_invoicing_) ? esc(v.client_s_email_for_invoicing_) : 'TBD'}`,
      `Billing Address: ${has(v.of_billing_address) ? oneLine(v.of_billing_address) : 'As legal entity address'}`,
      has(v.of_billing_contact_name) && `Billing Contact: ${esc(v.of_billing_contact_name)}`,
      has(v.of_client_tax_id) && `VAT Number: ${esc(v.of_client_tax_id)}`,
      po && `Purchase Order: ${po}`,
    ),
    term && para(`<strong>Subscription Term:</strong> ${esc(term)}`),
    '<p><strong>Notes</strong></p>',
    list(
      [
        'Each Protex AI Platform Site License includes the lease of one (1) Edge Device.',
        apportion && `The number of Camera Integrations specified above are apportioned between the number of ordered Sites: ${esc(apportion)}.`,
        'Camera integrations are limited to the number specified above. Each Device can hold up to 40 connected cameras, depending on stream configuration settings as set forth in the applicable Documentation. Additional camera integrations are chargeable. Additional Devices needed to support additional camera connections are chargeable. A reconnection fee may apply if a camera is deactivated and subsequently reconnected. Protex AI does not provide cameras.',
      ].filter(Boolean) as string[],
    ),
    '<p><strong>Site Information</strong></p>',
    sites.length
      ? para(
          ...sites.map((s, i) =>
            [
              `Site ${i + 1}: ${esc(s.name)}`,
              s.address && esc(s.address),
              s.cameras ? `${s.cameras} Camera Integration${s.cameras === 1 ? '' : 's'}` : '',
              staged && s.goLive ? `expected go-live ${longDate(s.goLive)}` : '',
            ]
              .filter(Boolean)
              .join(' — '),
          ),
        )
      : para('Site 1:'),
  ]
    .filter(Boolean)
    .join('\n');
}

/** "Terms": the Terms and Conditions. */
export function orderTerms(v: Values): string {
  const billing = BILLING[String(v.of_billing_frequency)] ?? 'invoiced annually in advance';
  const net = NET[String(v.of_payment_terms)];
  const payment = net ? `Payment terms Net ${net} days from invoice date. Fees to be paid by bank transfer.` : 'Payment is due on receipt of invoice. Fees to be paid by bank transfer.';
  const msaLink = STANDARD_MSA_URL ? `the Protex AI Master Services Agreement available at ${esc(STANDARD_MSA_URL)}` : 'the Protex AI Master Services Agreement';
  const sections: string[][] = [
    [
      `By signing this Order Form ("<strong>Order Form</strong>"), issuing a purchase order referencing this Order Form or accessing the Protex AI Offering, Client's use is subject to the Master Services Agreement or similar agreement separately executed between Client and ${esc(PROTEX_ENTITY)}, if such an agreement is in effect; or, if no such executed agreement exists, then ${msaLink} ("<strong>MSA</strong>").`,
      'Capitalized terms not otherwise defined in this Order Form shall have the meanings ascribed to them in the MSA.',
    ],
    [
      v.of_order_type === 'renewal'
        ? `Unless otherwise agreed in writing, the duration of the Subscription Term set out in this Order Form is a fixed-term minimum commitment${has(v.contract_start_date) ? ` from ${longDate(v.contract_start_date)}` : ''}.`
        : 'Unless otherwise agreed in writing, the duration of the Subscription Term set out in this Order Form is a fixed-term minimum commitment from each Site\'s relevant Deployment Date. The "<strong>Deployment Date</strong>" is the date on which the first camera has been connected to the Device at a Site, and the first snapshot from the first camera is captured. Each Site will have its own Deployment Date.',
    ],
    [
      'Fees exclude applicable sales tax, goods and services tax, withholding tax or VAT. If Client requires any withholding, then Fees will be grossed up to cover this deduction.',
      'Unless expressly stated otherwise, Subscription Fees shown above are annual amounts payable for each year of the Subscription Term, subject to any applicable fee adjustments under the Agreement.',
      `Fees are ${billing}, with the first invoice being issued on or around the Order Form Effective Date. The "<strong>Order Form Effective Date</strong>" is the earlier of (i) the date of the last party signature below, and (ii) Protex AI's receipt of a purchase order.`,
      payment,
      'Devices will be delivered DAP to the agreed Site delivery address (Incoterms® 2020). Client is responsible for import clearance, import duties and taxes, and unloading. Shipping charges and lead times will be confirmed upon order confirmation. Protex AI may invoice Client separately for any pre-approved reasonably incurred travel and accommodation expenses.',
    ],
  ];
  if (autoRenews(v))
    sections.push([
      '<u>Auto-Renewal</u>. Upon expiry of the initial Subscription Term for each Site, the Subscription Term shall automatically renew for successive periods of twelve (12) months (each, a "<strong>Renewal Term</strong>") at the then-current rates, as adjusted in accordance with the MSA, unless either party provides written notice of non-renewal at least sixty (60) days prior to the end of the then-current Subscription Term. Client must send any notice of non-renewal to accounts@protex.ai. Fees for each Renewal Term shall be invoiced annually in advance. For clarity, each Site\'s Subscription Term renews independently based on its respective Deployment Date.',
    ]);
  sections.push(
    [
      '<u>Purchase Order Details</u>. If Client requires a purchase order number to be quoted on their invoices, this must be sent at the Order Form Effective Date by email to accounts@protex.ai and be for the full contract value. If it is not received, Protex AI shall be entitled to invoice without it.',
      '<u>Billing Details</u>. (i) Protex AI shall invoice the Client using the Billing Details set out at the top of this Order Form. (ii) If the Client is unable to provide each of the Billing Details (Billing Address, Billing Email, EU VAT Number (if applicable) at the Order Form Effective Date, these should be sent by email to accounts@protex.ai as soon as reasonably possible. (iii) If the Client fails to provide Billing Details or Billing Details are inaccurate or unclear, Protex AI shall retain the right to suspend Client\'s access to Offering pending receipt.',
    ],
    [
      'Acceptance of this Order Form is limited to the terms of Protex AI\'s offer. Once accepted, these terms are the complete and exclusive statement of the agreement. Any modifications are expressly rejected by Protex AI and shall not become part of the agreement absent written acceptance.',
    ],
    [
      'This Order Form may be executed in any number and separate counterparts. Each counterpart when so executed shall be deemed to be an original and all of which together shall constitute one agreement. Transmission of the executed counterpart of this Order Form by email (in PDF, JPEG or other agreed format) shall take effect as delivery of an executed counterpart of this order form.',
      'By signing below or issuing a purchase order which references this Order Form, the person doing so on behalf of Client represents and warrants that they have the full authority to bind the Client to this Order Form, which constitutes a binding contract between Client and Protex AI.',
    ],
  );
  const out: string[] = [];
  if (!TERMS_APPROVED) out.push('<p><strong>DRAFT TERMS: NOT YET APPROVED BY LEGAL</strong></p>');
  out.push('<p><strong>Terms and Conditions</strong></p>');
  sections.forEach((clauses, i) => {
    clauses.forEach((text, j) => out.push(`<p><strong>${i + 1}${String.fromCharCode(65 + j)}.</strong> ${text}</p>`));
  });
  return out.join('\n');
}
