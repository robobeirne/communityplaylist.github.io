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
    const body = hit ? (typeof hit[2] === 'function' ? hit[2](url, opts) : hit[2]) : {};
    const status = body?.__status ?? 200;
    return { ok: status < 400, status, json: async () => body };
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
  const patch0 = sent.find((x) => x.method === 'PATCH');
  assert.equal(patch0.auth, 'Bearer test-token');
  assert.deepEqual(patch0.body, { properties: { of_client_legal_name: 'Northbridge Ltd', deal_currency_code: 'GBP', amount: '5', of_legal_notes: '' } }, 'Amount is allowed (set from the line items); stage and close date are not');
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
  ['PATCH', /objects\/quotes\/\d+$/, {}],
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

test('create_quote: blocks a second live quote, replaces a draft, versions a sent quote, checks the signer', async () => {
  let sent = stub(createRoutes([Q('901', { hs_status: 'APPROVAL_NOT_NEEDED' })]));
  let res = await main({ parameters: CREATE });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /already has a live quote/);
  assert.ok(!sent.some((s) => s.method === 'POST' && /objects\/quotes$/.test(s.url)), 'nothing created');

  sent = stub(createRoutes([Q('901', { hs_status: 'APPROVAL_NOT_NEEDED', hs_title: 'Northbridge | Order form' })]));
  res = await main({ parameters: { ...CREATE, replaceQuoteId: '901' } });
  assert.equal(res.statusCode, 200, 'a sent quote can be superseded by a new version');
  const expired = sent.find((s) => s.method === 'PATCH' && /quotes\/901$/.test(s.url));
  assert.ok(Date.parse(expired.body.properties.hs_expiration_date) < Date.now(), 'the sent quote is expired, not deleted');
  assert.ok(!sent.some((s) => s.method === 'DELETE' && /quotes\/901$/.test(s.url)));
  assert.equal(sent.find((s) => s.method === 'POST' && /objects\/quotes$/.test(s.url)).body.properties.hs_title, 'Northbridge | Order form v2');

  stub(createRoutes([Q('903', { hs_status: 'APPROVAL_NOT_NEEDED', hs_esign_date: '1795000000000' })]));
  res = await main({ parameters: { ...CREATE, replaceQuoteId: '903' } });
  assert.equal(res.statusCode, 409, 'a signed quote cannot be replaced');

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

test('free products are offered at 0 in every currency', async () => {
  stub([
    ['GET', /v4\/objects\/deals\/77\/associations\/line_items/, { results: [] }],
    [
      'GET',
      /objects\/products\?/,
      {
        results: [
          { id: '414730536132', properties: { name: 'Protex AI Licence - Intelligence (Free)', recurringbillingfrequency: 'annually', hs_status: 'active' } },
          { id: '427764333792', properties: { name: 'Deployment Services', hs_price_gbp: '0', hs_price_usd: '0', recurringbillingfrequency: 'annually' } },
          { id: '1', properties: { name: 'Unpriced thing' } },
        ],
      },
    ],
  ]);
  const res = await main({ parameters: { action: 'pricing', dealId: '77' } });
  const by = Object.fromEntries(res.body.products.map((p) => [p.name, p.prices]));
  assert.deepEqual(by['Protex AI Licence - Intelligence (Free)'], { GBP: 0, EUR: 0, USD: 0, CAD: 0 });
  assert.deepEqual(by['Deployment Services'], { GBP: 0, EUR: 0, USD: 0, CAD: 0 });
  assert.deepEqual(by['Unpriced thing'], {}, 'no price and not free: still needs a price');
});

test('save skips deal properties that do not exist yet instead of failing', async () => {
  let attempt = 0;
  const sent = stub([
    [
      'PATCH',
      /objects\/deals\/77$/,
      () =>
        ++attempt === 1
          ? {
              __status: 400,
              status: 'error',
              message:
                'Property values were not valid: [{"isValid":false,"message":"Property \\"of_standard_inclusions_added\\" does not exist","error":"PROPERTY_DOESNT_EXIST","name":"of_standard_inclusions_added"},{"isValid":false,"message":"Property \\"of_msa_status\\" does not exist","error":"PROPERTY_DOESNT_EXIST","name":"of_msa_status"}]',
              category: 'VALIDATION_ERROR',
            }
          : {},
    ],
  ]);
  const res = await main({ parameters: { action: 'save', dealId: '77', properties: { of_client_legal_name: 'Lennox', of_msa_status: 'standard_msa', of_standard_inclusions_added: 'true' } } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.match(res.body.warning, /skipped: of_standard_inclusions_added, of_msa_status/);
  assert.deepEqual(res.body.properties, { of_client_legal_name: 'Lennox' });
  assert.deepEqual(sent.filter((x) => x.method === 'PATCH')[1].body.properties, { of_client_legal_name: 'Lennox' }, 'retried without the missing ones');

  stub([['PATCH', /objects\/deals\/77$/, { __status: 400, message: 'Some other validation error' }]]);
  const other = await main({ parameters: { action: 'save', dealId: '77', properties: { of_client_legal_name: 'Lennox' } } });
  assert.equal(other.statusCode, 400, 'other errors still fail');
});

test('quote: forgets an order form quote that was deleted in HubSpot', async () => {
  const sent = stub([
    ['GET', /objects\/deals\/77\?properties=of_quote_id/, { properties: { of_quote_id: '451620461755', of_status: 'ready_for_juro', of_quote_status: 'sent' } }],
    ['GET', /v4\/objects\/deals\/77\/associations\/quotes/, { results: [{ toObjectId: 451645967574 }] }],
    ['POST', /quotes\/batch\/read/, { results: [Q('451645967574', { hs_title: 'Allnex Global - FY-27 Renewal', hs_status: 'DRAFT' })] }],
    ['GET', /objects\/quote_template/, { results: [] }],
    ['PATCH', /objects\/deals\/77$/, {}],
  ]);
  const res = await main({ parameters: { action: 'quote', dealId: '77' } });
  assert.equal(res.body.current, null);
  assert.deepEqual(res.body.live.map((q) => q.id), ['451645967574'], 'the manual draft is still reported, so the card can offer to replace it');
  assert.deepEqual(sent.find((s) => s.method === 'PATCH').body.properties, { of_quote_id: '', of_quote_status: '', of_status: 'draft', of_changed_after_quote: '', of_locked: 'false' });
});

test('request_approval saves the request and gives each approver a task on the deal', async () => {
  const sent = stub([
    ['GET', /objects\/deals\/77\?properties=dealname/, { properties: { dealname: 'Lennox' } }],
    ['GET', /owners\/\?email=cfo/, { results: [{ id: '501' }] }],
    ['GET', /owners\/\?email=legal/, { results: [] }],
    ['POST', /objects\/tasks$/, (url, opts) => ({ id: JSON.parse(opts.body).properties.hubspot_owner_id ? '9001' : '9002' })],
    ['PATCH', /objects\/deals\/77$/, {}],
  ]);
  const request = {
    fingerprint: 'payment:net_60|term:pilot_exit:90',
    reasons: [
      { key: 'payment:net_60', label: 'Payment terms: Net 60', role: 'finance' },
      { key: 'term:pilot_exit:90', label: 'Special term: Pilot exit (90)', role: 'legal' },
    ],
    approvers: { finance: { id: '1', email: 'cfo@protex.ai', name: 'Cara CFO' }, legal: { id: '2', email: 'legal@protex.ai', name: 'Lee Legal' } },
  };
  const res = await main({ parameters: { action: 'request_approval', dealId: '77', request, requestedBy: 'rep@protex.ai' } });
  assert.equal(res.statusCode, 200);
  const tasks = sent.filter((s) => s.method === 'POST' && /objects\/tasks$/.test(s.url));
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].body.properties.hubspot_owner_id, '501');
  assert.equal(tasks[0].body.properties.hs_task_subject, 'Approve order form terms: Lennox');
  assert.ok(tasks[0].body.properties.hs_task_body.includes('• Payment terms: Net 60'));
  assert.equal(tasks[0].body.associations[0].types[0].associationTypeId, 216);
  const saved = JSON.parse(res.body.properties.of_approval);
  assert.equal(res.body.properties.of_approval_status, 'pending');
  assert.equal(saved.roles.finance.taskId, '9001');
  assert.equal(saved.roles.legal.status, 'pending');
  assert.match(res.body.warning, /Lee Legal isn't a HubSpot owner/);

  stub([]);
  const missing = await main({ parameters: { action: 'request_approval', dealId: '77', request: { ...request, approvers: { finance: request.approvers.finance } } } });
  assert.equal(missing.statusCode, 400, 'every type needs an approver');
});

test('decide_approval: only the named approver decides; all approved completes it', async () => {
  const record = {
    fingerprint: 'fp',
    reasons: [],
    roles: {
      finance: { approver: { id: '1', email: 'cfo@protex.ai', name: 'Cara CFO' }, status: 'pending', taskId: '9001' },
      legal: { approver: { id: '2', email: 'legal@protex.ai', name: 'Lee Legal' }, status: 'approved', by: 'Lee Legal' },
    },
  };
  let sent = stub([
    ['GET', /objects\/deals\/77\?properties=of_approval/, { properties: { of_approval: JSON.stringify(record) } }],
    ['PATCH', /objects\/(deals\/77|tasks\/9001)$/, {}],
  ]);
  const wrong = await main({ parameters: { action: 'decide_approval', dealId: '77', role: 'finance', decision: 'approved', user: { email: 'rep@protex.ai' } } });
  assert.equal(wrong.statusCode, 403);
  const res = await main({ parameters: { action: 'decide_approval', dealId: '77', role: 'finance', decision: 'approved', note: 'OK for this one', user: { email: 'CFO@protex.ai', name: 'Cara CFO' } } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.properties.of_approval_status, 'approved');
  assert.equal(res.body.properties.of_approved_by, 'Finance: Cara CFO; Legal: Lee Legal');
  assert.equal(JSON.parse(res.body.properties.of_approval).roles.finance.note, 'OK for this one');
  assert.ok(sent.some((s) => s.method === 'PATCH' && /tasks\/9001$/.test(s.url) && s.body.properties.hs_task_status === 'COMPLETED'), 'the task is completed');

  stub([
    ['GET', /objects\/deals\/77\?properties=of_approval/, { properties: { of_approval: JSON.stringify(record) } }],
    ['PATCH', /objects\/(deals\/77|tasks\/9001)$/, {}],
  ]);
  const noNote = await main({ parameters: { action: 'decide_approval', dealId: '77', role: 'finance', decision: 'rejected', user: { email: 'cfo@protex.ai' } } });
  assert.equal(noNote.statusCode, 400, 'a rejection needs a note');
  const rejected = await main({ parameters: { action: 'decide_approval', dealId: '77', role: 'finance', decision: 'rejected', note: 'Net 90 is too long', user: { email: 'cfo@protex.ai' } } });
  assert.equal(rejected.body.properties.of_approval_status, 'rejected');
  assert.equal(JSON.parse(rejected.body.properties.of_approval).history.at(-1).note, 'Net 90 is too long', 'decisions are kept as history');
});

const RULE_ROWS = {
  results: [
    { id: '11', values: { key: 'rules_editors', value: 'scott.cahill@protex.ai' } },
    { id: '12', values: { key: 'legal_editors', value: 'jemima.davison@protex.ai' } },
    { id: '13', values: { key: 'payment_terms_allowed', value: 'net_30' } },
  ],
};
const TERM_ROWS = { results: [{ id: '21', values: { clause_id: 'tc_3d', kind: 'standard', section: 3, position: 4, body: '{{payment}}', enabled: 1, version: 2 } }] };

test('settings reads the rules and Terms library from HubDB, or falls back to defaults', async () => {
  stub([
    ['GET', /hubdb\/tables\/order_form_rules\/rows/, RULE_ROWS],
    ['GET', /hubdb\/tables\/order_form_terms\/rows/, TERM_ROWS],
  ]);
  const res = await main({ parameters: { action: 'settings' } });
  assert.equal(res.body.source, 'hubdb');
  assert.equal(res.body.rules.payment_terms_allowed, 'net_30');
  assert.deepEqual(res.body.library, [{ id: 'tc_3d', kind: 'standard', section: 3, position: 4, body: '{{payment}}', enabled: true, version: 2 }]);

  stub([['GET', /hubdb/, { __status: 404, message: 'Table not found' }]]);
  const none = await main({ parameters: { action: 'settings' } });
  assert.equal(none.body.source, 'defaults');
  assert.match(none.body.error, /Table not found/);
});

test('save_settings: only rules editors change rules, only legal editors change clauses; publishes', async () => {
  const routes = () => [
    ['GET', /hubdb\/tables\/order_form_rules\/rows/, RULE_ROWS],
    ['GET', /hubdb\/tables\/order_form_terms\/rows/, TERM_ROWS],
    ['PATCH', /hubdb\/tables\/.*\/rows\/\d+\/draft$/, {}],
    ['POST', /hubdb\/tables\/.*\/rows$/, {}],
    ['POST', /hubdb\/tables\/.*\/draft\/publish$/, {}],
  ];
  let sent = stub(routes());
  const denied = await main({ parameters: { action: 'save_settings', rules: { payment_terms_allowed: 'net_30, net_60' }, user: { email: 'jemima.davison@protex.ai' } } });
  assert.equal(denied.statusCode, 403, 'legal editor is not a rules editor');

  sent = stub(routes());
  const ok = await main({ parameters: { action: 'save_settings', rules: { payment_terms_allowed: 'net_30, net_60', approver_sales: 'scott.cahill@protex.ai' }, user: { email: 'Scott.Cahill@protex.ai', name: 'Scott Cahill' } } });
  assert.equal(ok.statusCode, 200);
  const patch = sent.find((s) => s.method === 'PATCH' && /order_form_rules\/rows\/13\/draft$/.test(s.url));
  assert.equal(patch.body.values.value, 'net_30, net_60');
  assert.equal(patch.body.values.updated_by, 'Scott Cahill');
  assert.ok(sent.some((s) => s.method === 'POST' && /order_form_rules\/rows$/.test(s.url) && s.body.values.key === 'approver_sales'), 'a new rule row is added');
  assert.ok(sent.some((s) => /order_form_rules\/draft\/publish$/.test(s.url)));

  stub(routes());
  const lockout = await main({ parameters: { action: 'save_settings', rules: { rules_editors: ' ' }, user: { email: 'scott.cahill@protex.ai' } } });
  assert.equal(lockout.statusCode, 400, "can't remove every rules editor");

  sent = stub(routes());
  const clause = await main({ parameters: { action: 'save_settings', clauses: [{ id: 'tc_3d', kind: 'standard', body: '{{payment}} Interest applies.' }], user: { email: 'jemima.davison@protex.ai', name: 'Jemima Davison' } } });
  assert.equal(clause.statusCode, 200);
  const cpatch = sent.find((s) => s.method === 'PATCH' && /order_form_terms\/rows\/21\/draft$/.test(s.url));
  assert.equal(cpatch.body.values.body, '{{payment}} Interest applies.');
  assert.equal(cpatch.body.values.version, 3, 'version goes up');
  assert.ok(sent.some((s) => /order_form_terms\/draft\/publish$/.test(s.url)));
  stub(routes());
  assert.equal((await main({ parameters: { action: 'save_settings', clauses: [{ id: 'tc_3d', body: 'x' }], user: { email: 'scott.cahill@protex.ai' } } })).statusCode, 403);
});

test('identity: when HubSpot names the signed-in user, the card cannot claim to be someone else', async () => {
  const record = { fingerprint: 'fp', reasons: [], roles: { finance: { approver: { id: '1', email: 'cfo@protex.ai', name: 'Cara CFO' }, status: 'pending' } } };
  stub([
    ['GET', /objects\/deals\/77\?properties=of_approval/, { properties: { of_approval: JSON.stringify(record) } }],
    ['PATCH', /objects\/deals\/77$/, {}],
  ]);
  const spoof = await main({ user: { email: 'rep@protex.ai' }, parameters: { action: 'decide_approval', dealId: '77', role: 'finance', decision: 'approved', user: { email: 'cfo@protex.ai' } } });
  assert.equal(spoof.statusCode, 403, 'claimed email differs from the signed-in user');
  const real = await main({ user: { email: 'cfo@protex.ai' }, parameters: { action: 'decide_approval', dealId: '77', role: 'finance', decision: 'approved', user: { email: 'cfo@protex.ai', name: 'Cara CFO' } } });
  assert.equal(real.statusCode, 200);
  assert.equal(JSON.parse(real.body.properties.of_approval).roles.finance.verified, true);

  stub([['POST', /users\/search/, { results: [{ properties: { hs_email: 'cfo@protex.ai' } }] }]]);
  const who = await main({ userId: 69128949, parameters: { action: 'whoami' } });
  assert.deepEqual(who.body.session, { email: 'cfo@protex.ai', id: '69128949', source: 'user id' }, 'a user id is looked up');
  assert.equal(who.body.version, 'v21');
});

test('locking: sent quotes lock the order form; saves are refused until unlocked with a reason', async () => {
  stub([['GET', /objects\/deals\/77\?properties=of_locked/, { properties: { of_locked: 'true' } }]]);
  const res = await main({ parameters: { action: 'save', dealId: '77', properties: { of_legal_notes: 'x' } } });
  assert.equal(res.statusCode, 423);

  const sent = stub([
    ['GET', /hubdb\/tables\/order_form_rules\/rows/, { results: [{ id: '1', values: { key: 'legal_editors', value: 'jemima.davison@protex.ai' } }] }],
    ['GET', /hubdb\/tables\/order_form_terms\/rows/, { results: [] }],
    ['GET', /objects\/deals\/77\?properties=of_quote_id,of_lock_log/, { properties: { of_quote_id: '950', of_quote_status: 'sent' } }],
    ['PATCH', /objects\/deals\/77$/, {}],
  ]);
  assert.equal((await main({ parameters: { action: 'unlock', dealId: '77', reason: '', user: { email: 'jemima.davison@protex.ai' } } })).statusCode, 400, 'a reason is required');
  assert.equal((await main({ parameters: { action: 'unlock', dealId: '77', reason: 'Client asked for Net 45', user: { email: 'rep@protex.ai' } } })).statusCode, 403);
  const ok = await main({ parameters: { action: 'unlock', dealId: '77', reason: 'Client asked for Net 45', user: { email: 'jemima.davison@protex.ai', name: 'Jemima Davison' } } });
  assert.equal(ok.statusCode, 200);
  const log = JSON.parse(ok.body.properties.of_lock_log);
  assert.equal(log.unlockedQuoteId, '950');
  assert.equal(log.entries[0].reason, 'Client asked for Net 45');
  assert.equal(ok.body.properties.of_locked, 'false');
});

test('signature: snapshot of what was signed, deal moved to closed won, order form locked', async () => {
  const sent = stub([
    ['GET', /objects\/deals\/77\?properties=of_quote_id/, { properties: { of_quote_id: '901', of_status: 'sent', pipeline: 'default', dealstage: 'contractsent', deal_currency_code: 'USD', of_amendment_summary: '3D: amended' } }],
    ['GET', /v4\/objects\/deals\/77\/associations\/quotes/, { results: [{ toObjectId: 901 }] }],
    ['POST', /quotes\/batch\/read/, { results: [Q('901', { hs_status: 'APPROVAL_NOT_NEEDED', hs_esign_date: '1795000000000' })] }],
    ['GET', /objects\/quotes\/901\?properties/, { properties: { hs_title: 'Lennox | Order form', hs_terms: '<h3>Terms</h3>', hs_comments: '<table></table>', hs_quote_amount: '200000', hs_currency: 'USD', hs_esign_date: '1795000000000' } }],
    ['GET', /v4\/objects\/quotes\/901\/associations\/line_items/, { results: [{ toObjectId: 700 }] }],
    ['POST', /line_items\/batch\/read/, { results: [{ id: '700', properties: { name: 'Licence', quantity: '4', price: '45000', hs_discount_percentage: '22.22', amount: '140000' } }] }],
    ['GET', /hubdb/, { results: [] }],
    ['GET', /pipelines\/deals\/default/, { stages: [{ id: 'contractsent', metadata: { isClosed: 'false', probability: '0.9' } }, { id: 'closedwon', metadata: { isClosed: 'true', probability: '1.0' } }, { id: 'closedlost', metadata: { isClosed: 'true', probability: '0.0' } }] }],
    ['GET', /objects\/quote_template/, { results: [] }],
    ['PATCH', /objects\/deals\/77$/, {}],
  ]);
  const res = await main({ parameters: { action: 'quote', dealId: '77' } });
  assert.equal(res.statusCode, 200);
  const patches = sent.filter((x) => x.method === 'PATCH').map((x) => x.body.properties);
  assert.ok(patches.some((p) => p.dealstage === 'closedwon'), 'moved to the closed won stage');
  const props = patches.find((p) => p.of_signed_snapshot);
  const snap = JSON.parse(props.of_signed_snapshot);
  assert.equal(snap.title, 'Lennox | Order form');
  assert.equal(snap.terms, '<h3>Terms</h3>');
  assert.deepEqual(snap.lines.map((l) => [l.name, l.quantity, l.price, l.discountPct]), [['Licence', '4', '45000', '22.22']]);
  assert.equal(snap.amendments, '3D: amended');
  assert.equal(props.of_locked, 'true');
  assert.equal(props.of_status, 'signed');
});

test('sweep: checks recent deals with a quote out and syncs the ones that changed', async () => {
  stub([
    ['POST', /deals\/search/, { results: [{ id: '77' }] }],
    ['GET', /hubdb/, { results: [] }],
    ['GET', /objects\/deals\/77\?properties=of_quote_id/, { properties: { of_quote_id: '901', of_status: 'ready_to_send' } }],
    ['GET', /v4\/objects\/deals\/77\/associations\/quotes/, { results: [{ toObjectId: 901 }] }],
    ['POST', /quotes\/batch\/read/, { results: [Q('901', { hs_status: 'APPROVAL_NOT_NEEDED' })] }],
    ['PATCH', /objects\/deals\/77$/, {}],
  ]);
  const res = await main({ parameters: { action: 'sweep' } });
  assert.equal(res.body.checked, 1);
  assert.equal(res.body.changed[0].properties.of_status, 'sent');
  assert.equal(res.body.changed[0].properties.of_locked, 'true');
  assert.ok(res.body.changed[0].properties.of_sent_at);
});
