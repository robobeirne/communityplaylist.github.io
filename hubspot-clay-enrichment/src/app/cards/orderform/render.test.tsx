// Renders the Order form card with HubSpot's test renderer and walks it the way a rep would.
// Run with `npm run test:render`.
import React from 'react';
import assert from 'node:assert/strict';
import { createRenderer } from '@hubspot/ui-extensions/testing';
import { Accordion, Alert, Tab, Tabs, ToggleGroup, Button, Heading, Input, Link, LoadingButton, NumberInput, Select, StatisticsItem, StatusTag, Tag, Text, TextArea } from '@hubspot/ui-extensions';
import { OrderForm } from '../OrderForm.tsx';

const calls: { name: string; parameters: Record<string, any> }[] = [];
const PRODUCTS = [
  { id: '2281317872', name: 'Protex AI Platform Site License - Safety', sku: '1', description: '', prices: { GBP: 33300, USD: 45000 }, frequency: 'annually' },
  { id: '2282093038', name: 'Camera Integration - Safety', sku: '2', description: '', prices: { GBP: 750, USD: 1000 }, frequency: 'annually' },
  { id: '2282093039', name: 'On-site Installation', sku: '3', description: '', prices: { GBP: 3750 }, frequency: '' },
];
const LINE = (id: string, productId: string, quantity: number, extra: Record<string, string> = {}) => {
  const p = PRODUCTS.find((x) => x.id === productId)!;
  return {
    id,
    properties: {
      hs_product_id: productId,
      name: p.name,
      hs_sku: p.sku,
      quantity: String(quantity),
      price: String(p.prices.GBP),
      hs_line_item_currency_code: 'GBP',
      recurringbillingfrequency: p.frequency,
      hs_recurring_billing_period: p.frequency ? 'P24M' : '',
      hs_recurring_billing_start_date: p.frequency ? '2027-01-01' : '',
      ...extra,
    },
  };
};
let dealLines: ReturnType<typeof LINE>[] = [];
let asUser = { email: 'rep@protex.ai', firstName: 'Rob', lastName: 'Rep' };
let currentApproval = '';
const approvalAfterDecision = (p: any) => {
  const rec = JSON.parse(currentApproval);
  rec.roles[p.role] = { ...rec.roles[p.role], status: p.decision, by: p.user.name, note: p.note };
  return JSON.stringify(rec);
};
let extraProducts: typeof PRODUCTS = [];
const FREE = (id: string, name: string) => ({ id, name, sku: '', description: '', prices: { GBP: 0, EUR: 0, USD: 0, CAD: 0 }, frequency: 'annually' });
const INCLUSIONS = [
  FREE('414730536132', 'Protex AI Licence - Intelligence (Free)'),
  FREE('427764333792', 'Deployment Services'),
  FREE('455664370894', 'Standard Support Services'),
];
type Q = { id: string; title: string; state: string; expires: string; link: string };
let dealQuotes: Q[] = [];
let quoteId = '';
const g = globalThis as Record<string, unknown>;
g.self ??= globalThis; // the extension worker's global, which hubspot.serverless() reads
g.serverless = async (name: string, opts: { parameters: Record<string, any> }) => {
  calls.push({ name, parameters: opts.parameters });
  if (opts.parameters.action === 'signatories') {
    return { statusCode: 200, body: { ok: true, users: [{ id: '1398950922464', name: 'Jesse Maggs', email: 'jesse@protex.ai', title: '' }] } };
  }
  if (opts.parameters.action === 'parties') {
    return {
      statusCode: 200,
      body: {
        ok: true,
        contacts: [
          { id: '501', name: 'Alex Kim', email: 'alex@northbridge.example', title: 'COO' },
          { id: '502', name: 'Pat Fox', email: 'ap@northbridge.example', title: 'Finance Manager' },
          { id: '503', name: '', email: 'ops@northbridge.example', title: '' },
        ],
        company: { id: '9', name: 'Northbridge Logistics Ltd', address: '1 Dock Road', address2: '', city: 'Leeds', state: '', zip: 'LS1 1AA', country: 'United Kingdom' },
      },
    };
  }
  if (opts.parameters.action === 'settings') return { statusCode: 200, body: { ok: true, source: 'hubdb', rules: {}, library: [] } };
  if (opts.parameters.action === 'save_settings') return { statusCode: 200, body: { ok: true, source: 'hubdb', rules: opts.parameters.rules ?? {}, library: opts.parameters.clauses ?? [] } };
  if (opts.parameters.action === 'request_approval') {
    const { request, requestedBy } = opts.parameters;
    const roles = Object.fromEntries(Object.entries(request.approvers).map(([r, a]: [string, any]) => [r, { approver: a, status: 'pending' }]));
    return { statusCode: 200, body: { ok: true, properties: { of_approval: JSON.stringify({ fingerprint: request.fingerprint, reasons: request.reasons, requestedBy, roles }), of_approval_status: 'pending' } } };
  }
  if (opts.parameters.action === 'decide_approval') {
    return { statusCode: 200, body: { ok: true, properties: { of_approval: approvalAfterDecision(opts.parameters), of_approval_status: opts.parameters.decision } } };
  }
  if (opts.parameters.action === 'quote') {
    const live = dealQuotes.filter((q) => ['draft', 'awaiting_approval', 'sent', 'signed'].includes(q.state));
    return {
      statusCode: 200,
      body: { ok: true, quotes: dealQuotes, current: dealQuotes.find((q) => q.id === quoteId) ?? null, live, templates: [{ id: '55', name: 'Protex order form' }], templatesError: '', properties: {} },
    };
  }
  if (opts.parameters.action === 'create_quote') {
    dealQuotes = [...dealQuotes.filter((q) => q.id !== opts.parameters.replaceQuoteId), { id: '950', title: opts.parameters.title, state: 'draft', expires: '2026-12-17T23:59:59.000Z', link: '' }];
    quoteId = '950';
    return { statusCode: 200, body: { ok: true, quote: dealQuotes[dealQuotes.length - 1], properties: { of_quote_id: '950', of_status: 'ready_to_send', of_quote_status: 'draft', of_changed_after_quote: 'false' } } };
  }
  if (opts.parameters.action === 'pricing') return { statusCode: 200, body: { ok: true, lines: dealLines, products: [...PRODUCTS, ...extraProducts] } };
  const ch = opts.parameters.lines ?? {};
  const created = (ch.create ?? []).map((c: any, i: number) => LINE(String(900 + i), c.productId, c.quantity));
  dealLines = [...dealLines.filter((l) => !(ch.remove ?? []).includes(l.id)), ...created];
  return { statusCode: 200, body: { ok: true, properties: opts.parameters.properties, lines: dealLines } };
};

