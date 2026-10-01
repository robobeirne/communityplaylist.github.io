import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampScore,
  daysSince,
  firstNumber,
  firstSentence,
  formatCompact,
  hostname,
  isNone,
  isTaggable,
  ownershipType,
  parseKeyValues,
  resolveFields,
  splitItems,
} from './parse.ts';

test('resolveFields prefers native properties and falls back to Clay', () => {
  const d = resolveFields({ website: '', domain: 'acme.com', numberofemployees: null, clay_employee_count: '1,200' });
  assert.equal(d.website, 'acme.com');
  assert.equal(d.employeeCount, '1,200');
  assert.equal(d.openingAngle, '');
});

test('resolveFields treats n/a style values as empty', () => {
  assert.equal(resolveFields({ clay_workforce: 'N/A' }).workforce, '');
});

test('splitItems handles lines, bullets, semicolons and short comma lists', () => {
  assert.deepEqual(splitItems('- Forklifts\n- Racking\n\n• Loading docks'), ['Forklifts', 'Racking', 'Loading docks']);
  assert.deepEqual(splitItems('1. One\n2) Two'), ['One', 'Two']);
  assert.deepEqual(splitItems('SAP; Samsara | Cority'), ['SAP', 'Samsara', 'Cority']);
  assert.deepEqual(splitItems('CCTV, WMS, telematics'), ['CCTV', 'WMS', 'telematics']);
  assert.deepEqual(splitItems('They run warehouses, mostly in the UK.'), ['They run warehouses, mostly in the UK.']);
});

test('parseKeyValues needs every item to be "Label: value"', () => {
  assert.deepEqual(parseKeyValues('Economic buyer: COO\nChampion: Head of H&S'), [
    { label: 'Economic buyer', value: 'COO' },
    { label: 'Champion', value: 'Head of H&S' },
  ]);
  assert.equal(parseKeyValues('Economic buyer: COO\nAlso talk to IT'), null);
  assert.equal(parseKeyValues('Single: item'), null);
});

test('isNone recognises "no disqualifiers" phrasing', () => {
  for (const v of ['None', 'none identified', 'No disqualifiers found.', 'No red flags']) assert.ok(isNone(v), v);
  assert.ok(!isNone('Uses a competitor'));
});

test('isTaggable only for short items', () => {
  assert.ok(isTaggable(['Forklifts', 'Working at height']));
  assert.ok(!isTaggable(['A very long sentence that explains a hazard in a lot of detail here']));
});

test('firstNumber and formatCompact', () => {
  assert.equal(firstNumber('42 sites across the UK'), 42);
  assert.equal(firstNumber('approx 1.2k staff'), 1200);
  assert.equal(firstNumber('12,400'), 12400);
  assert.equal(firstNumber('no numbers'), null);
  assert.equal(formatCompact(950), '950');
  assert.equal(formatCompact(1200), '1.2K');
  assert.equal(formatCompact(12400), '12K');
  assert.equal(formatCompact(2_500_000), '2.5M');
});

test('ownershipType', () => {
  assert.equal(ownershipType('Backed by private equity firm KKR since 2021'), 'PE-backed');
  assert.equal(ownershipType('Listed on the LSE (ticker: XYZ)'), 'Public');
  assert.equal(ownershipType('Third-generation family business'), 'Family-owned');
  assert.equal(ownershipType('A subsidiary of Big Group plc'), 'Subsidiary');
  assert.equal(ownershipType('Privately held'), 'Private');
  assert.equal(ownershipType(''), null);
});

test('firstSentence truncates', () => {
  assert.equal(firstSentence('Makes boxes. Lots of them.'), 'Makes boxes.');
  assert.equal(firstSentence('x'.repeat(200), 10), 'xxxxxxxxx…');
});

test('daysSince accepts epoch millis and ISO dates', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');
  assert.equal(daysSince(String(Date.parse('2026-09-21T00:00:00Z')), now), 10);
  assert.equal(daysSince('2026-09-30', now), 1);
  assert.equal(daysSince('garbage', now), null);
});

test('hostname and clampScore', () => {
  assert.equal(hostname('https://www.acme.co.uk/about'), 'acme.co.uk');
  assert.equal(hostname('acme.com'), 'acme.com');
  assert.equal(clampScore('87'), 87);
  assert.equal(clampScore('140'), 100);
  assert.equal(clampScore(''), null);
});
