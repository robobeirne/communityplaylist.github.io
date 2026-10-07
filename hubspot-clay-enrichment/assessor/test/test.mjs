import fs from 'node:fs';
import assert from 'node:assert/strict';
import { merge, emptyState, roleFromTitle } from '../merge.mjs';
const rubric = JSON.parse(fs.readFileSync('../rubric.json'));
const buyer = JSON.parse(fs.readFileSync('buyer_segments.json'));
const segments = Array.from({ length: 75 }, (_, i) => buyer[i] ? { speaker_email: 'dylan.devine@siemens.com', text: buyer[i] } : { speaker_email: 'jeff.sullivan@protex.ai', text: '(rep turn)' });
segments[34] = { speaker_email: 'jeff.sullivan@protex.ai', text: 'You hit the nail on the head, Dylan. The. Our cost model is based on the number of sites that you\'d roll out to and then the number of cameras at each site' };
const people = [
  { email: 'jeff.sullivan@protex.ai', name: 'Jeffrey Sullivan', title: '', is_rep: true, role: 'protex' },
  { email: 'dylan.devine@siemens.com', name: 'Dylan Devine', title: 'Environmental Health and Safety Professional', is_rep: false, role: roleFromTitle('Environmental Health and Safety Professional') },
];
const meeting = { uuid: 'a7a7709a-aaf8-4680-aaff-91781233bc2a', date: '2026-10-06T18:00:00Z', subject: 'Dylan and Jeff connect on Protex', url: 'https://app.avoma.com/meetings/a7a7709a-aaf8-4680-aaff-91781233bc2a' };
const output = JSON.parse(fs.readFileSync('siemens_output.json'));

// ---- Real call ----
const r = merge({ rubric, industry: 'M', state: emptyState(), meeting, people, segments, output });
console.log('Dylan resolved as:', people[1].role);
console.log(r.log.join('\n'));
const show = Object.fromEntries(Object.entries(r.properties).filter(([k]) => k !== 'da_ai_assessment'));
fs.writeFileSync('siemens_writes.json', JSON.stringify(r.properties, null, 1));
console.log('\nProperties that would be written (', Object.keys(r.properties).length, '):');
for (const [k, v] of Object.entries(show)) console.log(`- ${k}: ${String(v).replace(/\n/g, ' ⏎ ').slice(0, 230)}`);
console.log('da_ai_assessment chars:', r.properties.da_ai_assessment.length);
assert.equal(r.properties.da_money_m_status, undefined, 'Protex quote must be dropped');
assert.equal(r.properties.da_problem_status, undefined, 'invented quote must be dropped');
assert.equal(r.properties.da_load_status, 'touched_on');

// ---- Guard tests ----
const one = (q, ev, level = 'answered', extra = {}) => ({ call_summary: '', stop_signals: [], people: [], questions: [{ id: q, level, why_level: '', evidence: ev, summary: 's', details: [], numbers: [], missing: [], next_ask: { who: '', question: '' }, confidence: 'high', contradicts: null, ...extra }] });
const seg = [{ speaker_email: 'a@x.com', text: 'We log about six near-miss cards a month across 400 staff and nobody watches the cameras' }, { speaker_email: 'b@x.com', text: 'Six a month, yes, and the COO has asked about it' }];
const ppl = [{ email: 'a@x.com', name: 'A', title: 'Site EHS Manager', role: 'operator', is_rep: false }, { email: 'b@x.com', name: 'B', title: 'VP Operations', role: 'exec', is_rep: false }];
const m2 = (u, d) => ({ uuid: u, date: d, subject: 's', url: 'u' });
const E = (email, segment, prov = 'volunteered', quote = 'six near-miss cards a month across 400 staff') => ({ quote, segment, speaker_email: email, provenance: prov });

let s = merge({ rubric, industry: 'M', state: emptyState(), meeting: m2('1', '2026-10-01T00:00:00Z'), people: ppl, segments: seg, output: one('problem', [E('a@x.com', 0, 'agreed_with_us')]) });
assert.equal(s.properties.da_problem_status, 'touched_on', 'agreed_with_us caps at touched_on'); console.log('\n✓ told-and-nodded caps at Touched on');

s = merge({ rubric, industry: 'M', state: emptyState(), meeting: m2('1', '2026-10-01T00:00:00Z'), people: ppl, segments: seg, output: one('cameras', [E('a@x.com', 0)]) });
assert.equal(s.properties.da_cameras_status, 'touched_on', 'camera facts from EHS cap at touched_on'); console.log('✓ wrong person (camera facts from EHS) caps at Touched on');

s = merge({ rubric, industry: 'M', state: emptyState(), meeting: m2('1', '2026-10-01T00:00:00Z'), people: ppl, segments: seg, output: one('problem', [E('a@x.com', 0)], 'confirmed') });
assert.equal(s.properties.da_problem_status, 'answered', 'confirmed needs 2 buyers'); console.log('✓ Confirmed needs a second person');

const s2 = merge({ rubric, industry: 'M', state: s.state, meeting: m2('2', '2026-10-05T00:00:00Z'), people: ppl, segments: seg, output: one('problem', [E('a@x.com', 0)], 'touched_on') });
assert.equal(s2.properties.da_problem_status, 'answered', 'never downgrade'); console.log('✓ a thinner later call never lowers the level');

const s3 = merge({ rubric, industry: 'M', state: s.state, meeting: m2('3', '2026-10-06T00:00:00Z'), people: ppl, segments: seg, output: one('problem', [E('b@x.com', 1, 'volunteered', 'Six a month')], 'confirmed', { contradicts: 'Earlier call said four a month' }) });
assert.equal(s3.properties.da_problem_status, 'answered', 'contradiction freezes'); console.log('✓ a contradiction holds the level and is flagged');

const again = merge({ rubric, industry: 'M', state: s.state, meeting: m2('1', '2026-10-01T00:00:00Z'), people: ppl, segments: seg, output: one('problem', [E('a@x.com', 0)]) });
assert.equal(Object.keys(again.properties).length, 0, 'idempotent'); console.log('✓ the same call is never assessed twice');

const ov = structuredClone(s.state); ov.overrides.problem = { level: 'touched_on', by: 'rep', at: '2026-10-03T00:00:00Z' };
const s4 = merge({ rubric, industry: 'M', state: ov, meeting: m2('4', '2026-10-04T00:00:00Z'), people: ppl, segments: seg, output: one('problem', [E('a@x.com', 0)], 'touched_on') });
assert.equal(s4.properties.da_problem_status, 'touched_on', 'rep override is the floor, not raised by thin evidence'); console.log('✓ a rep\'s change sticks until stronger evidence arrives');
console.log('\nAll guard tests passed.');
