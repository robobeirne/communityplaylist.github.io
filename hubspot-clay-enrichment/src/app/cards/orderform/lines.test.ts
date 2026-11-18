import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultQuantity,
  lineIssues,
  lineUpdate,
  newRawLine,
  pricingTable,
  quantityRule,
  resetToList,
  termUpdate,
  toLine,
  totals,
  type Product,
  type RawLine,
} from './lines.ts';

const SAFETY: Product = { id: '1', name: 'Protex AI Platform Site License - Safety', sku: '1', description: '', prices: { GBP: 33300, USD: 45000 }, frequency: 'annually' };
const CAMERA: Product = { id: '2', name: 'Camera Integration - Safety', sku: '2', description: '', prices: { GBP: 750 }, frequency: 'annually' };
const INSTALL: Product = { id: '3', name: 'On-site Installation', sku: '3', description: '', prices: { GBP: 3750 }, frequency: '' };
const FREE: Product = { id: '4', name: 'Licence - Intelligence (Free)', sku: '9', description: '', prices: { GBP: 0 }, frequency: 'annually' };
const PRODUCTS = [SAFETY, CAMERA, INSTALL, FREE];
const USD_ONLY: Product = { id: '5', name: 'Regional fee', sku: '', description: '', prices: { USD: 10 }, frequency: '' };
const line = (props: Record<string, string>, id = '10'): RawLine => ({ id, properties: { hs_line_item_currency_code: 'GBP', ...props } });

test('a line mirrors HubSpot: gross, per-line discount, net, annualised', () => {
  const pct = toLine(line({ hs_product_id: '1', quantity: '3', price: '33300', hs_discount_percentage: '10', recurringbillingfrequency: 'annually' }), undefined, PRODUCTS, 'GBP');
  assert.equal(pct.gross, 99900);
  assert.equal(pct.discount, 9990);
  assert.equal(pct.net, 89910);
  assert.equal(pct.annualNet, 89910);
  assert.equal(pct.discountMode, 'percent');
  assert.equal(pct.listPrice, 33300);

  const amt = toLine(line({ hs_product_id: '2', quantity: '30', price: '750', discount: '50', recurringbillingfrequency: 'monthly' }), undefined, PRODUCTS, 'GBP');
  assert.equal(amt.discountMode, 'amount');
  assert.equal(amt.net, 30 * 700);
  assert.equal(amt.annualNet, 30 * 700 * 12, 'monthly lines are annualised');

  const capped = toLine(line({ quantity: '1', price: '750', discount: '9999' }), undefined, PRODUCTS, 'GBP');
  assert.equal(capped.net, 0, 'a per-unit discount never goes below zero');
  assert.equal(capped.recurring, false);
});

test('edits: quantity, switching discount mode, remove, reset to list', () => {
  const raw = line({ hs_product_id: '1', quantity: '2', price: '30000', hs_discount_percentage: '5', recurringbillingfrequency: 'annually' });
  const l = toLine(raw, { quantity: 3 }, PRODUCTS, 'GBP');
  assert.equal(l.quantity, 3);
  assert.equal(l.discountValue, 5);
  assert.equal(toLine(raw, { discountMode: 'amount' }, PRODUCTS, 'GBP').discountValue, 0, 'switching mode starts the new mode at zero');
  assert.equal(toLine(raw, { remove: true }, PRODUCTS, 'GBP').removed, true);

  const hidden = toLine(line({ hs_product_id: '1', quantity: '1', price: '30000', recurringbillingfrequency: 'annually' }), undefined, PRODUCTS, 'GBP');
  const fix = resetToList(hidden);
  assert.deepEqual(fix, { resetPrice: true, discountMode: 'amount', discountValue: 3300 });
  const fixed = toLine(line({ hs_product_id: '1', quantity: '1', price: '30000', recurringbillingfrequency: 'annually' }), fix, PRODUCTS, 'GBP');
  assert.equal(fixed.price, 33300);
  assert.equal(fixed.net, 30000, 'net unchanged, discount now visible');
  assert.equal(fixed.discount, 3300);
});

test('totals split recurring and one-off; TCV uses the term', () => {
  const ls = [
    toLine(line({ hs_product_id: '1', quantity: '3', price: '33300', hs_discount_percentage: '10', recurringbillingfrequency: 'annually' }, 'a'), undefined, PRODUCTS, 'GBP'),
    toLine(line({ hs_product_id: '3', quantity: '3', price: '3750' }, 'b'), undefined, PRODUCTS, 'GBP'),
    toLine(line({ hs_product_id: '2', quantity: '5', price: '750', recurringbillingfrequency: 'annually' }, 'c'), { remove: true }, PRODUCTS, 'GBP'),
  ];
  const t = totals(ls, 36);
  assert.equal(t.annualList, 99900);
  assert.equal(t.annualDiscount, 9990);
  assert.equal(t.annual, 89910);
  assert.equal(t.oneOff, 11250);
  assert.equal(t.tcv, 89910 * 3 + 11250);
  assert.equal(t.discountPct, Math.round((9990 / (99900 + 11250)) * 10000) / 100);
  assert.equal(t.discounted, true);
  assert.equal(totals(ls, null).tcv, null);
});

