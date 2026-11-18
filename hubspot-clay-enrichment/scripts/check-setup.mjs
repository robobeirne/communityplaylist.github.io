#!/usr/bin/env node
// Checks that HubSpot has everything the order form card needs, and fixes what it can with --fix:
//   - every order form deal property (src/app/cards/orderform/properties.json)
//   - the HubDB settings tables (rules and Terms library) and their default rows
//   - the products the card adds automatically
//
//   HUBSPOT_TOKEN=... node scripts/check-setup.mjs          # report only
//   HUBSPOT_TOKEN=... node scripts/check-setup.mjs --fix    # also create what's missing
//
// The service key needs: crm.schemas.deals.write, hubdb.tables.read, hubdb.tables.write, e-commerce.
// The app's own permissions can't be checked from here: open a deal's Order form card and look at
// "System check" in Order form settings, and the version at the bottom of the card.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Set HUBSPOT_TOKEN first (read -s HUBSPOT_TOKEN; export HUBSPOT_TOKEN).');
  process.exit(1);
}
const FIX = process.argv.includes('--fix');
const here = (p) => new URL(p, import.meta.url);
const get = async (path) => {
  const res = await fetch(`https://api.hubapi.com${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return { status: res.status, ok: res.ok, json: await res.json().catch(() => ({})) };
};
const problems = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg, fix) => {
  console.log(`  ✗ ${msg}`);
  problems.push({ msg, fix });
};

console.log('Deal properties');
const wanted = JSON.parse(readFileSync(here('../src/app/cards/orderform/properties.json'), 'utf8')).map((p) => p.name);
const props = await get('/crm/v3/properties/deals');
if (!props.ok) bad(`Couldn't read deal properties (${props.status}: ${props.json.message ?? ''}). The key needs crm.schemas.deals.write.`);
else {
  const have = new Set((props.json.results || []).map((p) => p.name));
  const missing = wanted.filter((n) => !have.has(n));
  if (missing.length) bad(`${missing.length} missing: ${missing.join(', ')}`, 'properties');
  else ok(`all ${wanted.length} order form properties exist`);
}

console.log('HubDB settings tables');
const seed = JSON.parse(readFileSync(here('./hubdb-seed.json'), 'utf8'));
for (const [table, key, rows] of [
  ['order_form_rules', 'key', seed.rules],
  ['order_form_terms', 'clause_id', seed.terms],
]) {
  const t = await get(`/cms/v3/hubdb/tables/${table}`);
  if (t.status === 404) {
    bad(`${table} doesn't exist (or isn't published)`, 'hubdb');
    continue;
  }
  if (!t.ok) {
    bad(`Couldn't read ${table} (${t.status}: ${t.json.message ?? ''}). The key needs hubdb.tables.read.`);
    continue;
  }
  const r = await get(`/cms/v3/hubdb/tables/${table}/rows?limit=1000`);
  const have = new Set((r.json.results || []).map((x) => String(x.values?.[key] ?? '')));
  const missing = rows.map((x) => String(x[key])).filter((k) => !have.has(k));
  if (missing.length) bad(`${table}: ${missing.length} default rows missing (${missing.join(', ')})`, 'hubdb');
  else ok(`${table}: published, ${have.size} rows`);
}

console.log('Products');
const prods = await get('/crm/v3/objects/products?limit=100&properties=name,hs_status');
if (!prods.ok) bad(`Couldn't read products (${prods.status}). The key needs e-commerce.`);
else {
  const names = (prods.json.results || []).map((p) => String(p.properties?.name || ''));
  for (const want of ['Protex AI Licence - Intelligence (Free)', 'Deployment Services', 'Standard Support Services'])
    names.includes(want) ? ok(`"${want}" exists`) : bad(`"${want}" not found: new business deals won't get it added automatically`);
}

if (FIX && problems.some((p) => p.fix)) {
  console.log('\nFixing');
  const run = (script, args = []) => spawnSync(process.execPath, [new URL(script, import.meta.url).pathname, ...args], { stdio: 'inherit', env: process.env });
  if (problems.some((p) => p.fix === 'properties')) run('./create-deal-properties.mjs', [new URL('../src/app/cards/orderform/properties.json', import.meta.url).pathname]);
  if (problems.some((p) => p.fix === 'hubdb')) run('./create-hubdb-tables.mjs');
  console.log('\nRun this check again to confirm.');
} else if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}.${problems.some((p) => p.fix) ? ' Run again with --fix to create what is missing.' : ''}`);
  process.exit(1);
} else console.log('\nAll good.');
