#!/usr/bin/env node
// Runs the order form app function's own code against your real HubSpot, end to end, and cleans
// up after itself. It creates a test deal and contact, prices a licence, saves the order form,
// reads the settings, creates the order form quote (with the template, line items and
// e-signature), replaces it, asks for an approval (which creates a task), then deletes everything.
// Each step prints PASS or FAIL with HubSpot's own error, which is what to send back if one fails.
//
//   HUBSPOT_TOKEN=... node scripts/live-test.mjs          # add --keep to leave the test records
//
// The service key needs the same permissions as the app: crm.objects.deals.read/write,
// crm.objects.contacts.read/write, crm.objects.companies.read, crm.objects.users.read, e-commerce,
// crm.objects.line_items.read/write, crm.objects.quotes.read/write, crm.objects.owners.read,
// hubdb.tables.read.

import { createRequire } from 'node:module';

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Set HUBSPOT_TOKEN first (read -s HUBSPOT_TOKEN; export HUBSPOT_TOKEN).');
  process.exit(1);
}
process.env.PRIVATE_APP_ACCESS_TOKEN = TOKEN;
const KEEP = process.argv.includes('--keep');
const require = createRequire(import.meta.url);
const { main } = require('../src/app/functions/save-order-form.js');

const api = async (method, path, body) => {
  const res = await fetch(`https://api.hubapi.com${path}`, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${json.message ?? JSON.stringify(json)}`);
  return json;
};
const fn = async (parameters) => {
  const res = await main({ parameters });
  if (res.statusCode >= 400 || res.body?.ok === false) throw new Error(res.body?.message ?? `status ${res.statusCode}`);
  return res.body;
};
let failed = 0;
const step = async (name, f) => {
  try {
    const out = await f();
    console.log(`PASS  ${name}${out ? `: ${out}` : ''}`);
    return true;
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message}`);
    return false;
  }
};

const made = { deal: '', contact: '', quotes: new Set(), tasks: new Set() };
const stamp = Date.now();
let product = null;
let templateId = '';

await step('create a test deal and contact', async () => {
  const pipe = await api('GET', '/crm/v3/pipelines/deals/default');
  const stage = pipe.stages?.[0]?.id;
  const deal = await api('POST', '/crm/v3/objects/deals', { properties: { dealname: `ZZ Order form live test ${stamp} (delete me)`, pipeline: 'default', dealstage: stage, deal_currency_code: 'GBP' } });
  made.deal = String(deal.id);
  const contact = await api('POST', '/crm/v3/objects/contacts', { properties: { email: `order-form-live-test-${stamp}@example.com`, firstname: 'Live', lastname: 'Test' } });
  made.contact = String(contact.id);
  await api('PUT', `/crm/v4/objects/deals/${made.deal}/associations/default/contacts/${made.contact}`);
  return `deal ${made.deal}, contact ${made.contact}`;
});