test('default quantities and quantity rules', () => {
  assert.equal(defaultQuantity(SAFETY, 4, 40), 4);
  assert.equal(defaultQuantity(CAMERA, 4, 40), 40);
  assert.equal(defaultQuantity(INSTALL, 4, 40), 4, 'installation is per site');
  assert.equal(defaultQuantity(FREE, 4, 40), 1);
  assert.equal(defaultQuantity(SAFETY, 0, 0), 1);
  assert.equal(quantityRule({ name: 'Protex AI Licence - Operations', sku: '6' }), 'sites');
  assert.equal(quantityRule({ name: 'Camera License - Operations', sku: '7' }), 'cameras');
  assert.equal(quantityRule({ name: 'Deployment Services', sku: '' }), 'deployment');
  assert.equal(quantityRule({ name: 'Standard Support Services', sku: '' }), null);
  assert.equal(defaultQuantity({ name: 'Deployment Services', sku: '' }, 4, 60), 4, 'one deployment per site');
});

test('line issues', () => {
  const ls = [
    toLine(line({ hs_product_id: '1', quantity: '2', price: '33300', hs_discount_percentage: '25', recurringbillingfrequency: 'annually' }, 'a'), undefined, PRODUCTS, 'GBP'),
    toLine(line({ hs_product_id: '2', quantity: '0', price: '750', recurringbillingfrequency: 'annually', hs_line_item_currency_code: 'USD' }, 'b'), undefined, PRODUCTS, 'GBP'),
    toLine(newRawLine('new-1', USD_ONLY, 'GBP'), undefined, [...PRODUCTS, USD_ONLY], 'GBP'),
  ];
  const issues = lineIssues(ls, 'GBP', 3, 30);
  const labels = issues.map((i) => `${i.lineId}:${i.kind}:${i.label}`);
  assert.ok(labels.includes('a:check:Protex AI Platform Site License - Safety: 25% discount is at or above the 20% approval threshold'));
  assert.ok(labels.includes('a:check:Protex AI Platform Site License - Safety: 2 licences for 3 sites'));
  assert.ok(labels.includes('b:missing:Camera Integration - Safety is priced in USD, but the deal is in GBP'));
  assert.ok(labels.includes('b:missing:Camera Integration - Safety: quantity'));
  assert.ok(labels.includes('new-1:missing:Regional fee has no GBP price in the product library'));
  assert.ok(!labels.some((l) => l.startsWith('new-1:check')), 'no price warning on a line that has no list price');
});

test('what the card writes back, and the Juro pricing table', () => {
  const l = toLine(line({ hs_product_id: '1', quantity: '3', price: '33300', recurringbillingfrequency: 'annually' }), { discountMode: 'percent', discountValue: 10 }, PRODUCTS, 'GBP');
  assert.deepEqual(lineUpdate(l), { quantity: '3', hs_discount_percentage: '10', discount: '' });
  const a = toLine(line({ quantity: '2', price: '750', recurringbillingfrequency: 'annually' }), { discountMode: 'amount', discountValue: 50 }, PRODUCTS, 'GBP');
  assert.deepEqual(lineUpdate(a), { quantity: '2', hs_discount_percentage: '', discount: '50' });
  const one = toLine(line({ name: 'On-site Installation', hs_sku: '3', quantity: '1', price: '3750' }), undefined, PRODUCTS, 'GBP');
  assert.equal(
    pricingTable([{ ...l, name: SAFETY.name, sku: '1' }, one], 'GBP'),
    'Protex AI Platform Site License - Safety (1) — 3 × £33,300.00 — 10% discount — £89,910.00 per year\nOn-site Installation (3) — 1 × £3,750.00 — £3,750.00 one-off',
  );
});

test('recurring lines follow the contract term and billing start', () => {
  const raw = line({ recurringbillingfrequency: 'annually', hs_recurring_billing_period: 'P12M', hs_recurring_billing_start_date: '2026-01-01' });
  assert.deepEqual(termUpdate(raw, 36, '2027-01-01'), { hs_recurring_billing_period: 'P36M', hs_recurring_billing_start_date: '2027-01-01' });
  assert.equal(termUpdate(line({ recurringbillingfrequency: 'annually', hs_recurring_billing_period: 'P36M', hs_recurring_billing_start_date: '2027-01-01' }), 36, '2027-01-01'), null);
  assert.equal(termUpdate(line({ recurringbillingfrequency: '' }), 36, '2027-01-01'), null, 'one-off lines are left alone');
  assert.equal(termUpdate(raw, null, ''), null);
});
