// Renders the Order form card with HubSpot's test renderer and walks it the way a rep would.
// Run with `npm run test:render`.
import React from 'react';
import assert from 'node:assert/strict';
import { createRenderer } from '@hubspot/ui-extensions/testing';
import { Accordion, Alert, Button, Heading, Input, LoadingButton, Select, StatisticsItem, Tag, Text, TextArea, ToggleGroup } from '@hubspot/ui-extensions';
import { OrderForm } from '../OrderForm.tsx';

const calls: { name: string; parameters: Record<string, any> }[] = [];
const g = globalThis as Record<string, unknown>;
g.self ??= globalThis; // the extension worker's global, which hubspot.serverless() reads
g.serverless = async (name: string, opts: { parameters: Record<string, any> }) => {
  calls.push({ name, parameters: opts.parameters });
  if (opts.parameters.action === 'signatories') {
    return { statusCode: 200, body: { ok: true, users: [{ id: '1398950922464', name: 'Jesse Maggs', email: 'jesse@protex.ai', title: '' }] } };
  }
  return { statusCode: 200, body: { ok: true, properties: opts.parameters.properties } };
};

const page = (results: unknown[]) => ({
  results,
  error: null,
  isLoading: false,
  isRefetching: false,
  refetch: async () => {},
  pagination: { hasNextPage: false, hasPreviousPage: false, currentPage: 1, pageSize: 50, nextPage: () => {}, previousPage: () => {}, reset: () => {} },
});
const CONTACTS = [
  { toObjectId: 501, associationTypes: [], properties: { firstname: 'Alex', lastname: 'Kim', email: 'alex@northbridge.example', jobtitle: 'COO' } },
  { toObjectId: 502, associationTypes: [], properties: { firstname: 'Pat', lastname: 'Fox', email: 'ap@northbridge.example', jobtitle: 'Finance Manager' } },
];
const COMPANY = [{ toObjectId: 9, associationTypes: [], properties: { name: 'Northbridge Logistics Ltd', address: '1 Dock Road', city: 'Leeds', zip: 'LS1 1AA', country: 'United Kingdom' } }];

async function renderWith(props: Record<string, string>) {
  const r = createRenderer('crm.record.tab');
  r.mocks.actions.fetchCrmObjectProperties.willCall(async () => props);
  r.mocks.actions.onCrmPropertiesUpdate.willCall(() => {});
  r.mocks.actions.refreshObjectProperties.willCall(() => {});
  r.mocks.actions.addAlert.willCall(() => {});
  r.mocks.useAssociations.willCall(((config: { toObjectType: string }) => page(config.toObjectType === '0-1' ? CONTACTS : COMPANY)) as never);
  r.render(<OrderForm actions={r.mocks.actions as never} dealId="77" user="rep@protex.ai" />);
  await r.waitFor(() => assert.ok(r.maybeFind(Heading)));
  return r;
}
type R = Awaited<ReturnType<typeof renderWith>>;
const texts = (r: R) => r.findAll(Text).map((t) => t.text);
const field = (r: R, name: string) => [...r.findAll(Input), ...r.findAll(TextArea)].find((x) => x.props.name === name)!;
const select = (r: R, name: string) => r.findAll(Select).find((x) => x.props.name === name)!;
const button = (r: R, text: string) => [...r.findAll(Button), ...r.findAll(LoadingButton)].find((b) => b.text === text);
const lastSave = () => [...calls].reverse().find((c) => c.parameters.action === 'save')!.parameters.properties;

