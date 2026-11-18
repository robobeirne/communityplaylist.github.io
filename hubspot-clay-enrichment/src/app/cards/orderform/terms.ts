// Turns the order form card's fields into the text of the order form quote: "Comments to buyer"
// (client and billing details, notes and site information) and "Terms" (the Terms and Conditions).
// Every HubSpot quote template shows both fields, so this works without template tokens.
//
// The Terms and Conditions are Protex's new business order form wording, word for word. Only the
// parts that vary by deal are filled in: billing frequency, payment terms, and the auto-renewal
// clause (left out if auto-renewal is switched off).

import { isNewSite, parseDate, readSites, termEnd, termMonths, type Site, type Values } from './calc.ts';
import { PROTEX_ENTITY, STANDARD_MSA_URL } from './legal.ts';
import { activeTerms } from './specialterms.ts';
import { formatClause, getLibrary, type Clause } from './settings.ts';
import { readAmendments } from './amendments.ts';

export { PROTEX_ENTITY, STANDARD_MSA_URL };

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

/** The sites this order adds: every site for new business, only the new ones on a renewal or expansion. */
export function sitesOnOrder(v: Values): Site[] {
  return readSites(v).filter((s) => isNewSite(s, v.of_order_type));
}

/**
 * "Comments to buyer": client and billing details, subscription term, notes and site information.
 *
 * HTML contract with the quote template: plain semantic tags only (table/thead/tbody/tr/th/td,
 * h3, p, ul/li, strong, u), no classes or inline styles. The template styles them by element
 * inside its Comments and Terms wrappers. The template should not rebuild these sections itself.
 */
export function orderComments(v: Values): string {
  const staged = v.of_rollout === 'staged_rollout';
  const term = subscriptionTerm(v);
  // Sites and delivery only cover the sites this order adds: all of them for new business, only
  // the new ones on a renewal or expansion. A renewal of existing sites has no site section.
  const sites = sitesOnOrder(v);
  const apportion = cameraApportionment(sites);
  const po = has(v.purchase_order) ? esc(v.purchase_order) : v.of_po_required === 'true' ? 'Required (to be sent to accounts@protex.ai)' : '';
  const label = (l: string, value: string) => `<strong>${l}:</strong> ${value}`;
  const client = [
    label('Legal Entity Name', esc(v.of_client_legal_name)),
    label('Legal Entity Address', oneLine(v.of_client_legal_address)),
    has(v.of_client_company_number) && label('Company Number', esc(v.of_client_company_number)),
    label('Attn', esc(v.of_client_contact_name)),
    label('Contact Email', esc(v.of_client_contact_email)),
  ].filter(Boolean) as string[];
  const billing = [
    label('Billing Email', has(v.client_s_email_for_invoicing_) ? esc(v.client_s_email_for_invoicing_) : 'TBD'),
    label('Billing Address', has(v.of_billing_address) ? oneLine(v.of_billing_address) : 'As legal entity address'),
    has(v.of_billing_contact_name) && label('Billing Contact', esc(v.of_billing_contact_name)),
    has(v.of_client_tax_id) && label('VAT Number', esc(v.of_client_tax_id)),
    po && label('Purchase Order', po),
  ].filter(Boolean) as string[];
  const rows = Array.from({ length: Math.max(client.length, billing.length) }, (_, i) => `<tr><td>${client[i] ?? ''}</td><td>${billing[i] ?? ''}</td></tr>`);
  const newBusiness = v.of_order_type !== 'renewal' && v.of_order_type !== 'expansion';
  const listed: Site[] = sites.length ? sites : newBusiness ? [{ name: '', address: '', cameras: 0, goLive: '' }] : [];
  const siteHead = ['Site', 'Delivery Address', 'Camera Integrations', ...(staged ? ['Expected Go-live'] : [])];
  const siteRows = listed.map((s, i) => {
    const cells = [`Site ${i + 1}: ${esc(s.name)}`, esc(s.address), s.cameras ? String(s.cameras) : '', ...(staged ? [longDate(s.goLive)] : [])];
    return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  });
  return [
    `<table><thead><tr><th>Client Details</th><th>Billing Details</th></tr></thead><tbody>${rows.join('')}</tbody></table>`,
    term && `<h3>Subscription Term</h3><p>${esc(term)}</p>`,
    '<h3>Notes</h3>',
    list(
      [
        'Each Protex AI Platform Site License includes the lease of one (1) Edge Device.',
        apportion && `The number of Camera Integrations specified above are apportioned between the number of ordered Sites: ${esc(apportion)}.`,
        'Camera integrations are limited to the number specified above. Each Device can hold up to 40 connected cameras, depending on stream configuration settings as set forth in the applicable Documentation. Additional camera integrations are chargeable. Additional Devices needed to support additional camera connections are chargeable. A reconnection fee may apply if a camera is deactivated and subsequently reconnected. Protex AI does not provide cameras.',
      ].filter(Boolean) as string[],
    ),
    listed.length && `<h3>${newBusiness ? 'Site Information' : 'New Sites'}</h3>`,
    listed.length && `<table><thead><tr>${siteHead.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${siteRows.join('')}</tbody></table>`,
  ]
    .filter(Boolean)
    .join('');
}