if (made.deal) {
  await step('pricing: products and line items (e-commerce)', async () => {
    const b = await fn({ action: 'pricing', dealId: made.deal });
    product = b.products.find((p) => /site licen[cs]e - safety/i.test(p.name)) ?? b.products.find((p) => p.prices.GBP > 0);
    if (!product) throw new Error('no product with a GBP price');
    return `${b.products.length} products; using ${product.name}`;
  });
  await step('save: order form fields and a new line item', async () => {
    const b = await fn({
      action: 'save',
      dealId: made.deal,
      properties: { of_client_legal_name: 'Live Test Ltd', of_order_type: 'new_business', of_offer_expiry_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) },
      lines: { create: product ? [{ productId: product.id, quantity: 2, discountMode: 'percent', discountValue: 10, months: 12 }] : [] },
    });
    if (b.warning) console.log(`      note: ${b.warning}`);
    return `${b.lines?.length ?? 0} line item(s) on the deal`;
  });
  await step('settings: rules and Terms library from HubDB', async () => {
    const b = await fn({ action: 'settings' });
    if (b.source !== 'hubdb') throw new Error(`using defaults: ${b.error}`);
    return `${Object.keys(b.rules).length} rules, ${b.library.length} clauses`;
  });
  await step('quote templates', async () => {
    const b = await fn({ action: 'quote', dealId: made.deal });
    templateId = (b.templates.find((t) => /order form/i.test(t.name)) ?? b.templates[0])?.id ?? '';
    if (!templateId) throw new Error(`no templates (${b.templatesError || 'none returned'})`);
    return `${b.templates.length} template(s); using ${templateId}`;
  });
  const quoteParams = () => ({
    action: 'create_quote',
    dealId: made.deal,
    templateId,
    title: `ZZ Live test ${stamp} | Order form`,
    expirationDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    currency: 'GBP',
    terms: '<h3>Terms and Conditions</h3><table><tbody><tr><td>1</td><td><p><strong>A.</strong> Live test.</p></td></tr></tbody></table>',
    comments: '<table><thead><tr><th>Client Details</th><th>Billing Details</th></tr></thead><tbody><tr><td>Live Test Ltd</td><td>TBD</td></tr></tbody></table>',
    signerContactId: made.contact,
    sender: { firstName: 'Live', lastName: 'Test', email: 'live-test@example.com', company: 'Protex AI Limited' },
  });
  let quoteId = '';
  if (templateId)
    await step('create the order form quote (template, line items, e-signature)', async () => {
      const b = await fn(quoteParams());
      quoteId = b.quote.id;
      made.quotes.add(quoteId);
      const q = await api('GET', `/crm/v3/objects/quotes/${quoteId}?properties=hs_esign_enabled,hs_terms,hs_comments,hs_status`);
      const lines = await api('GET', `/crm/v4/objects/quotes/${quoteId}/associations/line_items`);
      return `quote ${quoteId}: status ${q.properties.hs_status}, e-sign ${q.properties.hs_esign_enabled}, ${lines.results?.length ?? 0} line item(s), tables kept in terms: ${/<table/.test(q.properties.hs_terms || '') ? 'yes' : 'NO'}`;
    });
  if (quoteId)
    await step('replace the draft quote', async () => {
      const b = await fn({ ...quoteParams(), replaceQuoteId: quoteId });
      made.quotes.delete(quoteId);
      made.quotes.add(b.quote.id);
      return `new quote ${b.quote.id}, title "${b.quote.title}"`;
    });
  await step('request approval (creates a HubSpot task)', async () => {
    const owners = await api('GET', '/crm/v3/owners/?limit=1');
    const owner = owners.results?.[0];
    if (!owner) throw new Error('no HubSpot owners readable (crm.objects.owners.read)');
    const b = await fn({
      action: 'request_approval',
      dealId: made.deal,
      request: { fingerprint: 'live-test', reasons: [{ key: 'payment:net_60', label: 'Payment terms: Net 60 (live test)', role: 'finance' }], approvers: { finance: { id: '', email: owner.email, name: 'Live test approver' } } },
      requestedBy: 'live-test',
    });
    if (b.warning) throw new Error(b.warning);
    const rec = JSON.parse(b.properties.of_approval);
    if (rec.roles.finance.taskId) made.tasks.add(rec.roles.finance.taskId);
    return `task ${rec.roles.finance.taskId} assigned to ${owner.email}`;
  });
  await step('sweep (signed-deal sync)', async () => `${(await fn({ action: 'sweep' })).checked} deal(s) checked`);
}

if (!KEEP) {
  console.log('\nCleaning up');
  for (const id of made.quotes) await api('DELETE', `/crm/v3/objects/quotes/${id}`).catch((e) => console.log(`  couldn't delete quote ${id}: ${e.message}`));
  for (const id of made.tasks) await api('DELETE', `/crm/v3/objects/tasks/${id}`).catch((e) => console.log(`  couldn't delete task ${id}: ${e.message}`));
  if (made.deal) {
    const lines = await api('GET', `/crm/v4/objects/deals/${made.deal}/associations/line_items`).catch(() => ({ results: [] }));
    for (const l of lines.results || []) await api('DELETE', `/crm/v3/objects/line_items/${l.toObjectId}`).catch(() => {});
    await api('DELETE', `/crm/v3/objects/deals/${made.deal}`).catch((e) => console.log(`  couldn't delete deal: ${e.message}`));
  }
  if (made.contact) await api('DELETE', `/crm/v3/objects/contacts/${made.contact}`).catch(() => {});
  console.log('  done');
} else console.log(`\nKept: deal ${made.deal}, contact ${made.contact}, quotes ${[...made.quotes].join(', ')}`);

console.log(failed ? `\n${failed} step(s) failed. Send the FAIL lines back.` : '\nEverything passed against your real HubSpot.');
process.exit(failed ? 1 : 0);
