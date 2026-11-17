// Renders the Order form card with HubSpot's test renderer and walks it the way a rep would.
// Run with `npm run test:render`.
import React from 'react';
import assert from 'node:assert/strict';
import { createRenderer } from '@hubspot/ui-extensions/testing';
import { Accordion, Alert, Button, Heading, Input, Link, LoadingButton, NumberInput, Select, StatisticsItem, Tag, Text, TextArea } from '@hubspot/ui-extensions';
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
  if (opts.parameters.action === 'pricing') return { statusCode: 200, body: { ok: true, lines: dealLines, products: PRODUCTS } };
  const ch = opts.parameters.lines ?? {};
  const created = (ch.create ?? []).map((c: any, i: number) => LINE(String(900 + i), c.productId, c.quantity));
  dealLines = [...dealLines.filter((l) => !(ch.remove ?? []).includes(l.id)), ...created];
  return { statusCode: 200, body: { ok: true, properties: opts.parameters.properties, lines: dealLines } };
};

async function renderWith(props: Record<string, string>, lines: ReturnType<typeof LINE>[] = []) {
  dealLines = lines;
  const r = createRenderer('crm.record.tab');
  r.mocks.actions.fetchCrmObjectProperties.willCall(async () => props);
  r.mocks.actions.onCrmPropertiesUpdate.willCall(() => {});
  r.mocks.actions.refreshObjectProperties.willCall(() => {});
  r.mocks.actions.addAlert.willCall(() => {});
  r.render(<OrderForm actions={r.mocks.actions as never} dealId="77" user="rep@protex.ai" />);
  await r.waitFor(() => assert.ok(r.maybeFind(Heading)));
  await r.waitFor(() => assert.ok(!texts(r).join(' ').includes('Line items (loading)')));
  await r.waitFor(() => assert.ok(button(r, 'Fill from the company')));
  return r;
}
type R = Awaited<ReturnType<typeof renderWith>>;
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
assert.equal(r.findAll(Accordion).length, 5);
assert.ok(r.findAll(Alert).some((a) => String(a.props.title).startsWith('Still needed before Juro')));
const gated = [...r.findAll(LoadingButton)].find((b) => b.text.startsWith('Mark ready for Juro'));
assert.ok(gated && gated.props.disabled && / to fill$/.test(gated.text), 'Mark ready shows, disabled, with how much is left');
assert.ok(r.findAll(Accordion).every((a) => a.props.open), 'every section has gaps, so every section starts open');
assert.ok(calls.some((c) => c.parameters.action === 'signatories'), 'loads the Protex signatories');
await r.waitFor(() => assert.ok(select(r, 'pick-Fill from a deal contact')));
assert.deepEqual(
  select(r, 'pick-Fill from a deal contact').props.options.map((o: { label: string }) => o.label),
  ['Alex Kim — COO — alex@northbridge.example', 'Pat Fox — Finance Manager — ap@northbridge.example', 'ops@northbridge.example'],
  'contacts show names, titles and emails, never a bare ID',
);
console.log('new deal: 5 sections open, still-needed alert, Mark ready disabled');

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
assert.equal(saved.of_annual_subscription_fee, '0', 'saves the calculated totals with it');
assert.deepEqual(lastCall().lines, { create: [], update: [], remove: [] }, 'no line item changes');
console.log('fills from the company and a contact, and saves with the calculated fields');

// The signatory dropdown fills name and email.
select(r, 'of_protex_signer_user_id').trigger('onChange', '1398950922464' as never);
await r.waitFor(() => assert.equal(field(r, 'of_protex_signer_email').props.value, 'jesse@protex.ai'));
assert.equal(field(r, 'of_protex_signer_name').props.value, 'Jesse Maggs');
console.log('Protex signatory fills name and email');