async function renderWith(props: Record<string, string>, lines: ReturnType<typeof LINE>[] = [], quotes: Q[] = []) {
  dealLines = lines;
  dealQuotes = quotes;
  quoteId = props.of_quote_id ?? '';
  const r = createRenderer('crm.record.tab');
  r.mocks.actions.fetchCrmObjectProperties.willCall(async () => props);
  r.mocks.actions.onCrmPropertiesUpdate.willCall(() => {});
  r.mocks.actions.refreshObjectProperties.willCall(() => {});
  r.mocks.actions.addAlert.willCall(() => {});
  r.render(<OrderForm actions={r.mocks.actions as never} dealId="77" portalId="24888392" user={asUser} />);
  await r.waitFor(() => assert.ok(r.maybeFind(Heading)));
  await r.waitFor(() => assert.ok(!texts(r).join(' ').includes('Line items (loading)')));
  await r.waitFor(() => assert.ok(button(r, 'Fill from the company')));
  await r.waitFor(() => assert.ok(!texts(r).includes("Checking the deal's quotes") && texts(r).includes('Order form quote')));
  return r;
}
type R = Awaited<ReturnType<typeof renderWith>>;
const sections = (r: R) => r.findAll(Tab);
const tabTitle = (r: R, key: string) => String(sections(r).find((t) => t.props.tabId === key)!.props.title);
const selectedTab = (r: R) => r.find(Tabs).props.selected;
const lastCreate = () => [...calls].reverse().find((c) => c.parameters.action === 'create_quote')?.parameters;
const texts = (r: R) => r.findAll(Text).map((t) => t.text);
const field = (r: R, name: string) => [...r.findAll(Input), ...r.findAll(TextArea)].find((x) => x.props.name === name)!;
const select = (r: R, name: string) => r.findAll(Select).find((x) => x.props.name === name)!;
const button = (r: R, text: string) => [...r.findAll(Button), ...r.findAll(LoadingButton)].find((b) => b.text === text);
const lastCall = () => [...calls].reverse().find((c) => c.parameters.action === 'save')!.parameters;
const lastSave = () => lastCall().properties;
const num = (r: R, name: string) => r.findAll(NumberInput).find((n) => n.props.name === name)!;

