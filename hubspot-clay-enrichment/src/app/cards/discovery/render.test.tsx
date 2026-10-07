// Renders the Discovery card with HubSpot's test renderer, using the real
// Siemens call assessment (6 Oct) as the deal's data. Run with `npm run test:render`.
import React from 'react';
import assert from 'node:assert/strict';
import { createRenderer } from '@hubspot/ui-extensions/testing';
import { Alert, Heading, Link, LoadingButton, StatusTag, Tag, Text, TextArea, Tile, ToggleGroup } from '@hubspot/ui-extensions';
import { Discovery } from '../Discovery.tsx';
import siemens from './fixtures/siemens_writes.json';

// hubspot.serverless() calls the platform's worker global; record what the card sends.
const calls: { name: string; parameters: Record<string, unknown> }[] = [];
const g = globalThis as Record<string, unknown>;
g.self ??= globalThis; // the extension worker's global, which hubspot.serverless() reads
g.serverless = async (name: string, opts: { parameters: Record<string, unknown> }) => {
  calls.push({ name, parameters: opts.parameters });
  return { statusCode: 200, body: { ok: true, properties: { da_load_status: 'answered' } } };
};

async function renderWith(props: Record<string, string>) {
  const r = createRenderer('crm.record.tab');
  r.mocks.actions.fetchCrmObjectProperties.willCall(async () => props);
  r.mocks.actions.onCrmPropertiesUpdate.willCall(() => {});
  r.mocks.actions.refreshObjectProperties.willCall(() => {});
  r.render(<Discovery actions={r.mocks.actions as never} dealId="123" user="rep@protex.ai" />);
  await r.waitFor(() => assert.ok(r.maybeFind(Text)));
  return r;
}
const texts = (r: Awaited<ReturnType<typeof renderWith>>) => r.findAll(Text).map((t) => t.text);

// The Siemens test from the mock: Discovery stage, Manufacturing.
const deal = { pipeline: 'default', dealstage: '54122954', da_industry: 'manufacturing', num_associated_contacts: '1', ...(siemens as Record<string, string>) };
const r = await renderWith(deal);

assert.ok(texts(r).includes('Discovery 29%'), 'discovery health matches the mock');
assert.ok(texts(r).includes('Close 0/100'));
assert.equal(r.findAll(StatusTag)[0].text, 'Low');
assert.equal(r.find(Heading).text, 'Still to find out for Discovery (13)', 'gap count matches the mock');
assert.ok(r.findAll(Link).some((l) => l.text === 'Dylan and Jeff connect on Protex'), 'last call links to Avoma');
console.log('Siemens deal: 29%, 0/100 Low, 13 to find out — matches the mock');


// Open "How much can their team actually act on?" from Everything we know.
const load = r.findAll(Link).find((l) => l.text === 'How much can their team actually act on?');
assert.ok(load, 'question link');
load!.trigger('onClick');
await r.waitFor(() => assert.equal(r.find(Heading).text, 'How much can their team actually act on?'));
assert.equal(r.findAll(StatusTag)[0].text, 'Touched on');
assert.ok(r.findAll(Tile).length >= 2, 'quote tile and ask tile');
assert.ok(texts(r).some((t) => t.startsWith('“as simple as it can be for an EHS manager')), 'buyer quote shows');
assert.ok(texts(r).some((t) => t.startsWith('Already have:') && t.includes('Who acts, and when in the week')));
console.log('question view shows the quote, what is missing and what we already have');

// Correct the level: needs a level change and a reason, then calls save_discovery.
const save = r.find(LoadingButton);
assert.equal(save.props.disabled, true, 'save is disabled until something changes');
r.findAll(ToggleGroup).find((t) => t.props.name === 'level')!.trigger('onChange', 'answered' as never);
r.find(TextArea).trigger('onChange', 'Confirmed in an email from the plant manager, 8 Oct' as never);
await r.waitFor(() => assert.equal(r.find(LoadingButton).props.disabled, false));
r.find(LoadingButton).trigger('onClick');
await r.waitFor(() => assert.equal(calls.length, 1));
assert.equal(calls[0].name, 'save_discovery');
assert.deepEqual(calls[0].parameters, {
  dealId: '123',
  user: 'rep@protex.ai',
  override: { key: 'load', level: 'answered', note: 'Confirmed in an email from the plant manager, 8 Oct' },
});
console.log('Save correction calls save_discovery with the override');

// Back to the list.
r.findAll(Link).find((l) => l.text === '← Back')!.trigger('onClick');
await r.waitFor(() => assert.ok(r.find(Heading).text.startsWith('Still to find out')));

// No industry yet: the card asks for it, and saving it calls the function.
const fresh = await renderWith({ pipeline: 'default', dealstage: '54122954' });
const ind = fresh.findAll(ToggleGroup).find((t) => t.props.name === 'da_industry');
assert.ok(ind, 'industry picker shows');
ind!.trigger('onChange', 'logistics' as never);
await fresh.waitFor(() => assert.equal(calls.length, 2));
assert.deepEqual(calls[1].parameters, { dealId: '123', user: 'rep@protex.ai', properties: { da_industry: 'logistics' } });
assert.ok(texts(fresh).some((t) => t.startsWith('No calls assessed yet')));
console.log('new deal asks for the industry and shows no calls yet');

// Expansion deals get one line; an unresolved blocker shows At risk.
const other = await renderWith({ pipeline: '25788392', dealstage: '80167154' });
assert.equal(other.find(Text).text, 'The discovery assessment is for new-business deals.');
const risk = await renderWith({ ...deal, da_stop_unresolved: 'true' });
assert.ok(risk.findAll(Alert).some((a) => a.props.title === 'At risk'));
assert.ok(risk.findAll(Tag).length >= 2);
console.log('expansion deal and At risk behave');
console.log('ok');
