// Renders the Discovery card with HubSpot's test renderer and a sample deal,
// to catch runtime errors before uploading. Run with `npm run test:render`.
import React from 'react';
import assert from 'node:assert/strict';
import { createRenderer } from '@hubspot/ui-extensions/testing';
import { Accordion, Alert, Button, Heading, ScoreCircle, StatusTag, Tab, Text } from '@hubspot/ui-extensions';
import { CrmPropertyList } from '@hubspot/ui-extensions/crm';
import { Discovery } from '../Discovery.tsx';
import { QUESTIONS, STATUS_OPTIONS, WHO_DETAIL_VALUES } from './data.ts';

const LEVELS = [2, 2, 1, 1, 1, 0, 0, 2, 2, 1, 2, 1, 1, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 2, 1, 2, 1, 1, 1, 0, 0, 2, 2, 0, 2, 2];

async function renderWith(props: Record<string, string>) {
  const renderer = createRenderer('crm.record.tab');
  renderer.mocks.actions.fetchCrmObjectProperties.willCall(async () => props);
  renderer.mocks.actions.onCrmPropertiesUpdate.willCall(() => {});
  renderer.render(<Discovery actions={renderer.mocks.actions as never} />);
  await renderer.waitFor(() => assert.ok(renderer.maybeFind(ScoreCircle) || renderer.maybeFind(Text)));
  return renderer;
}

const example: Record<string, string> = {
  dealname: 'Sample deal',
  pipeline: 'default',
  dealstage: 'qualifiedtobuy',
  da_industry: 'manufacturing',
  num_associated_contacts: '4',
  da_who_details: WHO_DETAIL_VALUES.vp,
  da_sites_details: QUESTIONS[0].details.slice(0, 2).map((d) => d.value).join(';'),
};
QUESTIONS.forEach((q, i) => {
  if (q.statusProperty) example[q.statusProperty] = STATUS_OPTIONS[LEVELS[i]].value;
});

const r = await renderWith(example);
const score = r.find(ScoreCircle);
assert.equal(score.props.score, 85);
const tabs = r.findAll(Tab).filter((t) => ['next', 'all', 'who', 'close'].includes(String(t.props.tabId))).map((t) => t.props.title);
assert.deepEqual(tabs, ['Up next (6)', 'All questions', 'By who to ask', 'Close signals']);
assert.ok(r.findAll(Accordion).length >= 9, 'topic and persona accordions render');
const openButtons = r.findAll(Button).filter((b) => b.props.size === 'xs');
assert.ok(openButtons.length > 36, `question buttons render (${openButtons.length})`);
assert.equal(r.findAll(CrmPropertyList).length, 0, 'no question forms until a question is opened');

// Open the first "Up next" question: the list is replaced by its detail.
openButtons[0].trigger('onClick');
await r.waitFor(() => assert.ok(r.findAll(CrmPropertyList).length === 1));
const form = r.find(CrmPropertyList);
assert.ok(r.findAll(Heading).length >= 2, 'question heading shows');
assert.ok(form.props.properties.length >= 4, 'status, notes, source and details are editable');
assert.equal(r.findAll(Tab).filter((t) => t.props.tabId === 'next').length, 0, 'list is hidden while a question is open');
const firstForm = form.props.properties.join(',');
const next = r.findAll(Button).find((b) => b.props.variant === 'primary' && b.props.size === 'sm');
assert.ok(next, 'Next button');
next!.trigger('onClick');
await r.waitFor(() => assert.notEqual(r.find(CrmPropertyList).props.properties.join(','), firstForm));
console.log('opened', firstForm.split(',')[0], 'then Next →', r.find(CrmPropertyList).props.properties[0]);
const back = r.findAll(Button).find((b) => b.props.variant === 'transparent');
back!.trigger('onClick');
await r.waitFor(() => assert.equal(r.findAll(CrmPropertyList).length, 0));
console.log('back to the list');
assert.ok(r.findAll(StatusTag).length > 36);
console.log('example deal renders: 85% health, 6 up next,', openButtons.length, 'question buttons');

const empty = await renderWith({ pipeline: 'default', dealstage: '54122954' });
assert.equal(empty.find(ScoreCircle).props.score, 0);
assert.ok(empty.findAll(Alert).some((a) => a.props.title === 'Pick the industry'));
console.log('empty deal renders with the industry prompt');

const other = await renderWith({ pipeline: '25788392', dealstage: '80167154' });
assert.equal(other.maybeFind(ScoreCircle), null);
console.log('expansion deal shows the one-line note');

const risk = await renderWith({ ...example, da_stop_unresolved: 'true' });
assert.ok(risk.findAll(Alert).some((a) => String(a.props.title).startsWith('At risk')));
console.log('unresolved blocker shows At risk');
console.log('ok');
