#!/usr/bin/env node
// Creates the two HubDB tables the order form card reads its settings from, and fills them with the
// default rules and Terms library (scripts/hubdb-seed.json). Safe to re-run: existing tables and
// rows are kept, only missing ones are added, and the tables are published at the end.
//
//   HUBSPOT_TOKEN=... node scripts/create-hubdb-tables.mjs
//
// The token needs the HubDB scopes hubdb.tables.read and hubdb.tables.write.

import { readFileSync } from 'node:fs';

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Set HUBSPOT_TOKEN to a service key with the hubdb.tables.read and hubdb.tables.write scopes.');
  process.exit(1);
}
const API = 'https://api.hubapi.com/cms/v3/hubdb/tables';
const seed = JSON.parse(readFileSync(new URL('./hubdb-seed.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 429 && attempt < 5) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, json };
  }
}

const T = (name, label) => ({ name, label, type: 'TEXT' });
const TABLES = [
  {
    name: 'order_form_rules',
    label: 'Order form rules',
    key: 'key',
    columns: [T('key', 'Key'), T('value', 'Value'), T('updated_by', 'Updated by'), T('updated_at', 'Updated at')],
    rows: seed.rules,
  },
  {
    name: 'order_form_terms',
    label: 'Order form terms library',
    key: 'clause_id',
    columns: [
      T('clause_id', 'Clause ID'),
      T('kind', 'Kind'),
      { name: 'section', label: 'Section', type: 'NUMBER' },
      { name: 'position', label: 'Position', type: 'NUMBER' },
      T('condition', 'Condition'),
      T('title', 'Title'),
      T('summary', 'Summary'),
      T('body', 'Wording'),
      T('input_kind', 'Blank type'),
      T('input_label', 'Blank label'),
      T('input_options', 'Blank options'),
      T('role', 'Approver type'),
      T('order_types', 'Order types'),
      { name: 'enabled', label: 'Enabled', type: 'BOOLEAN' },
      { name: 'version', label: 'Version', type: 'NUMBER' },
      T('updated_by', 'Updated by'),
      T('updated_at', 'Updated at'),
    ],
    rows: seed.terms,
  },
];

let failed = 0;
for (const t of TABLES) {
  let res = await call('GET', `${API}/${t.name}/draft`);
  if (res.status === 404) {
    res = await call('POST', API, { name: t.name, label: t.label, useForPages: false, allowPublicApiAccess: false, columns: t.columns });
    if (!res.ok) {
      console.error(`${t.name}: FAILED to create (${res.status} ${JSON.stringify(res.json)})`);
      failed++;
      continue;
    }
    console.log(`${t.name}: created`);
  } else if (!res.ok) {
    console.error(`${t.name}: FAILED (${res.status} ${JSON.stringify(res.json)})`);
    failed++;
    continue;
  } else console.log(`${t.name}: exists`);

  const existing = await call('GET', `${API}/${t.name}/rows/draft?limit=1000`);
  const have = new Set((existing.json.results || []).map((r) => String(r.values?.[t.key] ?? '')));
  let added = 0;
  for (const row of t.rows) {
    if (have.has(String(row[t.key]))) continue;
    const values = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined && v !== ''));
    const r = await call('POST', `${API}/${t.name}/rows`, { values });
    if (!r.ok) {
      console.error(`${t.name} ${row[t.key]}: FAILED (${r.status} ${JSON.stringify(r.json)})`);
      failed++;
    } else added++;
    await sleep(120);
  }
  const pub = await call('POST', `${API}/${t.name}/draft/publish`);
  console.log(`${t.name}: ${added} rows added, ${have.size} already there, ${pub.ok ? 'published' : `publish FAILED (${pub.status})`}`);
  if (!pub.ok) failed++;
}
console.log(failed ? `${failed} problems` : 'Done.');
process.exit(failed ? 1 : 0);
