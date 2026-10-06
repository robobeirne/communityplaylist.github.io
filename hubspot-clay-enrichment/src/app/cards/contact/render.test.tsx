// Renders the two contact cards with HubSpot's test renderer and a sample contact.
import React from 'react';
import assert from 'node:assert/strict';
import { createRenderer } from '@hubspot/ui-extensions/testing';
import { Alert, Heading, Tab, Tag, Text } from '@hubspot/ui-extensions';
import { ContactProfile } from '../ContactProfile.tsx';
import { ContactPrep } from '../ContactPrep.tsx';

async function render(location: 'crm.record.tab' | 'crm.record.sidebar', el: (a: never) => React.ReactElement, props: Record<string, string>) {
  const r = createRenderer(location);
  r.mocks.actions.fetchCrmObjectProperties.willCall(async () => props);
  r.mocks.actions.onCrmPropertiesUpdate.willCall(() => {});
  r.render(el(r.mocks.actions as never));
  await r.waitFor(() => assert.ok(r.maybeFind(Text) || r.maybeFind(Tag)));
  return r;
}

const sample: Record<string, string> = {
  firstname: 'Sam',
  lastname: 'Lee',
  jobtitle: 'Group Head of Health & Safety',
  company: 'Northbridge Logistics',
  linkedin_url: 'linkedin.com/in/samlee',
  clay_contact_brief: 'Sam leads safety across 27 sites.\n\nThey report to the COO.',
  clay_contact_likely_deal_role: 'Champion — owns the safety programme.',
  clay_contact_buying_authority: 'Influencer — recommends; COO signs.',
  clay_contact_profile_currency: 'Current — profile updated last month.',
  clay_contact_approach_notes: 'Lead with near-miss data, not ROI.',
  clay_contact_personalisation_hooks: '- Spoke at IOSH 2026\n- Posted about forklift incidents\n- Ex-army',
  clay_contact_paths_in: 'Mutual connection: former colleague at DHL',
};

const tab = await render('crm.record.tab', (a) => <ContactProfile actions={a} />, sample);
assert.equal(tab.find(Heading).text, 'Sam Lee');
assert.deepEqual(tab.findAll(Tag).slice(0, 3).map((t) => t.text), ['Champion', 'Influencer', 'Current']);
assert.ok(tab.findAll(Alert).some((a) => a.props.title === 'How to approach them'));
assert.deepEqual(tab.findAll(Tab).map((t) => t.props.title), ['Brief', 'Role', 'Deal role', 'What they care about', 'Background', 'Reach out']);
console.log('profile tab renders');

const side = await render('crm.record.sidebar', (a) => <ContactPrep actions={a} />, sample);
assert.ok(side.findAll(Tag).length >= 3);
console.log('sidebar renders');

const empty = await render('crm.record.tab', (a) => <ContactProfile actions={a} />, { firstname: 'Pat' });
assert.equal(empty.find(Text).text, 'No Clay brief for this contact yet.');
console.log('unenriched contact shows one line');
console.log('ok');
