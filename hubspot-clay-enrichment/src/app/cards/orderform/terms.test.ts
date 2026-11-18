// Checks the order form text against Protex's new business order form (the Lennox example).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraApportionment, orderComments, orderTerms, subscriptionTerm } from './terms.ts';
import { TERMS_APPROVED } from './legal.ts';

const LENNOX: Record<string, string> = {
  of_order_type: 'new_business',
  of_quote_date: '2026-11-16',
  of_offer_expiry_date: '2027-01-23',
  of_client_legal_name: 'Lennox International Inc.',
  of_client_legal_address: '2140 Lake Park Blvd., Richardson, TX 75080',
  of_client_contact_name: 'Mitchell Jacobs',
  of_client_contact_email: 'Mitchell.Jacobs@lennox.com',
  term_year_length: '12 months',
  of_billing_frequency: 'annually_in_advance',
  of_payment_terms: 'net_30',
  of_rollout: 'all_sites_together',
  of_sites: JSON.stringify([1, 2, 3, 4].map((n) => ({ name: `Plant ${n}`, address: n === 1 ? '1 Main St, Marshalltown, IA' : '', cameras: 15, goLive: '' }))),
  of_msa_status: 'standard_msa',
  of_legal_notes: 'Internal: watch the liability cap',
};

test('comments to buyer match the order form: client and billing details, term, notes, sites', () => {
  const c = orderComments(LENNOX);
  assert.ok(c.startsWith('<table><thead><tr><th>Client Details</th><th>Billing Details</th></tr></thead><tbody>'));
  assert.ok(c.includes('<tr><td><strong>Legal Entity Name:</strong> Lennox International Inc.</td><td><strong>Billing Email:</strong> TBD</td></tr>'), 'billing email can be TBD');
  assert.ok(c.includes('<tr><td><strong>Legal Entity Address:</strong> 2140 Lake Park Blvd., Richardson, TX 75080</td><td><strong>Billing Address:</strong> As legal entity address</td></tr>'));
  assert.ok(c.includes('<tr><td><strong>Attn:</strong> Mitchell Jacobs</td><td></td></tr><tr><td><strong>Contact Email:</strong> Mitchell.Jacobs@lennox.com</td><td></td></tr>'));
  assert.ok(c.includes("<h3>Subscription Term</h3><p>12 months from each Site's Deployment Date</p>"));
  assert.ok(c.includes('<h3>Notes</h3><ul><li>Each Protex AI Platform Site License includes the lease of one (1) Edge Device.</li>'));
  assert.ok(c.includes('apportioned between the number of ordered Sites: 15 Camera Integrations per Site.</li>'));
  assert.ok(c.includes('Protex AI does not provide cameras.</li></ul>'));
  assert.ok(c.includes('<h3>Site Information</h3><table><thead><tr><th>Site</th><th>Delivery Address</th><th>Camera Integrations</th></tr></thead>'));
  assert.ok(c.includes('<tr><td>Site 1: Plant 1</td><td>1 Main St, Marshalltown, IA</td><td>15</td></tr>'));
  assert.ok(c.includes('<tr><td>Site 4: Plant 4</td><td></td><td>15</td></tr>'));
  assert.ok(!/class=|style=/.test(c), 'no classes or inline styles: the template styles by element');
  assert.ok(!c.includes('liability'), 'notes for legal stay internal');
  const billed = orderComments({ ...LENNOX, client_s_email_for_invoicing_: 'ap@lennox.com', of_client_tax_id: 'US123', purchase_order: 'PO-9' });
  assert.ok(billed.includes('<strong>Billing Email:</strong> ap@lennox.com'));
  assert.ok(billed.includes('<strong>VAT Number:</strong> US123'));
  assert.ok(billed.includes('<strong>Purchase Order:</strong> PO-9'));
  const staged = orderComments({ ...LENNOX, of_rollout: 'staged_rollout', of_sites: JSON.stringify([{ name: 'A', address: '', cameras: 2, goLive: '2027-02-01' }]) });
  assert.ok(staged.includes('<th>Expected Go-live</th>') && staged.includes('<td>1 February 2027</td>'));
  assert.ok(orderComments({ ...LENNOX, of_sites: '[]' }).includes('<tr><td>Site 1: </td><td></td><td></td></tr>'), 'an empty Site 1 row, like the order form');
  assert.ok(orderComments({ ...LENNOX, of_client_legal_name: 'A <b>&</b> B' }).includes('A &lt;b&gt;&amp;&lt;/b&gt; B'), 'escaped');
});

