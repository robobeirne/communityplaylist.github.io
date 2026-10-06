#!/usr/bin/env node
// Creates the "Clay contact profile" group and the contact properties the
// Profile summary and Before you reach out cards read. Safe to re-run:
// anything that already exists is skipped.
//
//   HUBSPOT_TOKEN=pat-xxx node scripts/create-contact-properties.mjs
//
// The token needs the crm.schemas.contacts.write scope. Internal names must
// match src/app/cards/contact/config.ts.

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Set HUBSPOT_TOKEN to a private app access token with crm.schemas.contacts.write.');
  process.exit(1);
}

const API = 'https://api.hubapi.com/crm/v3/properties/contacts';
const GROUP = 'clay_contact_profile';

// Every Clay field is a string, so each is a "Multi-line text" property.
const text = (name, label, description) => ({ name, label, description, type: 'string', fieldType: 'textarea' });

// Order matches the Clay output.
const PROPERTIES = [
  text('clay_contact_current_role', 'Current role', 'Clay: Current Role.'),
  text('clay_contact_career_history', 'Career history', 'Clay: Career History.'),
  text('clay_contact_background_credentials', 'Background and credentials', 'Clay: Background and Credentials.'),
  text('clay_contact_profile_currency', 'Profile currency', 'Clay: Profile Currency. How current the public profile is.'),
  text('clay_contact_scope_remit', 'Scope and remit', 'Clay: Scope and Remit.'),
  text('clay_contact_reporting_line', 'Reporting line', 'Clay: Reporting Line.'),
  text('clay_contact_public_voice', 'Public voice', 'Clay: Public Voice.'),
  text('clay_contact_stated_priorities', 'Stated priorities', 'Clay: Stated Priorities.'),
  text('clay_contact_technology_posture', 'Posture on technology', 'Clay: Posture on Technology.'),
  text('clay_contact_likely_deal_role', 'Likely deal role', 'Clay: Likely Deal Role. Start with the role, e.g. "Champion — ...".'),
  text('clay_contact_buying_authority', 'Buying authority', 'Clay: Buying Authority. Start with the level, e.g. "Influencer — ...".'),
  text('clay_contact_personalisation_hooks', 'Personalisation hooks', 'Clay: Personalisation Hooks.'),
  text('clay_contact_approach_notes', 'Approach notes', 'Clay: Approach Notes.'),
  text('clay_contact_paths_in', 'Paths in', 'Clay: Paths In.'),
  text('clay_contact_footprint_assessment', 'Footprint assessment', 'Clay: Footprint Assessment.'),
  text('clay_contact_brief', 'Profile brief', 'Clay: result. The 250-350 word narrative brief. Read this first.'),
  { name: 'clay_contact_last_enriched', label: 'Last enriched (Clay)', description: 'Optional. Date Clay last updated this contact.', type: 'date', fieldType: 'date' },
];

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409) return 'exists';
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return 'created';
}

console.log(`group ${GROUP}: ${await post(`${API}/groups`, { name: GROUP, label: 'Clay contact profile', displayOrder: -1 })}`);

let failed = 0;
for (const [i, prop] of PROPERTIES.entries()) {
  try {
    console.log(`${prop.name}: ${await post(API, { ...prop, groupName: GROUP, displayOrder: i })}`);
  } catch (e) {
    failed++;
    console.error(`${prop.name}: FAILED ${e.message}`);
  }
}
console.log(failed ? `${failed} failed` : `Done: ${PROPERTIES.length} properties checked.`);
process.exit(failed ? 1 : 0);
