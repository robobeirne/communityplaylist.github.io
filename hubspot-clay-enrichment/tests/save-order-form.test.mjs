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
      properties: { of_client_legal_name: 'Northbridge Ltd', deal_currency_code: 'GBP', amount: '5', closedate: '1', dealstage: 'x', da_industry: 'retail', of_legal_notes: null },
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(sent[0].auth, 'Bearer test-token');
  assert.deepEqual(sent[0].body, { properties: { of_client_legal_name: 'Northbridge Ltd', deal_currency_code: 'GBP', amount: '5', of_legal_notes: '' } }, 'Amount is allowed (set from the line items); stage and close date are not');
});

test('save rejects a bad deal id or nothing to save', async () => {
  stub([]);
  assert.equal((await main({ parameters: { action: 'save', dealId: 'x', properties: { of_status: 'draft' } } })).statusCode, 400);
  assert.equal((await main({ parameters: { action: 'save', dealId: '77', properties: { dealstage: '1' } } })).statusCode, 400);
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

test('parties returns the deal contacts by name and its company', async () => {
  stub([
    ['GET', /v4\/objects\/deals\/77\/associations\/contacts/, { results: [{ toObjectId: 892183404774 }, { toObjectId: 2 }] }],
    ['GET', /v4\/objects\/deals\/77\/associations\/companies/, { results: [{ toObjectId: 9 }] }],
    [
      'POST',
      /contacts\/batch\/read/,
      { results: [{ id: '892183404774', properties: { firstname: 'Sam', lastname: 'Lee', email: 'sam@x.example', jobtitle: 'COO' } }, { id: '2', properties: { email: 'ap@x.example' } }] },
    ],
    ['POST', /companies\/batch\/read/, { results: [{ id: '9', properties: { name: 'Northbridge Ltd', city: 'Leeds', zip: null } }] }],
  ]);
  const res = await main({ parameters: { action: 'parties', dealId: '77' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.contacts, [
    { id: '2', name: '', email: 'ap@x.example', title: '' },
    { id: '892183404774', name: 'Sam Lee', email: 'sam@x.example', title: 'COO' },
  ]);
  assert.deepEqual(res.body.company, { id: '9', name: 'Northbridge Ltd', city: 'Leeds', zip: '' });
});

const future = new Date(Date.now() + 30 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();
const Q = (id, props) => ({ id, properties: { hs_title: `Quote ${id}`, hs_expiration_date: future, hs_createdate: `2026-11-${10 + Number(id) % 10}T00:00:00Z`, ...props } });

test('quote: reads the deal quotes, works out their state, and keeps the order form status in step', async () => {
  const sent = stub([
    ['GET', /objects\/deals\/77\?properties=of_quote_id/, { properties: { of_quote_id: '901', of_status: 'ready_to_send', of_quote_status: 'draft' } }],
    ['GET', /v4\/objects\/deals\/77\/associations\/quotes/, { results: [{ toObjectId: 901 }, { toObjectId: 902 }, { toObjectId: 903 }] }],
    [
      'POST',
      /quotes\/batch\/read/,
      {
        results: [
          Q('901', { hs_status: 'APPROVAL_NOT_NEEDED', hs_esign_date: '1795000000000' }),
          Q('902', { hs_status: 'DRAFT', hs_expiration_date: past }),
          Q('903', { hs_status: 'PENDING_APPROVAL' }),
        ],
      },
    ],
    ['GET', /objects\/quote_template/, { results: [{ id: '55', properties: { hs_name: 'Protex order form', hs_active: 'true' } }, { id: '56', properties: { hs_name: 'Old', hs_active: 'false' } }] }],
    ['PATCH', /objects\/deals\/77$/, {}],
  ]);
  const res = await main({ parameters: { action: 'quote', dealId: '77' } });
  assert.equal(res.statusCode, 200);
  const states = Object.fromEntries(res.body.quotes.map((q) => [q.id, q.state]));
  assert.deepEqual(states, { 901: 'signed', 902: 'expired', 903: 'awaiting_approval' });
  assert.equal(res.body.current.id, '901');
  assert.deepEqual(res.body.live.map((q) => q.id).sort(), ['901', '903']);
  assert.deepEqual(res.body.templates, [{ id: '55', name: 'Protex order form', active: true, type: '' }]);
  const patch = sent.find((s) => s.method === 'PATCH');
  assert.equal(patch.body.properties.of_status, 'signed');
  assert.equal(patch.body.properties.of_quote_status, 'signed');
  assert.ok(patch.body.properties.of_signed_at.startsWith('2026-'));
});

const CREATE = {
  action: 'create_quote',
  dealId: '77',
  templateId: '55',
  title: 'Northbridge | Order form',
  expirationDate: '2026-12-17',
  currency: 'GBP',
  terms: '<p>Terms</p>',
  comments: '<p>Comments</p>',
  signerContactId: '501',
  companyId: '9',
  sender: { firstName: 'Rob', lastName: 'Rep', email: 'rep@protex.ai', company: 'Protex AI' },
};
const createRoutes = (quotes = []) => [
  ['GET', /v4\/objects\/deals\/77\/associations\/quotes/, { results: quotes.map((q) => ({ toObjectId: Number(q.id) })) }],
  ['POST', /quotes\/batch\/read/, { results: quotes }],
  ['GET', /v4\/objects\/deals\/77\/associations\/contacts/, { results: [{ toObjectId: 501 }] }],
  ['GET', /v4\/objects\/deals\/77\/associations\/companies/, { results: [{ toObjectId: 9 }] }],
  ['GET', /v4\/objects\/deals\/77\/associations\/line_items/, { results: [{ toObjectId: 601 }] }],
  [
    'POST',
    /line_items\/batch\/read/,
    { results: [{ id: '601', properties: { hs_product_id: '1', name: 'Licence', quantity: '3', price: '33300', hs_discount_percentage: '10', amount: '89910', hs_line_item_currency_code: 'GBP', recurringbillingfrequency: 'annually', discount: null } }] },
  ],
  ['GET', /v4\/objects\/quotes\/\d+\/associations\/line_items/, { results: [{ toObjectId: 700 }] }],
  ['POST', /objects\/quotes$/, { id: '950' }],
  ['POST', /line_items\/batch\/create/, { results: [] }],
  ['DELETE', /objects\/(quotes|line_items)\/\d+$/, {}],
  ['PATCH', /objects\/deals\/77$/, {}],
];

test('create_quote: a draft quote with e-signature, copies of the line items, and the deal updated', async () => {
  const sent = stub(createRoutes());
  const res = await main({ parameters: CREATE });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const quote = sent.find((s) => s.method === 'POST' && /objects\/quotes$/.test(s.url)).body;
  assert.equal(quote.properties.hs_status, 'DRAFT');
  assert.equal(quote.properties.hs_esign_enabled, 'true');
  assert.equal(quote.properties.hs_expiration_date, '2026-12-17T23:59:59.000Z');
  assert.equal(quote.properties.hs_terms, '<p>Terms</p>');
  assert.equal(quote.properties.hs_sender_email, 'rep@protex.ai');
  assert.deepEqual(
    quote.associations.map((a) => [a.to.id, a.types[0].associationTypeId]),
    [['77', 64], ['55', 286], ['501', 69], ['9', 71]],
  );
  const copies = sent.find((s) => /line_items\/batch\/create/.test(s.url)).body.inputs;
  assert.deepEqual(copies[0].properties, { hs_product_id: '1', name: 'Licence', quantity: '3', price: '33300', hs_discount_percentage: '10', hs_line_item_currency_code: 'GBP', recurringbillingfrequency: 'annually' });
  assert.equal(copies[0].associations[0].to.id, '950');
  assert.equal(copies[0].associations[0].types[0].associationTypeId, 68);
  const deal = sent.filter((s) => s.method === 'PATCH').pop().body.properties;
  assert.equal(deal.of_quote_id, '950');
  assert.equal(deal.of_status, 'ready_to_send');
  assert.equal(deal.of_changed_after_quote, 'false');
});

test('create_quote: blocks a second live quote, replaces only a draft, checks the signer', async () => {
  let sent = stub(createRoutes([Q('901', { hs_status: 'APPROVAL_NOT_NEEDED' })]));
  let res = await main({ parameters: CREATE });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /already has a live quote/);
  assert.ok(!sent.some((s) => s.method === 'POST' && /objects\/quotes$/.test(s.url)), 'nothing created');

  res = await main({ parameters: { ...CREATE, replaceQuoteId: '901' } });
  assert.equal(res.statusCode, 409, 'a sent quote cannot be replaced');

  sent = stub(createRoutes([Q('902', { hs_status: 'DRAFT' })]));
  res = await main({ parameters: { ...CREATE, replaceQuoteId: '902' } });
  assert.equal(res.statusCode, 200);
  assert.ok(sent.some((s) => s.method === 'DELETE' && /quotes\/902$/.test(s.url)), 'the old draft is removed');
  assert.ok(sent.some((s) => s.method === 'DELETE' && /line_items\/700$/.test(s.url)), 'with its line item copies');

  stub(createRoutes([Q('902', { hs_status: 'DRAFT', hs_expiration_date: past })]));
  assert.equal((await main({ parameters: CREATE })).statusCode, 200, 'an expired quote does not block');

  stub(createRoutes());
  assert.equal((await main({ parameters: { ...CREATE, signerContactId: '999' } })).statusCode, 400, 'signer must be a deal contact');
  assert.equal((await main({ parameters: { ...CREATE, templateId: '' } })).statusCode, 400);
});
