import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorityVariant, contactCoverage, currencyVariant, fullName, isContactEnriched, leadTag, resolveContact } from './shared.ts';

test('resolveContact uses either LinkedIn property', () => {
  assert.equal(resolveContact({ linkedin_url: 'linkedin.com/in/x' }).linkedin, 'linkedin.com/in/x');
  assert.equal(resolveContact({ hs_linkedin_url: 'a', linkedin_url: 'b' }).linkedin, 'a');
});

test('enrichment and coverage count only the 16 Clay fields', () => {
  const name = resolveContact({ firstname: 'Sam', lastname: 'Lee', jobtitle: 'COO' });
  assert.equal(isContactEnriched(name), false);
  assert.equal(fullName(name), 'Sam Lee');
  const some = resolveContact({ clay_contact_brief: 'x', clay_contact_paths_in: 'y' });
  assert.equal(isContactEnriched(some), true);
  assert.deepEqual(contactCoverage(some), { filled: 2, total: 16 });
});

test('leadTag takes the short lead of a Clay answer', () => {
  assert.equal(leadTag('Champion — runs the safety programme and has the ear of the COO.'), 'Champion');
  assert.equal(leadTag('Economic buyer: signs off capex above £250k.'), 'Economic buyer');
  assert.equal(leadTag('Likely an influencer. She shapes the shortlist but does not sign.'), 'Likely an influencer');
  assert.ok(leadTag('A very long first sentence that goes on and on without any dash or colon at all to split on.').endsWith('…'));
  assert.equal(leadTag(''), '');
});

test('tag colours', () => {
  assert.equal(currencyVariant('Current — LinkedIn updated last month'), 'success');
  assert.equal(currencyVariant('Possibly outdated: last post 2023'), 'warning');
  assert.equal(authorityVariant('Budget holder — signs off site capex'), 'success');
  assert.equal(authorityVariant('Influencer — recommends, does not sign'), 'warning');
  assert.equal(authorityVariant('None — individual contributor'), 'default');
});