// A new deal: nothing filled in.
let r = await renderWith({ pipeline: 'default', dealname: 'Northbridge' });
assert.equal(r.find(Heading).text, 'Order form');
assert.ok(r.findAll(Tag).some((t) => t.text === 'New business'), 'order type comes from the pipeline');
assert.equal(sections(r).length, 3);
assert.ok(r.findAll(Alert).some((a) => String(a.props.title).startsWith('Still needed before sending')));
const gated = [...r.findAll(LoadingButton)].find((b) => b.text.startsWith('Create order form'));
assert.ok(gated && gated.props.disabled && / to fill$/.test(gated.text), 'Create order form shows, disabled, with how much is left');
assert.equal(selectedTab(r), 'deal');
assert.deepEqual(sections(r).map((t) => String(t.props.title).replace(/ \(\d+ missing\)/, '')), ['Order & client', 'Sites & products', 'Legal & signing'], 'three short tab titles');
assert.ok(/^Sites & products \(\d+ missing\)$/.test(tabTitle(r, 'scope')));
assert.ok(calls.some((c) => c.parameters.action === 'signatories'), 'loads the Protex signatories');
await r.waitFor(() => assert.ok(select(r, 'pick-Fill from a deal contact')));
assert.deepEqual(
  select(r, 'pick-Fill from a deal contact').props.options.map((o: { label: string }) => o.label),
  ['Alex Kim — COO — alex@northbridge.example', 'Pat Fox — Finance Manager — ap@northbridge.example', 'ops@northbridge.example'],
  'contacts show names, titles and emails, never a bare ID',
);
console.log('new deal: three tabs, still-needed alert, Create order form disabled');

// Fill from the company and a deal contact, then save.
button(r, 'Fill from the company')!.trigger('onClick');
select(r, 'pick-Fill from a deal contact').trigger('onChange', '501' as never);
await r.waitFor(() => assert.equal(field(r, 'of_client_contact_name').props.value, 'Alex Kim'));
assert.equal(field(r, 'of_client_legal_name').props.value, 'Northbridge Logistics Ltd');
assert.equal(field(r, 'of_client_legal_address').props.value, '1 Dock Road, Leeds, LS1 1AA, United Kingdom');
r.find(LoadingButton).trigger('onClick');
await r.waitFor(() => assert.ok(calls.some((c) => c.parameters.action === 'save')));
let saved = lastSave();
assert.equal(saved.of_client_legal_name, 'Northbridge Logistics Ltd');
assert.equal(saved.of_client_contact_email, 'alex@northbridge.example');
assert.equal(saved.of_order_type, 'new_business', 'saves the default order type the first time');
assert.equal(saved.amount, undefined, "no line items: the rep's own Amount is left alone");
assert.equal(saved.of_annual_subscription_fee, '0', 'saves the calculated totals with it');
assert.deepEqual(lastCall().lines, { create: [], update: [], remove: [] }, 'no line item changes');
console.log('fills from the company and a contact, and saves with the calculated fields');

// The signatory dropdown fills name and email.
select(r, 'of_protex_signer_user_id').trigger('onChange', '1398950922464' as never);
await r.waitFor(() => assert.equal(field(r, 'of_protex_signer_email').props.value, 'jesse@protex.ai'));
assert.equal(field(r, 'of_protex_signer_name').props.value, 'Jesse Maggs');
console.log('Protex signatory fills name and email');

