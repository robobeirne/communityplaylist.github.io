import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NUMBERED_SITES,
  computedProperties,
  dealAmount,
  normaliseStatus,
  isoDate,
  orderTypeFromPipeline,
  parseDate,
  parseSiteList,
  readSites,
  readiness,
  siteSchedule,
  summarise,
  termEnd,
  termMonths,
} from './calc.ts';
import { toLine, type Product, type RawLine } from './lines.ts';

const PRODUCTS: Product[] = [
  { id: '1', name: 'Protex AI Platform Site License - Safety', sku: '1', description: '', prices: { GBP: 33300, USD: 45000 }, frequency: 'annually' },
  { id: '2', name: 'Camera Integration - Safety', sku: '2', description: '', prices: { GBP: 750 }, frequency: 'annually' },
  { id: '3', name: 'On-site Installation', sku: '3', description: '', prices: { GBP: 3750 }, frequency: '' },
];
const raw = (id: string, productId: string, quantity: number, extra: Record<string, string> = {}): RawLine => {
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
      ...extra,
    },
  };
};
const linesFor = (raws: RawLine[]) => raws.map((r) => toLine(r, undefined, PRODUCTS, 'GBP'));
const SITES = JSON.stringify([
  { name: 'Leeds DC', cameras: 12, goLive: '' },
  { name: 'Wakefield', cameras: 10, goLive: '' },
  { name: 'Doncaster', cameras: 8, goLive: '' },
]);
const LINES = linesFor([raw('a', '1', 3), raw('b', '2', 30), raw('c', '3', 3)]);

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

test('sites come from the site list, or the numbered fields on older deals', () => {
  assert.deepEqual(readSites({ of_sites: SITES }).map((s) => s.name), ['Leeds DC', 'Wakefield', 'Doncaster']);
  const old = readSites({ number_of_sites_to_start: '2', of_site_1_name: 'Amesbury', of_site_1_cameras: '18', of_site_1_go_live: '1801440000000', of_site_2_name: 'Leeds' });
  assert.deepEqual(old, [
    { name: 'Amesbury', cameras: 18, goLive: '2027-02-01' },
    { name: 'Leeds', cameras: 0, goLive: '' },
  ]);
  assert.deepEqual(readSites({ of_sites: 'not json', number_of_sites_to_start: '1', of_site_1_name: 'A' }).map((s) => s.name), ['A']);
});

test('a pasted site list: commas, tabs, optional cameras and date', () => {
  assert.deepEqual(
    parseSiteList('Leeds DC, 12, 2027-02-01\nWakefield\t10\n\nSmith & Sons, Unit 4, 6\nDoncaster; 2027-05-01\n'),
    [
      { name: 'Leeds DC', cameras: 12, goLive: '2027-02-01' },
      { name: 'Wakefield', cameras: 10, goLive: '' },
      { name: 'Smith & Sons, Unit 4', cameras: 6, goLive: '' },
      { name: 'Doncaster', cameras: 0, goLive: '2027-05-01' },
    ],
  );
});

test('summary and the calculated properties for Juro', () => {
  const v = { of_sites: SITES, term_year_length: '24 months', contract_start_date: '2027-01-01', deal_currency_code: 'GBP', of_rollout: 'all_sites_together' };
  const s = summarise(v, LINES);
  assert.equal(s.siteCount, 3);
  assert.equal(s.siteCameras, 30);
  assert.equal(s.totals.annual, 99900 + 22500);
  assert.equal(s.totals.oneOff, 11250);
  assert.equal(s.totals.tcv, 122400 * 2 + 11250);
  const p = computedProperties(v, LINES);
  assert.equal(p.number_of_sites_to_start, '3');
  assert.equal(p.of_annual_subscription_fee, '122400');
  assert.equal(p.of_total_contract_value, '256050');
  assert.equal(p.of_contract_end_date, '2028-12-31');
  assert.equal(p.of_site_1_name, 'Leeds DC');
  assert.equal(p.of_site_4_name, '', 'numbered fields past the list are cleared');
  assert.ok(p.of_site_schedule.startsWith('1. Leeds DC — 12 camera integrations — go-live 1 Jan 2027'));
  assert.equal(p.of_pricing_table.split('\n').length, 3);
});

test('more than 20 sites: all in the schedule, the first 20 in the numbered fields', () => {
  const many = Array.from({ length: 27 }, (_, i) => ({ name: `Site ${String.fromCharCode(65 + (i % 26))}${i}`, cameras: 2, goLive: '' }));
  const v = { of_sites: JSON.stringify(many), of_rollout: 'all_sites_together' };
  const p = computedProperties(v, []);
  assert.equal(p.number_of_sites_to_start, '27');
  assert.equal(p.of_site_schedule.split('\n').length, 27);
  assert.equal(p.of_site_20_name, many[19].name);
  assert.equal(p.of_site_21_name, undefined, `only ${NUMBERED_SITES} numbered sites exist`);
  assert.ok(readiness(v, []).warnings.some((w) => w.label.startsWith('27 sites: only Sites 1–20')));
  assert.equal(siteSchedule([{ name: '', cameras: 1, goLive: '' }], false, null), '1. Site 1 — 1 camera integration');
});

const FULL: Record<string, string> = {
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
  contract_start_date: '2027-01-01',
  term_year_length: '24 months',
  of_billing_frequency: 'annually_in_advance',
  of_payment_terms: 'net_30',
  of_sites: SITES,
  of_rollout: 'all_sites_together',
  of_msa_status: 'existing_msa',
  of_msa_date: '2025-06-01',
  of_counterparty_signer_contact_id: '501',
  of_counterparty_signer_name: 'Alex Kim',
  of_counterparty_signer_email: 'alex@northbridge.example',
  of_counterparty_signer_title: 'COO',
  of_protex_signer_name: 'Jesse Maggs',
  of_protex_signer_email: 'jesse@protex.ai',
  of_protex_signer_title: 'CEO',
};