// A new deal: nothing filled in.
let r = await renderWith({ pipeline: 'default', dealname: 'Northbridge' });
assert.equal(r.find(Heading).text, 'Order form');
assert.ok(r.findAll(Tag).some((t) => t.text === 'New business'), 'order type comes from the pipeline');
assert.equal(r.findAll(Accordion).length, 5);
assert.ok(r.findAll(Alert).some((a) => String(a.props.title).startsWith('Still needed before Juro')));
assert.equal(button(r, 'Mark ready for Juro'), undefined, 'cannot mark ready while things are missing');
assert.ok(calls.some((c) => c.parameters.action === 'signatories'), 'loads the Protex signatories');
console.log('new deal: 5 sections, still-needed alert, no Mark ready');

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
  of_safety_units: '3',
  of_safety_unit_fee: '12000',
  of_cameras_units: '30',
  of_cameras_unit_fee: '500',
  number_of_sites_to_start: '2',
  of_rollout: 'all_sites_together',
  of_site_1_name: 'Leeds DC',
  of_site_1_cameras: '18',
  of_site_2_name: 'Wakefield',
  of_site_2_cameras: '12',
  of_existing_msa: 'no',
  of_counterparty_signer_name: 'Alex Kim',
  of_counterparty_signer_email: 'alex@northbridge.example',
  of_counterparty_signer_title: 'COO',
  of_protex_signer_user_id: '1398950922464',
  of_protex_signer_name: 'Jesse Maggs',
  of_protex_signer_email: 'jesse@protex.ai',
  of_protex_signer_title: 'CEO',
};
r = await renderWith(complete);
assert.ok(r.findAll(Alert).some((a) => a.props.title === 'Everything Juro needs is here'));
assert.deepEqual(
  r.findAll(StatisticsItem).map((s) => [s.props.label, s.props.number]),
  [
    ['Annual subscription', '£51,000.00'],
    ['Total contract value', '£102,000.00'],
    ['Term', '24 months'],
  ],
);
assert.ok(r.findAll(Accordion).every((a) => String(a.props.title).endsWith('complete')));
const ready = button(r, 'Mark ready for Juro');
assert.ok(ready, 'Mark ready shows when nothing is missing');
ready!.trigger('onClick');
await r.waitFor(() => assert.equal(lastSave().of_status, 'ready_for_juro'));
saved = lastSave();
assert.equal(saved.of_ready_by, 'rep@protex.ai');
assert.equal(saved.of_total_contract_value, '102000');
assert.equal(saved.of_site_schedule, '1. Leeds DC — 18 camera integrations — go-live 1 Jan 2027\n2. Wakefield — 12 camera integrations — go-live 1 Jan 2027');
console.log('complete deal: £51,000 a year, £102,000 TCV, and Mark ready for Juro saves the status');

// Editing after it's marked ready puts it back to Draft.
r = await renderWith({ ...complete, of_status: 'ready_for_juro', of_ready_at: '2026-11-17T10:00:00Z', of_ready_by: 'rep@protex.ai' });
assert.equal(button(r, 'Mark ready for Juro'), undefined);
field(r, 'of_legal_notes').trigger('onChange', 'Client wants 60-day payment terms' as never);
await r.waitFor(() => assert.ok(button(r, 'Save changes')));
button(r, 'Save changes')!.trigger('onClick');
await r.waitFor(() => assert.equal(lastSave().of_legal_notes, 'Client wants 60-day payment terms'));
assert.equal(lastSave().of_status, 'draft');
console.log('a change after Mark ready sends it back to Draft');

// Optional price lines appear when ticked; a discount needs a reason.
r = await renderWith({ ...complete });
r.find(ToggleGroup).trigger('onChange', ['of_ops_included'] as never);
await r.waitFor(() => assert.ok(texts(r).includes('Operations License, per year')));
assert.ok(r.findAll(Alert).some((a) => String(a.props.title).startsWith('Still needed before Juro')), 'ops units and fee are now required');
console.log('ticking Operations License adds its price line and makes it required');

// Renewals ask about pro-rata.
r = await renderWith({ ...complete, pipeline: '497851373', of_order_type: '' , renewable_date: '2027-03-31' });
assert.ok(r.findAll(Tag).some((t) => t.text === 'Renewal'));
assert.ok(select(r, 'pro_rata_renewal'), 'renewal fields show');
assert.ok(texts(r).includes('Current renewal date: 31 Mar 2027'));
console.log('renewal deals show the renewal fields');
console.log('ok');