test('terms are the order form Terms and Conditions, with the deal-specific parts filled in', () => {
  const t = orderTerms(LENNOX);
  if (!TERMS_APPROVED) assert.ok(t.startsWith('<p><strong>DRAFT TERMS: NOT YET APPROVED BY LEGAL</strong></p>'));
  else assert.ok(t.startsWith('<h3>Terms and Conditions</h3>') && !t.includes('DRAFT'), 'no draft notice once approved');
  assert.ok(t.includes('separately executed between Client and Protex AI Limited, if such an agreement is in effect; or, if no such executed agreement exists, then the Protex AI Master Services Agreement available at www.protex.ai/legal'));
  assert.ok(t.includes('<h3>Terms and Conditions</h3><table><tbody><tr><td>1</td><td><p><strong>A.</strong> By signing this Order Form'));
  assert.ok(t.includes('<p><strong>B.</strong> Capitalized terms not otherwise defined'));
  assert.ok(t.includes('<tr><td>2</td><td><p><strong>A.</strong> Unless otherwise agreed in writing, the duration of the Subscription Term set out in this Order Form is a fixed-term minimum commitment from each Site'));
  assert.ok(t.includes('<p><strong>C.</strong> Fees are invoiced annually in advance, with the first invoice being issued on or around the Order Form Effective Date.'));
  assert.ok(t.includes('<p><strong>D.</strong> Payment terms Net 30 days from invoice date. Fees to be paid by bank transfer.'));
  assert.ok(t.includes('<p><strong>E.</strong> Devices will be delivered DAP'));
  assert.ok(t.includes('<tr><td>4</td><td><p><strong>A.</strong> <u>Auto-Renewal</u>.'));
  assert.ok(t.includes('<tr><td>5</td><td><p><strong>A.</strong> <u>Purchase Order Details</u>'));
  assert.ok(t.includes('<p><strong>B.</strong> <u>Billing Details</u>'));
  assert.ok(t.includes('<tr><td>6</td><td><p><strong>A.</strong> Acceptance of this Order Form is limited'));
  assert.ok(t.includes('<p><strong>B.</strong> By signing below or issuing a purchase order'));
  assert.ok(t.endsWith('</td></tr></tbody></table>'));
  assert.ok(!/class=|style=/.test(t));
  assert.ok(!t.includes('liability'));

  const variant = orderTerms({ ...LENNOX, of_payment_terms: 'net_60', of_billing_frequency: 'quarterly_in_advance', of_auto_renew: 'false' });
  assert.ok(variant.includes('Payment terms Net 60 days'));
  assert.ok(variant.includes('Fees are invoiced quarterly in advance'));
  assert.ok(!variant.includes('Auto-Renewal'), 'no auto-renewal clause when switched off');
  assert.ok(variant.includes('<tr><td>4</td><td><p><strong>A.</strong> <u>Purchase Order Details</u>'), 'later sections renumber');
  assert.ok(orderTerms({ ...LENNOX, of_payment_terms: 'due_on_receipt' }).includes('Payment is due on receipt of invoice.'));
});

test('subscription term and camera apportionment', () => {
  assert.equal(subscriptionTerm(LENNOX), "12 months from each Site's Deployment Date");
  assert.equal(subscriptionTerm({ ...LENNOX, of_order_type: 'renewal', contract_start_date: '2027-03-01' }), '12 months from 1 March 2027 to 29 February 2028');
  assert.equal(cameraApportionment([{ name: 'A', address: '', cameras: 10, goLive: '' }, { name: 'B', address: '', cameras: 5, goLive: '' }]), 'A: 10; B: 5');
  assert.equal(cameraApportionment([]), '');
});
