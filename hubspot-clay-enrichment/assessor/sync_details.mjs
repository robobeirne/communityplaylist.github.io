#!/usr/bin/env node
/**
 * Makes rubric.json's checklists match the HubSpot deal properties exactly.
 *
 * The assessor writes ticks straight into each question's "details captured"
 * property, so every value it can tick must be an option on that property.
 * This copies the options from ../scripts/deal-properties.json (generated from
 * the sheet) into rubric.json. Run it after build_rubric.py or after
 * regenerating the deal properties:
 *
 *   node assessor/sync_details.mjs
 */
import fs from 'node:fs';

const rubricUrl = new URL('./rubric.json', import.meta.url);
const rubric = JSON.parse(fs.readFileSync(rubricUrl, 'utf8'));
const props = JSON.parse(fs.readFileSync(new URL('../scripts/deal-properties.json', import.meta.url), 'utf8'));
const byName = new Map(props.map((p) => [p.name, p]));

let changed = 0;
const problems = [];
for (const q of rubric.questions) {
  for (const key of ['status', 'notes', 'source', 'details']) {
    if (q.hubspot?.[key] && !byName.has(q.hubspot[key])) problems.push(`${q.id}: ${q.hubspot[key]} is not a deal property`);
  }
  const prop = byName.get(q.hubspot?.details);
  if (!prop?.options) continue;
  const details = prop.options.map((o) => {
    const ind = o.label.match(/^\[(L|M|R)\]/)?.[1];
    return { value: o.value, label: o.label, ...(ind ? { industry: ind } : {}) };
  });
  if (JSON.stringify(details) !== JSON.stringify(q.details)) {
    const before = new Set((q.details ?? []).map((d) => d.value));
    const after = new Set(details.map((d) => d.value));
    console.log(`${q.id}: -${[...before].filter((v) => !after.has(v)).length} +${[...after].filter((v) => !before.has(v)).length}`);
    q.details = details;
    changed++;
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
fs.writeFileSync(rubricUrl, JSON.stringify(rubric, null, 1) + '\n');
console.log(changed ? `Updated ${changed} checklist(s) in rubric.json.` : 'rubric.json already matches the deal properties.');
