import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderComments, orderTerms } from './terms.ts';
import { TERMS_APPROVED } from './legal.ts';

const V: Record<string, string> = {
  of_order_type: 'new_business',
  of_client_legal_name: 'Northbridge Logistics Ltd',
  of_client_legal_address: '1 Dock Road\nLeeds LS1 1AA',
  of_client_company_number: '01234567',
  of_client_contact_name: 'Alex Kim',
  of_client_contact_title: 'COO',
  of_client_contact_email: 'alex@northbridge.example',
  client_s_email_for_invoicing_: 'ap@northbridge.example',
  of_po_required: 'true',
  purchase_order: 'PO-77',
  contract_start_date: '2027-01-01',
  term_year_length: '24 months',
  of_billing_frequency: 'annually_in_advance',
  of_payment_terms: 'net_30',
  of_auto_renew: 'true',
  of_offer_expiry_date: '2026-12-17',
  of_rollout: 'staged_rollout',
  of_sites: JSON.stringify([
    { name: 'Leeds DC', cameras: 12, goLive: '2027-02-01' },
    { name: 'Wakefield <B>', cameras: 10, goLive: '2027-04-01' },
  ]),
  of_msa_status: 'existing_msa',
  of_msa_date: '2025-06-01',
  of_legal_notes: 'Internal: client pushed back on liability cap',
};

test('comments to buyer carry the client, term, billing and every site, escaped', () => {
  const c = orderComments(V);
  assert.ok(c.includes('<p><strong>Client</strong><br>Northbridge Logistics Ltd<br>1 Dock Road<br>Leeds LS1 1AA<br>Company number: 01234567</p>'));
  assert.ok(c.includes('Main contact: Alex Kim, COO, alex@northbridge.example'));
  assert.ok(c.includes('Starts 1 January 2027 · 24 months · ends 31 December 2028'));
  assert.ok(c.includes('Invoiced annually in advance, payable within 30 days of the invoice date<br>PO required before invoicing: PO-77'));
  assert.ok(c.includes('<strong>Sites (2)</strong><br>Staged rollout'));
  assert.ok(c.includes('2. Wakefield &lt;B&gt; — 10 camera integrations — go-live 1 Apr 2027'), 'site names are escaped');
  assert.ok(!c.includes('liability'), 'notes for legal are internal');
});

test('terms: MSA clause, term and renewal, payment, sites, validity', () => {
  const t = orderTerms(V);
  if (!TERMS_APPROVED) assert.ok(t.startsWith('<p><strong>DRAFT TERMS: NOT YET APPROVED BY LEGAL</strong></p>'));
  assert.ok(t.includes('governed by the Master Subscription Agreement between the parties dated 1 June 2025'));
  assert.ok(t.includes('starts on 1 January 2027 and runs for 24 months, ending on 31 December 2028. It renews automatically'));
  assert.ok(t.includes('invoiced annually in advance and payable within 30 days of the invoice date. The Client will provide a purchase order'));
  assert.ok(t.includes('covers the 2 sites listed in this Order Form, each from its go-live date'));
  assert.ok(t.includes('valid until 17 December 2026'));
  assert.ok(!t.includes('liability'));

  const std = orderTerms({ ...V, of_msa_status: 'standard_msa', of_auto_renew: 'false', of_order_type: 'renewal', pro_rata_renewal: 'Yes' });
  assert.ok(std.includes("standard Master Subscription Agreement"));
  assert.ok(std.includes('which the Client accepts by signing this Order Form'));
  assert.ok(std.includes('It does not renew automatically.'));
  assert.ok(std.includes("<strong>2. Renewal.</strong> This Order Form renews the Client's existing subscription, with fees pro-rated"));
  assert.ok(orderTerms({ ...V, of_msa_status: '', of_existing_msa: 'yes' }).includes('dated 1 June 2025'), 'older deals still get the existing MSA clause');
});
