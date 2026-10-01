#!/usr/bin/env node
// Creates the "Clay enrichment" company property group and every property the
// cards read. Safe to re-run: anything that already exists is skipped.
//
//   HUBSPOT_TOKEN=pat-xxx node scripts/create-properties.mjs
//
// The token needs the crm.schemas.companies.write scope. Internal names must
// match src/app/cards/lib/config.ts.

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Set HUBSPOT_TOKEN to a private app access token with crm.schemas.companies.write.');
  process.exit(1);
}

const API = 'https://api.hubapi.com/crm/v3/properties/companies';
const GROUP = 'clay_enrichment';

const text = (name, label, description) => ({ name, label, description, type: 'string', fieldType: 'textarea' });
const line = (name, label, description) => ({ name, label, description, type: 'string', fieldType: 'text' });

// Every Clay field is a string, so each one is a "Multi-line text" property in
// HubSpot. Order matches the Clay JSON schema.
const PROPERTIES = [
  text('clay_account_brief', 'Account brief', 'Clay: result. The full 300-450 word account brief. Read this first.'),
  text('clay_what_they_do', 'What they do', 'Clay: What_They_Do. The physical operation, sector and sub-sector.'),
  text('clay_site_count', 'Site count', 'Clay: Site_Count. Count, how it was reached and confidence (high/medium/low).'),
  text('clay_site_footprint', 'Site footprint', 'Clay: Site_Footprint. Sites by type and region, total square footage.'),
  text('clay_typical_site_profile', 'Typical site profile', 'Clay: Typical_Site_Profile. Size, headcount, shifts, automation, equipment.'),
  text('clay_operating_model', 'Operating model', 'Clay: Operating_Model. Own/3PL/franchise, central vs site, org above site level.'),
  text('clay_ownership_structure', 'Ownership & structure', 'Clay: Ownership_And_Structure. Public/private/PE/family/subsidiary and owner.'),
  text('clay_workforce', 'Workforce', 'Clay: Workforce. Headcount, frontline share, unions and works councils.'),
  text('clay_safety_posture', 'Safety posture', 'Clay: Safety_Posture. EHS function, commitments, certifications, regulator.'),
  text('clay_safety_metrics', 'Safety metrics', 'Clay: Safety_Metrics. TRIR, LTIFR etc. with year and trend, or "Not found".'),
  text('clay_hazard_profile', 'Hazard profile', 'Clay: Hazard_Profile. Physical risks in their operation.'),
  text('clay_technology_signals', 'Technology signals', 'Clay: Technology_Signals. Cameras, core systems, digital programmes, IT posture.'),
  text('clay_why_protex', 'Why Protex', 'Clay: Why_Protex. 3-5 numbered points.'),
  text('clay_land_first', 'Land first', 'Clay: Land_First. Which sites to target first and why.'),
  text('clay_buying_centre', 'Buying centre', 'Clay: Buying_Centre. Owning function, central vs site, real job titles.'),
  text('clay_fit_score', 'Fit score', 'Clay: Fit_Score. Integer 1-10 then one sentence of reasoning.'),
  text('clay_disqualifiers', 'Disqualifiers', 'Clay: Disqualifiers. Friction and reasons it may not work, or "None identified".'),
  text('clay_opening_angle', 'Opening angle', 'Clay: Opening_Angle. 2-3 sentences a rep could say on a first call.'),
  text('clay_sources', 'Sources', 'Clay: Sources. Numbered list of URLs with what each provided and its date.'),
  { name: 'clay_last_enriched', label: 'Last enriched (Clay)', description: 'Optional. Date Clay last updated this record.', type: 'date', fieldType: 'date' },
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
