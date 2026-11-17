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
