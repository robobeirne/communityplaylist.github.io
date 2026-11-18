import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvalReasons, approvalState, fingerprint } from './approvals.ts';
import { activeTerms, termMissingValue, termsFor } from './specialterms.ts';
import { orderTerms } from './terms.ts';
import { readiness } from './calc.ts';
import { toLine, type Product } from './lines.ts';

const P: Product[] = [{ id: '1', name: 'Licence', sku: '1', description: '', prices: { USD: 45000 }, frequency: 'annually' }];
const line = (pct: string) => toLine({ id: 'a', properties: { hs_product_id: '1', quantity: '4', price: '45000', hs_discount_percentage: pct, recurringbillingfrequency: 'annually', hs_line_item_currency_code: 'USD' } }, undefined, P, 'USD');
const base = { of_order_type: 'new_business', of_payment_terms: 'net_30', of_billing_frequency: 'annually_in_advance' };

test('what needs approval, and from whom', () => {
  assert.deepEqual(approvalReasons(base, [line('10')]), [], 'standard terms and a small discount need nothing');
  const r = approvalReasons(
    { ...base, of_payment_terms: 'net_60', of_billing_frequency: 'quarterly_in_advance', of_auto_renew: 'false', of_special_terms: JSON.stringify([{ id: 'price_cap', value: '5' }, { id: 'reference' }]) },
    [line('25')],
  );
  assert.deepEqual(
    r.map((x) => [x.role, x.label]),
    [
      ['sales', 'Licence: 25% discount'],
      ['finance', 'Payment terms: Net 60'],
      ['finance', 'Billing quarterly in advance'],
      ['legal', 'Auto-renewal switched off'],
      ['finance', 'Special term: Renewal price cap (5%)'],
    ],
    'reference rights need no approval',
  );
});

test('approval is current only for exactly what was approved', () => {
  const v = { ...base, of_payment_terms: 'net_60' };
  assert.equal(approvalState(base, []).status, 'not_needed');
  assert.equal(approvalState(v, []).status, 'needed');
  const fp = fingerprint(approvalReasons(v, []));
  const approver = { id: '9', email: 'cfo@protex.ai', name: 'CFO' };
  const pending = { ...v, of_approval: JSON.stringify({ fingerprint: fp, reasons: [], roles: { finance: { approver, status: 'pending' } } }) };
  assert.equal(approvalState(pending, []).status, 'pending');
  const approved = { ...v, of_approval: JSON.stringify({ fingerprint: fp, reasons: [], roles: { finance: { approver, status: 'approved' } } }) };
  assert.equal(approvalState(approved, []).status, 'approved');
  assert.equal(approvalState({ ...approved, of_payment_terms: 'net_90' }, []).status, 'needed', 'Net 60 approved does not cover Net 90');
  const rejected = { ...v, of_approval: JSON.stringify({ fingerprint: fp, reasons: [], roles: { finance: { approver, status: 'rejected' } } }) };
  assert.equal(approvalState(rejected, []).status, 'rejected');
});

test('approval blocks the order form until it is given', () => {
  const v = { ...base, of_payment_terms: 'net_60' };
  assert.ok(readiness(v, []).missing.some((g) => g.section === 'approval' && g.label === 'Approval from Finance: request it in the Approval box'));
  const fp = fingerprint(approvalReasons(v, []));
  const ok = { ...v, of_approval: JSON.stringify({ fingerprint: fp, reasons: [], roles: { finance: { approver: { id: '9', email: 'x', name: 'X' }, status: 'approved' } } }) };
  assert.ok(!readiness(ok, []).missing.some((g) => g.section === 'approval'));
});

test('special terms: available by order type, need their blank, and print after the Terms and Conditions', () => {
  assert.ok(termsFor('new_business').some((t) => t.id === 'pilot_exit'));
  assert.ok(!termsFor('renewal').some((t) => t.id === 'pilot_exit' || t.id === 'billing_from_deployment'), 'deployment-based terms are not for renewals');
  const v = { ...base, of_special_terms: JSON.stringify([{ id: 'price_cap' }, { id: 'data_residency', value: 'European Union' }, { id: 'pilot_exit', value: '90' }, { id: 'unknown' }]) };
  assert.deepEqual(activeTerms(v).map((t) => t.term.id), ['price_cap', 'data_residency', 'pilot_exit']);
  assert.ok(readiness(v, []).missing.some((g) => g.label === 'Special term "Renewal price cap": Maximum increase (%)'));
  assert.equal(termMissingValue(activeTerms(v)[1].term, 'European Union'), false);
  const t = orderTerms(v);
  assert.ok(t.includes('<h3>Special Terms</h3><p>The following special terms form part of this Order Form and prevail'));
  assert.ok(t.includes('<tr><td>S1</td><td><p><strong>Data residency.</strong> Client Data will be hosted in the European Union.</p></td></tr>'));
  assert.ok(t.includes('<tr><td>S2</td><td><p><strong>Pilot exit.</strong> Client may terminate this Order Form by written notice to accounts@protex.ai within 90 days'));
  assert.ok(!t.includes('Renewal price cap'), 'a term without its value is not printed');
  assert.ok(!orderTerms(base).includes('Special Terms'), 'none ticked: no section');
  const renewal = orderTerms({ ...v, of_order_type: 'renewal' });
  assert.ok(!renewal.includes('Pilot exit'), 'terms not available on renewals are left out');
});

test('a second discount tier also needs an Executive, only once leadership sets it', async () => {
  const { setSettings } = await import('./settings.ts');
  assert.deepEqual(approvalReasons(base, [line('35')]).map((x) => x.role), ['sales'], 'off by default');
  setSettings({ rules: { discount_tier2_pct: '30' } });
  assert.deepEqual(
    approvalReasons(base, [line('35')]).map((x) => [x.role, x.label]),
    [
      ['sales', 'Licence: 35% discount'],
      ['exec', 'Licence: 35% discount (over 30%)'],
    ],
  );
  assert.deepEqual(approvalReasons(base, [line('25')]).map((x) => x.role), ['sales'], 'under the second tier');
  setSettings({ rules: {} });
});