// A complete deal: ready to send.
const complete: Record<string, string> = {
  pipeline: 'default',
  of_order_type: 'new_business',
  of_status: 'draft',
  of_client_legal_name: 'Northbridge Logistics Ltd',
  of_client_legal_address: '1 Dock Road, Leeds',
  of_client_contact_name: 'Alex Kim',
  of_client_contact_email: 'alex@northbridge.example',
  client_s_email_for_invoicing_: 'ap@northbridge.example',
  of_quote_date: '2026-11-17',
  of_offer_expiry_date: '2026-12-17',
  of_target_signature_date: '2026-12-10',
  deal_currency_code: 'GBP',
  contract_start_date: '2027-01-01',
  term_year_length: '24 months',
  of_billing_frequency: 'annually_in_advance',
  of_payment_terms: 'net_30',
  of_rollout: 'all_sites_together',
  of_sites: JSON.stringify([
    { name: 'Leeds DC', cameras: 12, goLive: '' },
    { name: 'Wakefield', cameras: 10, goLive: '' },
    { name: 'Doncaster', cameras: 8, goLive: '' },
  ]),
  of_msa_status: 'existing_msa',
  of_msa_date: '2025-06-01',
  of_counterparty_signer_contact_id: '501',
  of_counterparty_signer_name: 'Alex Kim',
  of_counterparty_signer_email: 'alex@northbridge.example',
  of_counterparty_signer_title: 'COO',
  of_protex_signer_user_id: '1398950922464',
  of_protex_signer_name: 'Jesse Maggs',
  of_protex_signer_email: 'jesse@protex.ai',
  of_protex_signer_title: 'CEO',
};
const COMPLETE_LINES = [LINE('501', '2281317872', 3), LINE('502', '2282093038', 30), LINE('503', '2282093039', 3)];
r = await renderWith(complete, COMPLETE_LINES);
assert.ok(r.findAll(Alert).some((a) => a.props.title === 'Everything the order form needs is here'), JSON.stringify(r.findAll(Alert).map((a) => a.props.title)));
assert.deepEqual(
  r.findAll(StatisticsItem).map((s) => [s.props.label, s.props.number]),
  [
    ['Annual subscription', '£122,400.00'],
    ['Total contract value', '£256,050.00'],
    ['Discount', 'None'],
    ['Sites', '3'],
  ],
);
assert.ok(sections(r).every((a) => String(a.props.title).endsWith(' ✓')));
assert.equal(selectedTab(r), 'deal');
// Save first (sends the calculated fields), then create the order form quote.
field(r, 'of_legal_notes').trigger('onChange', 'Standard deal' as never);
await r.waitFor(() => assert.ok(button(r, 'Save changes')));
assert.ok(button(r, 'Save, then create the order form')?.props.disabled, 'unsaved changes block creating the quote');
button(r, 'Save changes')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastSave().of_legal_notes, 'Standard deal'));
saved = lastSave();
assert.equal(saved.of_total_contract_value, '256050');
assert.equal(saved.number_of_sites_to_start, '3');
assert.equal(saved.amount, '122400', 'the deal Amount is the annual subscription from the line items');
assert.equal(saved.of_pricing_table.split('\n')[0], 'Protex AI Platform Site License - Safety (1) — 3 × £33,300.00 — £99,900.00 per year');
assert.equal(
  saved.of_site_schedule,
  '1. Leeds DC — 12 camera integrations — go-live 1 Jan 2027\n2. Wakefield — 10 camera integrations — go-live 1 Jan 2027\n3. Doncaster — 8 camera integrations — go-live 1 Jan 2027',
);
assert.equal(select(r, 'quote-template').props.value, '55', 'picks the order form template');
await r.waitFor(() => assert.equal(button(r, 'Create order form')?.props.disabled, false));
button(r, 'Create order form')!.trigger('onClick');
await r.waitFor(() => assert.ok(lastCreate()));
const created = lastCreate()!;
assert.equal(created.templateId, '55');
assert.equal(created.expirationDate, '2026-12-17');
assert.equal(created.signerContactId, '501');
assert.equal(created.companyId, '9');
assert.equal(created.currency, 'GBP');
assert.deepEqual(created.sender, { firstName: 'Rob', lastName: 'Rep', email: 'rep@protex.ai', company: 'Protex AI Limited' });
assert.ok(created.terms.includes('www.protex.ai/legal'));
assert.ok(created.comments.includes("12 months from each Site's Deployment Date") || created.comments.includes('24 months from each Site'));
assert.ok(created.comments.includes('Northbridge Logistics Ltd'));
await r.waitFor(() => assert.ok(texts(r).some((t) => t.startsWith('Next: open the quote, check it, add Jesse Maggs as the countersigner'))));
assert.ok(r.findAll(Link).some((l) => l.props.href === 'https://app.hubspot.com/quotes/24888392/details/950'));
assert.ok(r.findAll(StatusTag).some((t) => t.text === 'Ready to send'), 'status moves to Ready to send');
assert.equal(button(r, 'Create order form'), undefined, 'no second quote while this one is live');
console.log('complete deal: £122,400 a year, £256,050 TCV; Create order form makes the quote with the terms, signer and template');

// A per-line discount needs a reason, flags approval at 20%, and saves to the line item.
r = await renderWith(complete, COMPLETE_LINES);
num(r, 'dval-501').trigger('onChange', 25 as never);
await r.waitFor(() => assert.ok(r.findAll(Tag).some((t) => t.text === 'Needs approval')));
assert.ok(texts(r).some((t) => t.includes('25% discount is at or above the 20% approval threshold')));
assert.ok(r.findAll(Alert).some((a) => String(a.props.title).startsWith('Still needed before sending')), 'the discount needs a reason');
field(r, 'of_discount_reason').trigger('onChange', 'Three-year multi-site commitment' as never);
await r.waitFor(() => assert.ok(button(r, 'Save changes')));
button(r, 'Save changes')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastSave().of_discount_reason, 'Three-year multi-site commitment'));
assert.deepEqual(lastCall().lines.update, [{ id: '501', productId: '2281317872', properties: { quantity: '3', hs_discount_percentage: '25', discount: '' } }]);
assert.equal(lastSave().of_discount_amount, String(99900 * 0.25));
assert.equal(lastSave().amount, String(99900 * 0.75 + 22500), 'the Amount drops with the discount');
console.log('a 25% line discount is flagged for approval, needs a reason, and saves to the line item');