// A complete deal: ready for Juro.
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
  of_existing_msa: 'no',
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
assert.ok(r.findAll(Alert).some((a) => a.props.title === 'Everything Juro needs is here'), JSON.stringify(r.findAll(Alert).map((a) => a.props.title)));
assert.deepEqual(
  r.findAll(StatisticsItem).map((s) => [s.props.label, s.props.number]),
  [
    ['Annual subscription', '£122,400.00'],
    ['Total contract value', '£256,050.00'],
    ['Discount', 'None'],
    ['Sites', '3'],
  ],
);
assert.ok(r.findAll(Accordion).every((a) => String(a.props.title).endsWith('complete')));
assert.ok(r.findAll(Accordion).every((a) => !a.props.open), 'complete sections start closed');
const ready = button(r, 'Mark ready for Juro');
assert.ok(ready, 'Mark ready shows when nothing is missing');
ready!.trigger('onClick');
await r.waitFor(() => assert.equal(lastSave().of_status, 'ready_for_juro'));
saved = lastSave();
assert.equal(saved.of_ready_by, 'rep@protex.ai');
assert.equal(saved.of_total_contract_value, '256050');
assert.equal(saved.number_of_sites_to_start, '3');
assert.equal(saved.of_pricing_table.split('\n')[0], 'Protex AI Platform Site License - Safety (1) — 3 × £33,300.00 — £99,900.00 per year');
assert.equal(
  saved.of_site_schedule,
  '1. Leeds DC — 12 camera integrations — go-live 1 Jan 2027\n2. Wakefield — 10 camera integrations — go-live 1 Jan 2027\n3. Doncaster — 8 camera integrations — go-live 1 Jan 2027',
);
console.log('complete deal: £122,400 a year from the line items, £256,050 TCV, Mark ready saves the status');

// A per-line discount needs a reason, flags approval at 20%, and saves to the line item.
r = await renderWith(complete, COMPLETE_LINES);
num(r, 'dval-501').trigger('onChange', 25 as never);
await r.waitFor(() => assert.ok(r.findAll(Tag).some((t) => t.text === 'Needs approval')));
assert.ok(texts(r).some((t) => t.includes('25% discount is at or above the 20% approval threshold')));
assert.ok(r.findAll(Alert).some((a) => String(a.props.title).startsWith('Still needed before Juro')), 'the discount needs a reason');
field(r, 'of_discount_reason').trigger('onChange', 'Three-year multi-site commitment' as never);
await r.waitFor(() => assert.ok(button(r, 'Save changes')));
button(r, 'Save changes')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastSave().of_discount_reason, 'Three-year multi-site commitment'));
assert.deepEqual(lastCall().lines.update, [{ id: '501', productId: '2281317872', properties: { quantity: '3', hs_discount_percentage: '25', discount: '' } }]);
assert.equal(lastSave().of_discount_amount, String(99900 * 0.25));
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
button(r, 'Update them now')!.trigger('onClick');
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
assert.ok(texts(r).some((t) => t.includes('Every site goes to Juro in the site schedule')));
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

// Editing after it's marked ready puts it back to Draft.
r = await renderWith({ ...complete, of_status: 'ready_for_juro', of_ready_at: '2026-11-17T10:00:00Z', of_ready_by: 'rep@protex.ai' }, COMPLETE_LINES);
assert.equal(button(r, 'Mark ready for Juro'), undefined);
field(r, 'of_legal_notes').trigger('onChange', 'Client wants 60-day payment terms' as never);
await r.waitFor(() => assert.ok(button(r, 'Save changes')));
button(r, 'Save changes')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastSave().of_legal_notes, 'Client wants 60-day payment terms'));
assert.equal(lastSave().of_status, 'draft');
console.log('a change after Mark ready sends it back to Draft');

// The still-needed list links to its section: clicking opens it.
r = await renderWith({ ...complete, of_counterparty_signer_title: '' }, COMPLETE_LINES);
const legal = () => r.findAll(Accordion).find((a) => String(a.props.title).startsWith('5.'))!;
assert.equal(legal().props.open, true, 'the section with a gap starts open');
legal().trigger('onClick');
await r.waitFor(() => assert.equal(legal().props.open, false));
const link = r.findAll(Link).find((l) => l.text === 'Legal, MSA and signatures');
assert.ok(link, 'the missing item names its section as a link');
link!.trigger('onClick');
await r.waitFor(() => assert.equal(legal().props.open, true));
console.log('the still-needed list opens the section it names');

// Renewals ask about pro-rata.
r = await renderWith({ ...complete, pipeline: '497851373', of_order_type: '', renewable_date: '2027-03-31' }, COMPLETE_LINES);
assert.ok(r.findAll(Tag).some((t) => t.text === 'Renewal'));
assert.ok(select(r, 'pro_rata_renewal'), 'renewal fields show');
assert.ok(texts(r).includes('Current renewal date: 31 Mar 2027'));
console.log('renewal deals show the renewal fields');
console.log('ok');
