// Tests the save_discovery app function against a stubbed HubSpot API.
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { main } = require('../src/app/functions/save-discovery.js');

function stubHubSpot(existing = '') {
  const sent = [];
  globalThis.fetch = async (url, opts = {}) => {
    sent.push({ url, method: opts.method ?? 'GET', body: opts.body ? JSON.parse(opts.body) : null, auth: opts.headers?.Authorization });
    if ((opts.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ properties: { da_ai_assessment: existing } }) };
    return { ok: true, json: async () => ({}) };
  };
  return sent;
}
process.env.PRIVATE_APP_ACCESS_TOKEN = 'test-token';

test('sets da_ properties and ignores anything else', async () => {
  const sent = stubHubSpot();
  const res = await main({ parameters: { dealId: '42', properties: { da_industry: 'retail', dealname: 'x', da_ai_assessment: '{}' } } });
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'PATCH');
  assert.ok(sent[0].url.endsWith('/crm/v3/objects/deals/42'));
  assert.equal(sent[0].auth, 'Bearer test-token');
  assert.deepEqual(sent[0].body, { properties: { da_industry: 'retail' } });
});

test('a correction sets the status and records it as the floor', async () => {
  const sent = stubHubSpot(JSON.stringify({ v: 1, updated: null, meetings: [], q: { load: { level: 'touched_on', by: 'ai', evidence: [1] } }, overrides: {} }));
  const res = await main({ parameters: { dealId: '42', user: 'rep@protex.ai', override: { key: 'load', level: 'answered', note: 'Email from the plant manager' } } });
  assert.equal(res.statusCode, 200);
  const props = sent[1].body.properties;
  assert.equal(props.da_load_status, 'answered');
  const state = JSON.parse(props.da_ai_assessment);
  assert.equal(state.overrides.load.level, 'answered');
  assert.equal(state.overrides.load.by, 'rep@protex.ai');
  assert.equal(state.q.load.by, 'rep');
  assert.deepEqual(state.q.load.evidence, [1], 'keeps the evidence');
});

test('money questions use the rubric id with a hyphen', async () => {
  const sent = stubHubSpot();
  await main({ parameters: { dealId: '42', override: { key: 'money_m', level: 'touched_on', note: 'x' } } });
  const props = sent[1].body.properties;
  assert.equal(props.da_money_m_status, 'touched_on');
  assert.ok(JSON.parse(props.da_ai_assessment).overrides['money-m']);
});

test('rejects bad input', async () => {
  stubHubSpot();
  assert.equal((await main({ parameters: { dealId: 'abc', properties: { da_industry: 'retail' } } })).statusCode, 400);
  assert.equal((await main({ parameters: { dealId: '42', override: { key: 'load', level: 'great' } } })).statusCode, 400);
  assert.equal((await main({ parameters: { dealId: '42', properties: { dealname: 'x' } } })).statusCode, 400);
});
