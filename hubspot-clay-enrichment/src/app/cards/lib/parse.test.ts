import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysSince,
  firstNumber,
  firstSentence,
  formatCompact,
  hostname,
  isNone,
  isNotFound,
  isNumbered,
  isTaggable,
  ownershipType,
  parseFitScore,
  parseKeyValues,
  parseSiteCount,
  parseSources,
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

test('hostname', () => {
  assert.equal(hostname('https://www.acme.co.uk/about'), 'acme.co.uk');
  assert.equal(hostname('acme.com'), 'acme.com');
});

test('parseFitScore reads Clay Fit_Score', () => {
  assert.deepEqual(parseFitScore('8 — 47 sites, published TRIR, existing camera estate, EHS function at group level.'), {
    score: 8,
    reason: '47 sites, published TRIR, existing camera estate, EHS function at group level.',
  });
  assert.deepEqual(parseFitScore('7/10: strong camera estate'), { score: 7, reason: 'strong camera estate' });
  assert.deepEqual(parseFitScore('6'), { score: 6, reason: '' });
  assert.equal(parseFitScore('High fit'), null);
});

test('parseSiteCount reads Clay Site_Count', () => {
  const a = parseSiteCount("47 — Item 2 Properties in FY25 10-K lists 41 DCs and 6 plants. High.");
  assert.equal(a.count, 47);
  assert.equal(a.label, '47');
  assert.equal(a.confidence, 'High');
  assert.equal(a.detail, 'Item 2 Properties in FY25 10-K lists 41 DCs and 6 plants. High.');
  const b = parseSiteCount('30-40 — no precise count published; estimated from the locations page. Low confidence.');
  assert.equal(b.label, '30–40');
  assert.equal(b.confidence, 'Low');
  assert.equal(parseSiteCount('').label, '');
});

test('numbered lists, inline or one per line', () => {
  const inline = '1. Existing CCTV at all DCs maps to forklift detection. 2. Agency labour maps to behaviour analytics. 3. TRIR of 1.8 gives a baseline.';
  assert.ok(isNumbered(inline));
  assert.deepEqual(splitItems(inline).length, 3);
  assert.ok(splitItems(inline)[2].startsWith('TRIR of 1.8'));
  assert.ok(isNumbered('1) One\n2) Two'));
  assert.ok(!isNumbered('Plain sentence with TRIR 1.8 in it.'));
});

test('parseSources pulls URLs and notes', () => {
  const s = parseSources('[1] example.com/sustainability-2025 — TRIR 1.8, ISO 45001 across all sites, 2025. [2] https://www.example.com/careers — EHS job titles, 2026.');
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { label: 'example.com/sustainability-2025', url: 'https://example.com/sustainability-2025', note: 'TRIR 1.8, ISO 45001 across all sites, 2025.' });
  assert.equal(s[1].url, 'https://www.example.com/careers');
  assert.equal(s[1].label, 'example.com/careers');
});

test('isNotFound', () => {
  assert.ok(isNotFound('Not found'));
  assert.ok(isNotFound('Not found. They publish no safety data.'));
  assert.ok(!isNotFound('TRIR 1.8 (2024)'));
});