// Adding a product defaults its quantity from the sites; removing a line removes it on save.
r = await renderWith(complete, [LINE('502', '2282093038', 30)]);
assert.ok(texts(r).join(' ').includes('A platform licence product'));
select(r, 'add-product').trigger('onChange', '2281317872' as never);
await r.waitFor(() => assert.equal(num(r, 'qty-new-1')?.props.value, 3));
assert.ok(r.findAll(Tag).some((t) => t.text === 'New'));
button(r, 'Save changes')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastCall().lines.create.length, 1));
assert.deepEqual(lastCall().lines.create[0], { productId: '2281317872', quantity: 3, discountMode: 'percent', discountValue: 0, months: 24, start: '2027-01-01' });
await r.waitFor(() => assert.equal(r.findAll(Tag).some((t) => t.text === 'New'), false));
console.log('adding the licence defaults to 3 (the sites) and creates the line item on save');

// Hidden discounting: a unit price below list gets a one-click fix that keeps the net price.
r = await renderWith(complete, [LINE('501', '2281317872', 3, { price: '30000' }), LINE('502', '2282093038', 30)]);
assert.ok(r.findAll(Alert).some((a) => a.props.title === 'Check these'));
r.findAll(Link).find((l) => l.text.startsWith('Reset to list (£33,300.00)'))!.trigger('onClick');
await r.waitFor(() => assert.equal(num(r, 'dval-501').props.value, 3300));
button(r, 'Save changes')!.trigger('onClick');
await r.waitFor(() => assert.ok(lastCall().lines.update.some((u: any) => u.resetPrice)));
assert.deepEqual(lastCall().lines.update[0], { id: '501', productId: '2281317872', properties: { quantity: '3', hs_discount_percentage: '', discount: '3300' }, resetPrice: true });
console.log('a hidden discount is reset to list with the difference shown as a discount');

// Quantity vs sites: a mismatch warns and Match the sites fixes it.
r = await renderWith(complete, [LINE('501', '2281317872', 2), LINE('502', '2282093038', 30)]);
assert.ok(texts(r).includes('Protex AI Platform Site License - Safety: 2 licences for 3 sites'));
r.findAll(Link).find((l) => l.text === 'Match the sites (3)')!.trigger('onClick');
await r.waitFor(() => assert.equal(num(r, 'qty-501').props.value, 3));
console.log('licence quantity mismatch warns, and Match the sites fixes it');

// Line items that don't run for the contract term are synced on save.
r = await renderWith({ ...complete, term_year_length: '36 months' }, COMPLETE_LINES);
assert.ok(texts(r).some((t) => t.startsWith("2 line items don't bill for the 36-month term")));
assert.ok(texts(r).some((t) => t.startsWith("The deal's Amount is empty. Saving sets it to £122,400.00")));
button(r, 'Update the deal now')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastCall().lines.update.length, 2));
assert.deepEqual(lastCall().lines.update[0].properties, { hs_recurring_billing_period: 'P36M' });
console.log('recurring line items are brought onto the contract term');

// Sites: add one, paste a list of 25, and the 20+ note shows.
r = await renderWith({ ...complete, of_sites: '' }, COMPLETE_LINES);
button(r, 'Paste a list of sites')!.trigger('onClick');
await r.waitFor(() => assert.ok(field(r, 'site-paste')));
const pasted = Array.from({ length: 25 }, (_, i) => `Depot ${i + 1}, 4`).join('\n');
field(r, 'site-paste').trigger('onChange', pasted as never);
await r.waitFor(() => assert.ok(button(r, 'Add 25 sites')));
button(r, 'Add 25 sites')!.trigger('onClick');
await r.waitFor(() => assert.ok(field(r, 'site-24-name')));
assert.ok(field(r, 'site-0-address'), 'each site has a delivery address');
assert.ok(texts(r).some((t) => t.includes('Every site is on the order form in the site schedule')));
assert.ok(texts(r).some((t) => t.startsWith('25 sites: only Sites 1–20')));
button(r, 'Add a site')!.trigger('onClick');
await r.waitFor(() => assert.ok(field(r, 'site-25-name')));
field(r, 'site-25-name').trigger('onChange', 'Leeds overflow' as never);
button(r, 'Save changes')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastSave().number_of_sites_to_start, '26'));
assert.equal(JSON.parse(lastSave().of_sites).length, 26);
assert.equal(lastSave().of_site_schedule.split('\n').length, 26);
assert.equal(lastSave().of_site_20_name, 'Depot 20');
console.log('25 pasted sites plus one added: all 26 saved and in the schedule, 1–20 in the numbered fields');