/** The delivery clause only applies when this order ships devices: new business, or a renewal or expansion that adds sites. */
const shipsDevices = (v: Values) => (v.of_order_type !== 'renewal' && v.of_order_type !== 'expansion') || sitesOnOrder(v).length > 0;

/** Values for the {{placeholders}} in clause wording; HTML-escaped for the quote, plain for editing. */
function clauseTokens(v: Values, html: boolean): Record<string, string> {
  const e = html ? esc : (x: string) => x;
  const billing = BILLING[String(v.of_billing_frequency)] ?? 'invoiced annually in advance';
  const net = NET[String(v.of_payment_terms)];
  const payment = net ? `Payment terms Net ${net} days from invoice date. Fees to be paid by bank transfer.` : 'Payment is due on receipt of invoice. Fees to be paid by bank transfer.';
  return {
    entity: e(PROTEX_ENTITY),
    msa_link: STANDARD_MSA_URL ? `the Protex AI Master Services Agreement available at ${e(STANDARD_MSA_URL)}` : 'the Protex AI Master Services Agreement',
    billing: e(billing),
    payment: e(payment),
    from_start: has(v.contract_start_date) ? ` from ${e(longDate(v.contract_start_date))}` : '',
  };
}
const fillTokens = (text: string, tokens: Record<string, string>) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => tokens[k] ?? '');

/** Standard clauses that apply to this deal (enabled, condition met), in order. */
function applicableClauses(v: Values): Clause[] {
  const applies = (condition = '') =>
    !condition ||
    (condition === 'renewal' && v.of_order_type === 'renewal') ||
    (condition === 'not_renewal' && v.of_order_type !== 'renewal') ||
    (condition === 'ships_devices' && shipsDevices(v)) ||
    (condition === 'auto_renew' && autoRenews(v));
  return getLibrary()
    .filter((c) => c.kind === 'standard' && c.enabled !== false && applies(c.condition))
    .sort((a, b) => (a.section ?? 0) - (b.section ?? 0) || (a.position ?? 0) - (b.position ?? 0));
}

export interface DealClause {
  id: string;
  /** "3D", or "S1" for a special term. */
  label: string;
  title: string;
  /** The standard wording with this deal's details filled in (plain text with **markers**). */
  standard: string;
  kind: 'standard' | 'special';
}

/** Every clause on this deal's order form, as legal sees them for amending (standard numbering). */
export function dealClauses(v: Values): DealClause[] {
  const tokens = clauseTokens(v, false);
  const std = applicableClauses(v);
  const sectionIds = [...new Set(std.map((c) => c.section ?? 0))];
  const out: DealClause[] = [];
  sectionIds.forEach((id, i) =>
    std
      .filter((c) => (c.section ?? 0) === id)
      .forEach((c, j) => out.push({ id: c.id, label: `${i + 1}${String.fromCharCode(65 + j)}`, title: '', standard: fillTokens(c.body, tokens), kind: 'standard' })),
  );
  activeTerms(v).forEach(({ term, value }, i) => {
    const body = getLibrary().find((c) => c.id === term.id)?.body ?? '';
    out.push({ id: term.id, label: `S${i + 1}`, title: term.title, standard: fillTokens(body, { ...tokens, value }), kind: 'special' });
  });
  return out;
}

/** "Terms": the Terms and Conditions. */
export function orderTerms(v: Values): string {
  const amendments = readAmendments(v).amendments;
  const amendmentOf = (id: string) => amendments.find((x) => x.clauseId === id);
  const tokens = clauseTokens(v, true);
  // The standard clauses from the Terms library, grouped into numbered sections, with this deal's
  // amendments applied. Sections with no clause left (e.g. auto-renewal off) drop out and the rest
  // renumber.
  const clauses = applicableClauses(v).filter((c) => !amendmentOf(c.id)?.removed);
  const sectionIds = [...new Set(clauses.map((c) => c.section ?? 0))];
  const sections: string[][] = sectionIds.map((id) =>
    clauses.filter((c) => (c.section ?? 0) === id).map((c) => fillTokens(formatClause(amendmentOf(c.id)?.text ?? c.body), tokens)),
  );
  const out: string[] = [];
  out.push('<h3>Terms and Conditions</h3>');
  // One row per numbered section; its lettered clauses (A, B…) as paragraphs, like the order form.
  const rows = sections.map(
    (clauses, i) => `<tr><td>${i + 1}</td><td>${clauses.map((text, j) => `<p><strong>${String.fromCharCode(65 + j)}.</strong> ${text}</p>`).join('')}</td></tr>`,
  );
  out.push(`<table><tbody>${rows.join('')}</tbody></table>`);
  // Special terms the rep ticked, after the standard terms.
  const special = activeTerms(v).filter(({ term, value }) => (!term.input || value) && !amendmentOf(term.id)?.removed);
  if (special.length) {
    out.push('<h3>Special Terms</h3>');
    out.push('<p>The following special terms form part of this Order Form and prevail over the Terms and Conditions above and the MSA to the extent of any conflict.</p>');
    out.push(
      `<table><tbody>${special.map(({ term, value }, i) => `<tr><td>S${i + 1}</td><td><p><strong>${esc(term.title)}.</strong> ${amendmentOf(term.id) ? fillTokens(formatClause(amendmentOf(term.id)!.text), { ...tokens, value: esc(value) }) : term.clause(value)}</p></td></tr>`).join('')}</tbody></table>`,
    );
  }
  return out.join('');
}
