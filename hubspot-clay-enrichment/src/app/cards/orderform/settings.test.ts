import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_LIBRARY, DEFAULT_RULES, formatClause, isLegalEditor, isRulesEditor, setSettings } from './settings.ts';
import { approvalReasons } from './approvals.ts';
import { termsFor } from './specialterms.ts';
import { orderTerms } from './terms.ts';
import { lineIssues, toLine, type Product } from './lines.ts';

afterEach(() => setSettings(null));
const base = { of_order_type: 'new_business', of_payment_terms: 'net_60', of_billing_frequency: 'quarterly_in_advance', of_auto_renew: 'false' };
const P: Product[] = [{ id: '1', name: 'Licence', sku: '', description: '', prices: { USD: 100 }, frequency: 'annually' }];
const disc = (pct: string) => toLine({ id: 'a', properties: { hs_product_id: '1', quantity: '1', price: '100', hs_discount_percentage: pct, recurringbillingfrequency: 'annually', hs_line_item_currency_code: 'USD' } }, undefined, P, 'USD');

test('leadership rules change what needs approval', () => {
  assert.deepEqual(approvalReasons(base, [disc('15')]).map((r) => r.key), ['payment:net_60', 'billing:quarterly_in_advance', 'auto_renew:off'], 'defaults: 15% is under the 20% bar');
  setSettings({ rules: { payment_terms_allowed: 'net_30, net_45, net_60', billing_allowed: 'annually_in_advance, quarterly_in_advance', auto_renew_off_role: 'none', discount_approval_pct: '15' } });
  assert.deepEqual(approvalReasons(base, [disc('15')]).map((r) => r.key), ['discount:1:15'], 'Net 60 and quarterly now allowed; 15% now needs approval');
  assert.ok(lineIssues([disc('15')], 'USD', 0, 0).some((i) => i.label.includes('at or above the 15% approval threshold')));
  setSettings({ rules: { auto_renew_off_role: 'finance' } });
  assert.equal(approvalReasons({ of_auto_renew: 'false' }, []).find((r) => r.key === 'auto_renew:off')?.role, 'finance');
});

test('editors come from the rules', () => {
  assert.ok(isRulesEditor('Scott.Cahill@protex.ai') && isRulesEditor('rob.obeirne@protex.ai'));
  assert.ok(isLegalEditor('jemima.davison@protex.ai') && isLegalEditor('aoife.harte@protex.ai'));
  assert.ok(!isLegalEditor('scott.cahill@protex.ai') && !isRulesEditor('someone@protex.ai'));
  setSettings({ rules: { legal_editors: 'new.counsel@protex.ai' } });
  assert.ok(isLegalEditor('new.counsel@protex.ai') && !isLegalEditor('jemima.davison@protex.ai'), 'swapping Jemima out is a rules change');
});

test('legal edits to the Terms library change the quote wording', () => {
  setSettings({
    library: [
      { id: 'tc_3d', kind: 'standard', section: 3, position: 4, body: '{{payment}} Late payments accrue **interest** at 1% a month.' },
      { id: 'tc_6a', kind: 'standard', section: 6, position: 1, body: 'x', enabled: false },
      { id: 'reference', kind: 'special', body: 'r', enabled: false },
      { id: 'custom_x', kind: 'special', title: 'Dedicated CSM', summary: 'Named customer success manager.', role: 'sales', body: 'Protex AI will assign a named Customer Success Manager to Client.' },
    ],
  });
  const t = orderTerms({ ...base, of_payment_terms: 'net_30', of_special_terms: JSON.stringify([{ id: 'custom_x' }]) });
  assert.ok(t.includes('<p><strong>D.</strong> Payment terms Net 30 days from invoice date. Fees to be paid by bank transfer. Late payments accrue <strong>interest</strong> at 1% a month.</p>'));
  assert.ok(!t.includes('Acceptance of this Order Form is limited'), 'a clause switched off drops out');
  assert.ok(t.includes('<tr><td>5</td><td><p><strong>A.</strong> This Order Form may be executed'), 'later sections renumber (auto-renewal is off here too)');
  assert.ok(t.includes('<strong>Dedicated CSM.</strong> Protex AI will assign a named Customer Success Manager to Client.'), 'a new special term legal added');
  assert.ok(!termsFor('new_business').some((x) => x.id === 'reference'), 'switched-off special terms are not offered');
  assert.equal(approvalReasons({ of_special_terms: JSON.stringify([{ id: 'custom_x' }]) }, [])[0].role, 'sales');
});

test('wording markers and escaping', () => {
  assert.equal(formatClause('**A** & __B__ <i>'), '<strong>A</strong> &amp; <u>B</u> &lt;i&gt;');
});

test('the HubDB seed matches the defaults', () => {
  const seed = JSON.parse(readFileSync(new URL('../../../../scripts/hubdb-seed.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.fromEntries(seed.rules.map((r: { key: string; value: string }) => [r.key, r.value])), DEFAULT_RULES);
  assert.deepEqual(seed.terms.map((t: { clause_id: string; body: string }) => [t.clause_id, t.body]), DEFAULT_LIBRARY.map((c) => [c.id, c.body]), 'run: node --experimental-strip-types scripts/build-hubdb-seed.ts');
});