// Changing the order form after the quote exists: flagged, and a draft can be replaced.
const DRAFT_Q = { id: '950', title: 'Northbridge | Order form', state: 'draft', expires: '2026-12-17T23:59:59.000Z', link: '' };
r = await renderWith({ ...complete, of_status: 'ready_to_send', of_quote_id: '950', of_ready_at: '2026-11-17T10:00:00Z', of_ready_by: 'rep@protex.ai' }, COMPLETE_LINES, [DRAFT_Q]);
assert.ok(texts(r).includes('Order form created 17 Nov 2026 by rep@protex.ai'));
field(r, 'of_legal_notes').trigger('onChange', 'Client wants 60-day payment terms' as never);
await r.waitFor(() => assert.ok(button(r, 'Save changes')));
button(r, 'Save changes')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastSave().of_legal_notes, 'Client wants 60-day payment terms'));
assert.equal(lastSave().of_changed_after_quote, 'true');
await r.waitFor(() => assert.ok(r.findAll(Alert).some((a) => a.props.title === 'The order form changed after this quote was created')));
assert.ok(texts(r).some((t) => t.startsWith('To change the order form: edit the fields here, save, then replace the draft.')));
button(r, 'Replace the draft quote')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastCreate()?.replaceQuoteId, '950'));
console.log('a change after the quote is flagged, and the draft quote can be replaced');

// A sent quote gets a new version (the card asks the server to expire the old one); a signed one can't be replaced.
r = await renderWith({ ...complete, of_status: 'sent', of_quote_id: '950', of_changed_after_quote: 'true' }, COMPLETE_LINES, [{ ...DRAFT_Q, state: 'sent', link: 'https://quotes.example/950' }]);
assert.ok(r.findAll(Alert).some((a) => a.props.title === 'The order form changed after this quote was sent'));
assert.equal(button(r, 'Replace the draft quote'), undefined);
assert.ok(r.findAll(Link).some((l) => l.text === "The client's view"));
button(r, 'Create a new version')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastCreate()?.replaceQuoteId, '950'));
r = await renderWith({ ...complete, of_status: 'signed', of_quote_id: '950' }, COMPLETE_LINES, [{ ...DRAFT_Q, state: 'signed' }]);
assert.equal(button(r, 'Create a new version'), undefined);
assert.ok(texts(r).some((t) => t.startsWith("Signed order forms can't be replaced.")));
r = await renderWith({ ...complete }, COMPLETE_LINES, [{ id: '777', title: 'Manual quote', state: 'draft', expires: '', link: '' }]);
assert.ok(texts(r).some((t) => t.startsWith("This deal already has a quote that wasn't made from the order form.")));
button(r, 'Replace it with the order form')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastCreate()?.replaceQuoteId, '777'), 'a quote made elsewhere can be swapped for the order form');
r = await renderWith({ ...complete }, COMPLETE_LINES, [{ id: '778', title: 'Manual quote', state: 'sent', expires: '', link: '' }]);
assert.ok(button(r, 'Create the order form instead'));

// The old "Ready for Juro" (or any status without a live quote) can be set back to Draft.
r = await renderWith({ ...complete, of_status: 'ready_for_juro' }, COMPLETE_LINES);
assert.ok(r.findAll(StatusTag).some((t) => t.text === 'Ready to send'));
r.findAll(Link).find((l) => l.text === 'Set back to Draft')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastSave().of_status, 'draft'));
r = await renderWith({ ...complete, of_status: 'ready_to_send', of_quote_id: '950' }, COMPLETE_LINES, [DRAFT_Q]);
assert.equal(r.findAll(Link).find((l) => l.text === 'Set back to Draft'), undefined, 'not while a live order form quote drives the status');
console.log("a sent quote gets a new version, a signed one can't be replaced, a quote made elsewhere can be swapped, and status can be set back to Draft");

