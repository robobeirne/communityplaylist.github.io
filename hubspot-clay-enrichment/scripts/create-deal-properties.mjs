#!/usr/bin/env node
// Creates the discovery assessment's deal properties and their "Discovery — …"
// groups, from scripts/deal-properties.json (generated from the sheet by
// scripts/build-discovery.py). Safe to re-run: anything that exists is skipped.
//
//   HUBSPOT_TOKEN=pat-xxx node scripts/create-deal-properties.mjs
//
// The token needs the crm.schemas.deals.write scope.
//
// To replace the options of properties that already exist (for example after
// fixing a checklist in the sheet), name them with --fix:
//
//   node scripts/create-deal-properties.mjs --fix da_who_details,da_sites_details,da_cameras_details

import { readFileSync } from 'node:fs';

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Set HUBSPOT_TOKEN to a private app access token with crm.schemas.deals.write.');
  process.exit(1);
}

const API = 'https://api.hubapi.com/crm/v3/properties/deals';
const PROPERTIES = JSON.parse(readFileSync(new URL('./deal-properties.json', import.meta.url), 'utf8'));

const groupName = (label) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 409) return 'exists';
    if (res.status === 429 && attempt < 5) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return 'created';
  }
}

const fixArg = process.argv.find((a) => a.startsWith('--fix'));
if (fixArg) {
  const names = (fixArg.includes('=') ? fixArg.split('=')[1] : process.argv[process.argv.indexOf(fixArg) + 1] ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  if (!names.length) {
    console.error('Name the properties to fix, e.g. --fix da_who_details,da_sites_details');
    process.exit(1);
  }
  let failedFix = 0;
  for (const name of names) {
    const p = PROPERTIES.find((x) => x.name === name);
    if (!p?.options) {
      console.error(`${name}: not a dropdown or checkbox property in deal-properties.json`);
      failedFix++;
      continue;
    }
    const res = await fetch(`${API}/${name}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ options: p.options.map((o, j) => ({ ...o, displayOrder: j })) }),
    });
    if (res.ok) console.log(`${name}: options replaced (${p.options.length})`);
    else {
      failedFix++;
      console.error(`${name}: FAILED ${res.status} ${await res.text()}`);
    }
  }
  process.exit(failedFix ? 1 : 0);
}

const groups = [...new Set(PROPERTIES.map((p) => p.groupLabel))];
for (const [i, label] of groups.entries()) {
  const result = await post(`${API}/groups`, { name: groupName(label), label, displayOrder: i });
  console.log(`group ${label}: ${result}`);
}

let failed = 0;
for (const [i, p] of PROPERTIES.entries()) {
  const body = {
    name: p.name,
    label: p.label,
    description: p.description,
    groupName: groupName(p.groupLabel),
    type: p.type,
    fieldType: p.fieldType,
    displayOrder: i,
    ...(p.options ? { options: p.options.map((o, j) => ({ ...o, displayOrder: j })) } : {}),
  };
  try {
    console.log(`${p.name}: ${await post(API, body)}`);
  } catch (e) {
    failed++;
    console.error(`${p.name}: FAILED ${e.message}`);
  }
  await sleep(120); // stay well under HubSpot's 110 requests per 10 seconds
}
console.log(failed ? `${failed} failed` : `Done: ${PROPERTIES.length} properties checked.`);
process.exit(failed ? 1 : 0);
