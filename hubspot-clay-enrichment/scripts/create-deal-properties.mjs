#!/usr/bin/env node
// Creates the discovery assessment's deal properties and their "Discovery — …"
// groups, from scripts/deal-properties.json (generated from the sheet by
// scripts/build-discovery.py). Safe to re-run: anything that exists is skipped.
//
//   HUBSPOT_TOKEN=pat-xxx node scripts/create-deal-properties.mjs
//
// The token needs the crm.schemas.deals.write scope.

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