// MSA negotiating in Juro blocks the order form until it's signed.
r = await renderWith({ ...complete, of_msa_status: 'negotiating_in_juro' }, COMPLETE_LINES);
assert.ok(texts(r).join(' ').includes('The MSA signed in Juro'));
assert.ok(button(r, 'Create order form · 1 to fill')?.props.disabled);
console.log('an MSA still in Juro blocks the order form');

// Tabs only change when the rep clicks; filling the last field never moves them on.
r = await renderWith({ ...complete, of_counterparty_signer_title: '', of_payment_terms: '' }, COMPLETE_LINES);
assert.equal(tabTitle(r, 'deal'), 'Order & client (1 missing)');
assert.ok(texts(r).includes('Still needed here: Payment terms'));
select(r, 'of_payment_terms').trigger('onChange', 'net_30' as never);
await r.waitFor(() => assert.equal(tabTitle(r, 'deal'), 'Order & client ✓'));
assert.equal(selectedTab(r), 'deal', 'filling Payment terms keeps you on the tab, so Auto-renews is still there');
assert.ok(select(r, 'of_auto_renew'));
const link = r.findAll(Link).find((l) => l.text === 'Legal, MSA and signatures');
assert.ok(link, 'the missing item names its section as a link');
link!.trigger('onClick');
await r.waitFor(() => assert.equal(selectedTab(r), 'legal'));
r.find(Tabs).trigger('onSelectedChange', 'scope' as never);
await r.waitFor(() => assert.equal(selectedTab(r), 'scope'));
console.log('three tabs; they only change when clicked, and say how many details are missing');

// Non-standard terms need approval before the order form can be created.
r = await renderWith({ ...complete, of_payment_terms: 'net_60', of_special_terms: JSON.stringify([{ id: 'reference' }]) }, COMPLETE_LINES);
assert.ok(texts(r).includes('Approval'));
assert.ok(texts(r).includes('• Payment terms: Net 60'));
assert.ok(texts(r).join(' ').includes('Approval from Finance: request it in the Approval box'));
assert.ok(button(r, 'Create order form · 1 to fill')?.props.disabled, 'blocked until approved');
select(r, 'approver-finance').trigger('onChange', '1398950922464' as never);
await r.waitFor(() => assert.equal(button(r, 'Request approval')?.props.disabled, false));
button(r, 'Request approval')!.trigger('onClick');
await r.waitFor(() => assert.ok([...calls].reverse().find((c) => c.parameters.action === 'request_approval')));
const req = [...calls].reverse().find((c) => c.parameters.action === 'request_approval')!.parameters;
assert.deepEqual(req.request.reasons.map((x: any) => x.label), ['Payment terms: Net 60']);
assert.equal(req.request.approvers.finance.email, 'jesse@protex.ai');
await r.waitFor(() => assert.ok(texts(r).includes('Waiting for Jesse Maggs.')));
assert.equal(button(r, 'Approve'), undefined, 'only the approver sees Approve');

// The approver opens the card and approves.
currentApproval = JSON.stringify({
  fingerprint: req.request.fingerprint,
  reasons: req.request.reasons,
  roles: { finance: { approver: { id: '7', email: 'rep@protex.ai', name: 'Rob Rep' }, status: 'pending' } },
});
r = await renderWith({ ...complete, of_payment_terms: 'net_60', of_approval: currentApproval }, COMPLETE_LINES);
field(r, 'approval-note-finance').trigger('onChange', 'Fine for a 4-site launch' as never);
button(r, 'Approve')!.trigger('onClick');
await r.waitFor(() => assert.ok(texts(r).some((t) => t.startsWith('Approved by Rob Rep'))));
await r.waitFor(() => assert.equal(button(r, 'Create order form')?.props.disabled, false), 'approved: the order form can be created');
console.log('non-standard terms need approval; approvers get asked, approve on the card, and the order form unlocks');

// Special terms: tick, fill the blank, and they print on the quote.
r = await renderWith({ ...complete }, COMPLETE_LINES);
r.findAll(ToggleGroup).find((t) => t.props.name === 'special-terms')!.trigger('onChange', ['data_residency'] as never);
await r.waitFor(() => assert.ok(select(r, 'term-data_residency')));
select(r, 'term-data_residency').trigger('onChange', 'European Union' as never);
await r.waitFor(() => assert.ok(texts(r).includes('• Special term: Data residency (European Union)')));
console.log('special terms are ticked, filled in, and trigger the right approval');

