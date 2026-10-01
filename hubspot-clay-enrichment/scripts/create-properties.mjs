#!/usr/bin/env node
// Creates the "Clay enrichment" company property group and every property the
// cards read. Safe to re-run: anything that already exists is skipped.
//
//   HUBSPOT_TOKEN=pat-xxx node scripts/create-properties.mjs
//
// The token needs the crm.schemas.companies.write scope. Internal names must
// match src/app/extensions/lib/config.ts.

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Set HUBSPOT_TOKEN to a private app access token with crm.schemas.companies.write.');
  process.exit(1);
}

const API = 'https://api.hubapi.com/crm/v3/properties/companies';
const GROUP = 'clay_enrichment';

const text = (name, label, description) => ({ name, label, description, type: 'string', fieldType: 'textarea' });
const line = (name, label, description) => ({ name, label, description, type: 'string', fieldType: 'text' });

const PROPERTIES = [
  text('clay_what_they_do', 'What they do', 'Plain-English summary of the business.'),
  text('clay_site_footprint', 'Site footprint', 'Number and spread of sites. Start with the count, e.g. "42 sites across UK & Ireland".'),
  text('clay_typical_site_profile', 'Typical site profile', 'What a typical site looks like: size, type, operations.'),
  text('clay_ownership_structure', 'Ownership & structure', 'Public / PE-backed / family-owned, parent company, divisions.'),
  text('clay_workforce', 'Workforce', 'Headcount mix, shift patterns, agency labour, unions.'),
  text('clay_safety_metrics', 'Safety metrics', 'Reported incidents, TRIR/LTIFR, regulator actions.'),
  text('clay_hazard_profile', 'Hazard profile', 'Key hazards, one per line or separated by semicolons.'),
  text('clay_technology_signals', 'Technology signals', 'Relevant tech in use (CCTV, WMS, EHS software), one per line or separated by semicolons.'),
  text('clay_why_protex', 'Why Protex', 'Why Protex fits this account. Bullet points work best.'),
  text('clay_land_first_site', 'Land first site', 'Recommended first site and why.'),
  text('clay_buying_centre', 'Buying centre', 'Use "Role: Name / title" lines, e.g. "Economic buyer: COO".'),
  text('clay_disqualifiers', 'Disqualifiers', 'Red flags that rule the account out. Write "None identified" if clean.'),
  text('clay_opening_angle', 'Opening angle', 'Suggested opener for the first call or email.'),
  { name: 'clay_protex_fit_score', label: 'Protex fit score', description: 'Optional 0-100 fit score.', type: 'number', fieldType: 'number' },
  { name: 'clay_last_enriched', label: 'Last enriched (Clay)', description: 'Date Clay last updated this record.', type: 'date', fieldType: 'date' },
  // Fallbacks, used only when the native HubSpot property is empty.
  line('clay_company_name', 'Company name (Clay)', 'Fallback for the native Company name.'),
  line('clay_website', 'Website (Clay)', 'Fallback for the native Website URL.'),
  line('clay_linkedin_url', 'LinkedIn URL (Clay)', 'Fallback for the native LinkedIn company page.'),
  { name: 'clay_employee_count', label: 'Employee count (Clay)', description: 'Fallback for the native Number of employees.', type: 'number', fieldType: 'number' },
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

const groupResult = await post(`${API}/groups`, { name: GROUP, label: 'Clay enrichment', displayOrder: -1 });
console.log(`group ${GROUP}: ${groupResult}`);

let failed = 0;
for (const [i, prop] of PROPERTIES.entries()) {
  try {
    const result = await post(API, { ...prop, groupName: GROUP, displayOrder: i });
    console.log(`${prop.name}: ${result}`);
  } catch (e) {
    failed++;
    console.error(`${prop.name}: FAILED ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
