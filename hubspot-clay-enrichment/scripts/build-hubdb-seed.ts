// Regenerates scripts/hubdb-seed.json (what the HubDB setup script loads) from the defaults in
// src/app/cards/orderform/settings.ts:
//   node --experimental-strip-types scripts/build-hubdb-seed.ts
import { writeFileSync } from 'node:fs';
import { DEFAULT_LIBRARY, DEFAULT_RULES } from '../src/app/cards/orderform/settings.ts';

const seed = {
  rules: Object.entries(DEFAULT_RULES).map(([key, value]) => ({ key, value })),
  terms: DEFAULT_LIBRARY.map(({ id, ...rest }) => ({ clause_id: id, enabled: true, version: 1, ...rest })),
};
writeFileSync(new URL('./hubdb-seed.json', import.meta.url), JSON.stringify(seed, null, 2) + '\n');
console.log(`${seed.rules.length} rules, ${seed.terms.length} clauses`);