// Settings: only rules and legal editors see the panel; leadership saves rules, legal edits clauses.
const lastSettings = () => [...calls].reverse().find((c) => c.parameters.action === 'save_settings')?.parameters;
const settingsPanel = (r: R) => r.findAll(Accordion).find((a) => String(a.props.title).startsWith('Order form settings'));
r = await renderWith({ ...complete }, COMPLETE_LINES);
assert.equal(settingsPanel(r), undefined, 'reps do not see the settings');
asUser = { email: 'scott.cahill@protex.ai', firstName: 'Scott', lastName: 'Cahill' };
r = await renderWith({ ...complete }, COMPLETE_LINES);
settingsPanel(r)!.trigger('onClick');
await r.waitFor(() => assert.ok(num(r, 'rule-discount')));
assert.equal(field(r, 'clause-body'), undefined, 'Scott is not a legal editor');
num(r, 'rule-discount').trigger('onChange', 15 as never);
r.findAll(ToggleGroup).find((t) => t.props.name === 'rule-payment')!.trigger('onChange', ['net_30', 'net_60'] as never);
await r.waitFor(() => assert.equal(button(r, 'Save rules')?.props.disabled, false));
button(r, 'Save rules')!.trigger('onClick');
await r.waitFor(() => assert.ok(lastSettings()));
assert.deepEqual(lastSettings()!.rules, { discount_approval_pct: '15', payment_terms_allowed: 'net_30, net_60' });
assert.equal(lastSettings()!.user.email, 'scott.cahill@protex.ai');
asUser = { email: 'jemima.davison@protex.ai', firstName: 'Jemima', lastName: 'Davison' };
r = await renderWith({ ...complete }, COMPLETE_LINES);
settingsPanel(r)!.trigger('onClick');
await r.waitFor(() => assert.ok(select(r, 'clause-pick')));
assert.ok(num(r, 'rule-discount'), 'Jemima is a rules editor and a legal editor by default, so she sees both');
select(r, 'clause-pick').trigger('onChange', 'tc_3d' as never);
await r.waitFor(() => assert.equal(field(r, 'clause-body')?.props.value, '{{payment}}'));
field(r, 'clause-body').trigger('onChange', '{{payment}} Late payments accrue interest.' as never);
button(r, 'Save and publish')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastSettings()?.clauses?.[0]?.body, '{{payment}} Late payments accrue interest.'));
asUser = { email: 'rep@protex.ai', firstName: 'Rob', lastName: 'Rep' };
console.log('settings: reps never see them; leadership saves rules; legal edits and publishes clauses');

// New business: the free standard rows are added once, never for renewals, never again once recorded.
extraProducts = INCLUSIONS;
r = await renderWith(complete, COMPLETE_LINES);
await r.waitFor(() => assert.equal(r.findAll(Tag).filter((t) => t.text === 'Standard inclusion').length, 3));
assert.equal(num(r, 'qty-new-2').props.value, 3, 'Deployment Services: one per site');
assert.equal(num(r, 'qty-new-1').props.value, 1);
button(r, 'Save changes')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastCall().lines.create.length, 3));
assert.deepEqual(lastCall().lines.create.map((c: any) => [c.productId, c.quantity]), [['414730536132', 1], ['427764333792', 3], ['455664370894', 1]]);
assert.equal(lastSave().of_standard_inclusions_added, 'true');
r = await renderWith({ ...complete, of_standard_inclusions_added: 'true' }, COMPLETE_LINES);
assert.equal(r.findAll(Tag).filter((t) => t.text === 'New').length, 0, 'not re-added once recorded (a removed row stays removed)');
r = await renderWith({ ...complete, pipeline: '497851373', of_order_type: 'renewal', pro_rata_renewal: 'No' }, COMPLETE_LINES);
assert.equal(r.findAll(Tag).filter((t) => t.text === 'New').length, 0, 'not for renewals');
extraProducts = [];
console.log('new business gets Intelligence (Free), Deployment Services (one per site) and Standard Support once');

// Renewals ask about pro-rata.
r = await renderWith({ ...complete, pipeline: '497851373', of_order_type: '', renewable_date: '2027-03-31' }, COMPLETE_LINES);
assert.ok(r.findAll(Tag).some((t) => t.text === 'Renewal'));
assert.ok(select(r, 'pro_rata_renewal'), 'renewal fields show');
assert.ok(texts(r).includes('Current renewal date: 31 Mar 2027'));
assert.equal(select(r, 'site-0-new').props.value, 'existing', 'renewal sites start as existing');
assert.equal(field(r, 'site-0-address'), undefined, 'no address box for an existing site');
select(r, 'site-0-new').trigger('onChange', 'new' as never);
await r.waitFor(() => assert.ok(field(r, 'site-0-address')));
console.log('renewal deals show the renewal fields');
console.log('ok');