test('readiness lists what is missing, by section', () => {
  const empty = readiness({}, []);
  assert.ok(empty.missing.some((g) => g.section === 'client' && g.label === "Client's legal entity name"));
  assert.ok(empty.missing.some((g) => g.label === 'Protex signatory'));
  assert.ok(empty.missing.some((g) => g.label === 'At least one product'));
  assert.ok(empty.missing.some((g) => g.label === 'At least one site'));

  const r = readiness(FULL, LINES);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.warnings, []);

  assert.deepEqual(readiness({ ...FULL, of_order_type: 'renewal' }, LINES).missing.map((g) => g.label), ['Pro-rata renewal?']);
  assert.deepEqual(readiness({ ...FULL, of_msa_date: '' }, LINES).missing.map((g) => g.label), ['MSA date']);
  assert.deepEqual(readiness({ ...FULL, of_msa_status: 'negotiating_in_juro' }, LINES).missing.map((g) => g.label), [
    'The MSA signed in Juro (then set MSA status to Signed in Juro)',
  ]);
  assert.deepEqual(readiness({ ...FULL, of_msa_status: 'standard_msa' }, LINES).missing.map((g) => g.label), [
    'A link to the standard MSA (legal to add it to the card)',
  ], 'blocked until legal adds the standard MSA link');
  assert.deepEqual(readiness({ ...FULL, of_msa_status: 'signed_in_juro' }, LINES).missing, []);
  assert.deepEqual(readiness({ ...FULL, of_msa_status: '', of_existing_msa: 'yes' }, LINES).missing, [], 'older deals: "existing MSA: yes" counts');
  assert.deepEqual(readiness({ ...FULL, of_counterparty_signer_contact_id: '' }, LINES).missing.map((g) => g.label), [
    'Counterparty signer picked from a deal contact (they e-sign the quote)',
  ]);
  assert.deepEqual(readiness({ ...FULL, of_rollout: 'staged_rollout' }, LINES).missing.map((g) => g.label), [
    'Site 1: go-live date',
    'Site 2: go-live date',
    'Site 3: go-live date',
  ]);
  const noLicence = readiness(FULL, linesFor([raw('b', '2', 30)]));
  assert.deepEqual(noLicence.missing.map((g) => g.label), ['A platform licence product']);
});

test('pricing checks: discounts need a reason, quantities follow the sites, prices come from the library', () => {
  const discounted = linesFor([raw('a', '1', 3, { hs_discount_percentage: '10' }), raw('b', '2', 30)]);
  assert.deepEqual(readiness(FULL, discounted).missing.map((g) => g.label), ['Reason for the discounts']);
  assert.deepEqual(readiness({ ...FULL, of_discount_reason: 'Multi-site commitment' }, discounted).missing, []);

  const w = readiness(FULL, linesFor([raw('a', '1', 2, { price: '30000' }), raw('b', '2', 25)])).warnings.map((g) => g.label);
  assert.ok(w.includes('Protex AI Platform Site License - Safety: 2 licences for 3 sites'));
  assert.ok(w.includes('Camera Integration - Safety: 25 cameras, but the sites add up to 30'));
  assert.ok(w.some((x) => x.startsWith("Protex AI Platform Site License - Safety: the unit price (£30,000.00) isn't the list price (£33,300.00)")));

  const usd = readiness(FULL, linesFor([raw('a', '1', 3, { hs_line_item_currency_code: 'USD' })]));
  assert.ok(usd.missing.some((g) => g.label === 'Protex AI Platform Site License - Safety is priced in USD, but the deal is in GBP'));
});

test('warnings catch dates and emails that look wrong', () => {
  const w = readiness({ ...FULL, of_offer_expiry_date: '2026-11-01', of_target_signature_date: '2026-12-01', of_client_contact_email: 'not-an-email' }, LINES).warnings.map(
    (g) => g.label,
  );
  assert.ok(w.includes('The offer expires before the quote date'));
  assert.ok(w.includes('The target signature date is after the offer expires'));
  assert.ok(w.includes("Client contact email doesn't look like an email address"));
  const staged = readiness({ ...FULL, of_rollout: 'staged_rollout', of_sites: JSON.stringify([{ name: 'A', cameras: 30, goLive: '2026-12-01' }]) }, linesFor([raw('a', '1', 1), raw('b', '2', 30)]));
  assert.ok(staged.warnings.some((g) => g.label === 'Site 1 goes live before the contract starts'));
});

test('the deal Amount is the annual value from the line items, like existing deals', () => {
  assert.equal(dealAmount(LINES), 122400, 'recurring lines after discount; one-off fees excluded');
  assert.equal(dealAmount(linesFor([raw('c', '3', 2)])), 7500, 'one-off only: their total');
  assert.equal(dealAmount([]), null, 'no line items: leave the Amount alone');
  assert.equal(computedProperties({}, []).amount, undefined);
  assert.equal(computedProperties({}, LINES).amount, '122400');
});

test('statuses: the old Juro values read as the new ones', () => {
  assert.equal(normaliseStatus('ready_for_juro'), 'ready_to_send');
  assert.equal(normaliseStatus('sent_to_juro'), 'sent');
  assert.equal(normaliseStatus('signed'), 'signed');
  assert.equal(normaliseStatus(''), 'draft');
});
