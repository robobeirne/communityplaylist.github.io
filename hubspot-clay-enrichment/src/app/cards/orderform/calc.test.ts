import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute, computedProperties, orderTypeFromPipeline, parseDate, readiness, termEnd, termMonths, isoDate } from './calc.ts';

const base = {
  of_safety_units: '3',
  of_safety_unit_fee: '12000',
  of_cameras_units: '30',
  of_cameras_unit_fee: '500',
  term_year_length: '24 months',
  contract_start_date: '2027-01-01',
};

test('line totals, annual subscription and TCV', () => {
  const c = compute(base);
  assert.equal(c.lines.safety, 36000);
  assert.equal(c.lines.cameras, 15000);
  assert.equal(c.annualList, 51000);
  assert.equal(c.annual, 51000);
  assert.equal(c.months, 24);
  assert.equal(c.tcv, 102000);
  assert.equal(isoDate(c.end!), '2028-12-31');
});

test('optional lines only count when included', () => {
  const v = { ...base, of_ops_units: '3', of_ops_unit_fee: '4000', of_intel_units: '1', of_intel_unit_fee: '10000' };
  assert.equal(compute(v).annualList, 51000, 'not included yet');
  const on = compute({ ...v, of_ops_included: 'true', of_intel_included: 'true' });
  assert.equal(on.lines.ops, 12000);
  assert.equal(on.annualList, 73000);
});

test('hardware is one-off or annual', () => {
  const hw = { ...base, of_hardware_included: 'true', of_hardware_units: '3', of_hardware_unit_fee: '1500', of_implementation_fee: '5000' };
  const oneOff = compute({ ...hw, of_hardware_billing: 'one_off' });
  assert.equal(oneOff.annualList, 51000);
  assert.equal(oneOff.oneOff, 9500);
  assert.equal(oneOff.tcv, 102000 + 9500);
  const annual = compute({ ...hw, of_hardware_billing: 'annually' });
  assert.equal(annual.annualList, 55500);
  assert.equal(annual.oneOff, 5000);
});

test('discounts apply to the annual subscription, not one-off fees', () => {
  const pct = compute({ ...base, of_implementation_fee: '5000', of_discount_applied: 'true', of_discount_type: 'percentage', of_discount_value: '10' });
  assert.equal(pct.discount, 5100);
  assert.equal(pct.annual, 45900);
  assert.equal(pct.tcv, 45900 * 2 + 5000);
  const fixed = compute({ ...base, of_discount_applied: 'true', of_discount_type: 'fixed_amount_per_year', of_discount_value: '1000' });
  assert.equal(fixed.annual, 50000);
  const capped = compute({ ...base, of_discount_applied: 'true', of_discount_type: 'fixed_amount_per_year', of_discount_value: '999999' });
  assert.equal(capped.annual, 0);
  assert.equal(compute({ ...base, of_discount_type: 'percentage', of_discount_value: '10' }).discount, 0, 'ignored unless applied');
});

test('dates', () => {
  assert.equal(termMonths('36 months'), 36);
  assert.equal(termMonths(''), null);
  assert.equal(isoDate(parseDate('1798761600000')!), '2027-01-01');
  assert.equal(isoDate(termEnd(new Date(Date.UTC(2027, 0, 31)), 1)), '2027-03-02', 'month overflow is handled by Date');
  assert.equal(isoDate(termEnd(new Date(Date.UTC(2027, 2, 15)), 12)), '2028-03-14');
  assert.equal(orderTypeFromPipeline('497851373'), 'renewal');
  assert.equal(orderTypeFromPipeline('25788392'), 'expansion');
  assert.equal(orderTypeFromPipeline('default'), 'new_business');
});

test('site schedule and calculated properties for Juro', () => {
  const v = {
    ...base,
    number_of_sites_to_start: '2',
    of_rollout: 'staged_rollout',
    of_site_1_name: 'Amesbury',
    of_site_1_cameras: '18',
    of_site_1_go_live: '2027-02-01',
    of_site_2_name: 'Leeds DC',
    of_site_2_cameras: '12',
    of_site_2_go_live: '2027-05-01',
  };
  const p = computedProperties(v);
  assert.equal(p.of_site_schedule, '1. Amesbury — 18 camera integrations — go-live 1 Feb 2027\n2. Leeds DC — 12 camera integrations — go-live 1 May 2027');
  assert.equal(p.of_annual_subscription_fee, '51000');
  assert.equal(p.of_total_contract_value, '102000');
  assert.equal(p.of_contract_end_date, '2028-12-31');
  const together = computedProperties({ ...v, of_rollout: 'all_sites_together' });
  assert.ok(together.of_site_schedule.startsWith('1. Amesbury — 18 camera integrations — go-live 1 Jan 2027'), 'uses the contract start');
});

test('readiness lists what is missing, by section', () => {
  const empty = readiness({});
  assert.ok(empty.missing.some((g) => g.section === 'client' && g.label === "Client's legal entity name"));
  assert.ok(empty.missing.some((g) => g.label === 'Protex signatory'));
  assert.ok(!empty.missing.some((g) => g.label.startsWith('Operations License')), 'optional lines are not required');

  const full: Record<string, string> = {
    ...base,
    of_client_legal_name: 'Northbridge Logistics Ltd',
    of_client_legal_address: '1 Dock Road, Leeds',
    of_client_contact_name: 'Sam Lee',
    of_client_contact_email: 'sam@northbridge.example',
    client_s_email_for_invoicing_: 'ap@northbridge.example',
    of_order_type: 'new_business',
    of_quote_date: '2026-11-17',
    of_offer_expiry_date: '2026-12-17',
    of_target_signature_date: '2026-12-10',
    deal_currency_code: 'GBP',
    of_billing_frequency: 'annually_in_advance',
    of_payment_terms: 'net_30',
    number_of_sites_to_start: '1',
    of_rollout: 'all_sites_together',
    of_site_1_name: 'Leeds DC',
    of_site_1_cameras: '30',
    of_existing_msa: 'no',
    of_counterparty_signer_name: 'Alex Kim',
    of_counterparty_signer_email: 'alex@northbridge.example',
    of_counterparty_signer_title: 'COO',
    of_protex_signer_name: 'Jesse Maggs',
    of_protex_signer_email: 'jesse@protex.ai',
    of_protex_signer_title: 'CEO',
  };
  const r = readiness(full);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.warnings, []);

  const renewal = readiness({ ...full, of_order_type: 'renewal' });
  assert.deepEqual(renewal.missing.map((g) => g.label), ['Pro-rata renewal?']);
  const msa = readiness({ ...full, of_existing_msa: 'yes' });
  assert.deepEqual(msa.missing.map((g) => g.label), ['MSA details or link']);
  const staged = readiness({ ...full, of_rollout: 'staged_rollout' });
  assert.deepEqual(staged.missing.map((g) => g.label), ['Site 1: go-live date']);
});

test('warnings catch things that look wrong', () => {
  const w = readiness({
    ...base,
    of_quote_date: '2026-11-17',
    of_offer_expiry_date: '2026-11-01',
    of_target_signature_date: '2026-12-01',
    of_client_contact_email: 'not-an-email',
    number_of_sites_to_start: '2',
    of_site_1_cameras: '10',
    of_site_2_cameras: '10',
  }).warnings.map((g) => g.label);
  assert.ok(w.includes('The offer expires before the quote date'));
  assert.ok(w.includes('The target signature date is after the offer expires'));
  assert.ok(w.includes("Client contact email doesn't look like an email address"));
  assert.ok(w.includes('Cameras per site add up to 20, but 30 camera integrations are priced'));
});
