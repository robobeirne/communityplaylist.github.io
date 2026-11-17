// Tests the save_order_form app function against a stubbed HubSpot API.
//   node --test tests/save-order-form.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { main } = require('../src/app/functions/save-order-form.js');
process.env.PRIVATE_APP_ACCESS_TOKEN = 'test-token';

function stub(routes) {
  const sent = [];
  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method ?? 'GET';
    sent.push({ url, method, body: opts.body ? JSON.parse(opts.body) : null, auth: opts.headers?.Authorization });
    const hit = routes.find(([m, re]) => m === method && re.test(url));
    const body = hit ? (typeof hit[2] === 'function' ? hit[2](url) : hit[2]) : {};
    return { ok: true, status: 200, json: async () => body };
  };
  return sent;
}

test('save writes order form fields and the reused deal fields, nothing else', async () => {
  const sent = stub([['PATCH', /objects\/deals\/77$/, {}]]);
  const res = await main({
    parameters: {
      action: 'save',
      dealId: '77',
      properties: { of_client_legal_name: 'Northbridge Ltd', deal_currency_code: 'GBP', amount: '5', dealstage: 'x', da_industry: 'retail', of_legal_notes: null },
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(sent[0].auth, 'Bearer test-token');
  assert.deepEqual(sent[0].body, { properties: { of_client_legal_name: 'Northbridge Ltd', deal_currency_code: 'GBP', of_legal_notes: '' } });
});

test('save rejects a bad deal id or nothing to save', async () => {
  stub([]);
  assert.equal((await main({ parameters: { action: 'save', dealId: 'x', properties: { of_status: 'draft' } } })).statusCode, 400);
  assert.equal((await main({ parameters: { action: 'save', dealId: '77', properties: { amount: '1' } } })).statusCode, 400);
  assert.equal((await main({ parameters: { action: 'nope' } })).statusCode, 400);
});

test('signatories lists users with profile or last-used job titles, across pages', async () => {
  stub([
    ['GET', /objects\/users\?.*after=2/, { results: [{ id: '3', properties: { hs_given_name: 'Ana', hs_family_name: 'Ruiz', hs_email: 'ana@protex.ai' } }] }],
    [
      'GET',
      /objects\/users\?/,
      {
        results: [
          { id: '1', properties: { hs_given_name: 'Jesse', hs_family_name: 'Maggs', hs_email: 'jesse@protex.ai', hs_job_title: '' } },
          { id: '2', properties: { hs_given_name: 'Jack', hs_family_name: 'Evans', hs_email: 'jack@protex.ai', hs_job_title: 'CFO' } },
          { id: '9', properties: { hs_given_name: '', hs_email: '' } },
        ],
        paging: { next: { after: '2' } },
      },
    ],
    ['POST', /deals\/search/, { results: [{ properties: { of_protex_signer_user_id: '1', of_protex_signer_title: 'CEO' } }, { properties: { of_protex_signer_user_id: '1', of_protex_signer_title: 'Old title' } }] }],
  ]);
  const res = await main({ parameters: { action: 'signatories' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.users, [
    { id: '3', name: 'Ana Ruiz', email: 'ana@protex.ai', title: '' },
    { id: '2', name: 'Jack Evans', email: 'jack@protex.ai', title: 'CFO' },
    { id: '1', name: 'Jesse Maggs', email: 'jesse@protex.ai', title: 'CEO' },
  ]);
});

const PRODUCTS = {
  results: [
    { id: '2281317872', properties: { name: 'Protex AI Platform Site License - Safety', hs_sku: '1', recurringbillingfrequency: 'annually', hs_price_gbp: '33300', hs_price_usd: '45000', hs_status: 'active' } },
    { id: '2282093039', properties: { name: 'On-site Installation', hs_sku: '3', recurringbillingfrequency: '', hs_price_gbp: '3750' } },
    { id: '414913570026', properties: { name: 'Regional Data Source Fee', hs_status: 'inactive', hs_price_gbp: '1' } },
  ],
};
const LINE = (id, props) => ({ id, properties: { name: 'x', quantity: '1', ...props } });

test('pricing returns the deal line items and active products with prices per currency', async () => {
  stub([
    ['GET', /v4\/objects\/deals\/77\/associations\/line_items/, { results: [{ toObjectId: 502 }, { toObjectId: 501 }] }],
    ['POST', /line_items\/batch\/read/, { results: [LINE('502', {}), LINE('501', {})] }],
    ['GET', /objects\/products\?/, PRODUCTS],
  ]);
  const res = await main({ parameters: { action: 'pricing', dealId: '77' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.lines.map((l) => l.id), ['501', '502']);
  assert.deepEqual(res.body.products.map((p) => p.name), ['On-site Installation', 'Protex AI Platform Site License - Safety']);
  assert.deepEqual(res.body.products[1].prices, { GBP: 33300, USD: 45000 });
  assert.equal(res.body.products[1].frequency, 'annually');
});

test('save adds products at list price in the deal currency, edits and removes only this deal’s lines', async () => {
  const sent = stub([
    ['PATCH', /objects\/deals\/77$/, {}],
    ['GET', /objects\/deals\/77\?properties=deal_currency_code/, { properties: { deal_currency_code: 'GBP' } }],
    ['GET', /v4\/objects\/deals\/77\/associations\/line_items/, { results: [{ toObjectId: 501 }] }],
    ['GET', /objects\/products\?/, PRODUCTS],
    ['POST', /objects\/line_items$/, { id: '600' }],
    ['PATCH', /line_items\/501$/, {}],
    ['DELETE', /line_items\/501$/, {}],
    ['POST', /line_items\/batch\/read/, { results: [LINE('600', {})] }],
  ]);
  const res = await main({
    parameters: {
      action: 'save',
      dealId: '77',
      properties: { of_status: 'draft' },
      lines: {
        create: [
          { productId: '2281317872', quantity: 3, discountMode: 'percent', discountValue: 10, months: 24, start: '2027-01-01' },
          { productId: '414913570026', quantity: 1 },
        ],
        update: [
          { id: '501', properties: { quantity: '4', price: '1', amount: '9', hs_discount_percentage: '' }, resetPrice: true, productId: '2281317872' },
          { id: '999', properties: { quantity: '1' } },
        ],
        remove: ['501', '888'],
      },
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, false, 'reports what it refused');
  assert.match(res.body.message, /414913570026 isn't in the product library/);
  assert.match(res.body.message, /999 isn't on this deal/);
  assert.match(res.body.message, /888 isn't on this deal/);
  assert.deepEqual(res.body.lines.map((l) => l.id), ['600']);

  const created = sent.filter((s) => s.method === 'POST' && /objects\/line_items$/.test(s.url));
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].body.properties, {
    hs_product_id: '2281317872',
    name: 'Protex AI Platform Site License - Safety',
    hs_sku: '1',
    quantity: '3',
    price: '33300',
    hs_line_item_currency_code: 'GBP',
    hs_discount_percentage: '10',
    recurringbillingfrequency: 'annually',
    hs_recurring_billing_period: 'P24M',
    hs_recurring_billing_start_date: '2027-01-01',
  });
  assert.equal(created[0].body.associations[0].types[0].associationTypeId, 20);
  const patched = sent.find((s) => s.method === 'PATCH' && /line_items\/501$/.test(s.url));
  assert.deepEqual(patched.body.properties, { quantity: '4', hs_discount_percentage: '', price: '33300', hs_line_item_currency_code: 'GBP' }, 'unit price only ever reset to list');
  assert.equal(sent.filter((s) => s.method === 'DELETE').length, 1);
});

test('save with only line changes skips the deal update', async () => {
  const sent = stub([
    ['GET', /objects\/deals\/77\?properties=deal_currency_code/, { properties: { deal_currency_code: 'USD' } }],
    ['GET', /v4\/objects\/deals\/77\/associations\/line_items/, { results: [{ toObjectId: 501 }] }],
    ['PATCH', /line_items\/501$/, {}],
    ['POST', /line_items\/batch\/read/, { results: [LINE('501', { quantity: '2' })] }],
  ]);
  const res = await main({ parameters: { action: 'save', dealId: '77', properties: {}, lines: { update: [{ id: '501', properties: { quantity: '2' } }] } } });
  assert.equal(res.body.ok, true);
  assert.ok(!sent.some((s) => s.method === 'PATCH' && /deals\/77$/.test(s.url)));
});
