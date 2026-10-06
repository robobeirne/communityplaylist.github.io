import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, STATUS_OPTIONS, WHO_DETAIL_VALUES } from './data.ts';
import {
  closeBand,
  closePoints,
  closeSignals,
  discoveryHealth,
  industryCode,
  levelOf,
  questionStates,
  stageOf,
  valueToCost,
} from './score.ts';

// The worked example on the sheet's "Deal scorer" tab: Manufacturing, Stage 2,
// four people engaged, a VP engaged, no IT or Ops leader, nothing stopping us.
const EXAMPLE_LEVELS = [2, 2, 1, 1, 1, 0, 0, 2, 2, 1, 2, 1, 1, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 2, 1, 2, 1, 1, 1, 0, 0, 2, 2, 0, 2, 2];

function exampleProps(): Record<string, string> {
  const props: Record<string, string> = {};
  QUESTIONS.forEach((q, i) => {
    if (q.statusProperty) props[q.statusProperty] = STATUS_OPTIONS[EXAMPLE_LEVELS[i]].value;
  });
  return props;
}

test('matches the Deal scorer worked example', () => {
  const states = questionStates(exampleProps(), 2, 'M');
  assert.equal(Math.round(discoveryHealth(states) * 1e6) / 1e6, 0.850575);
  assert.equal(states.filter((s) => s.short).length, 6);
  const signals = closeSignals(states, {
    peopleEngaged: 4,
    whoDetails: new Set([WHO_DETAIL_VALUES.vp]),
    stopUnresolved: false,
  });
  assert.equal(signals.length, 11);
  const points = closePoints(signals);
  assert.equal(points, 32);
  assert.equal(closeBand(points, false), 'Medium');
});

test('only the money question for the deal industry applies', () => {
  const states = questionStates({}, 3, 'L');
  const money = states.filter((s) => [5, 6, 7].includes(s.q.n));
  assert.deepEqual(money.map((s) => s.applies), [false, true, false]);
  const none = questionStates({}, 3, null).filter((s) => [5, 6, 7].includes(s.q.n));
  assert.ok(none.every((s) => !s.applies));
});

test('band thresholds and At risk override', () => {
  assert.equal(closeBand(60, false), 'High');
  assert.equal(closeBand(59, false), 'Medium');
  assert.equal(closeBand(29, false), 'Low');
  assert.equal(closeBand(90, true), 'At risk');
});

test('an empty deal scores zero health and zero points', () => {
  const states = questionStates({}, 1, 'R');
  assert.equal(discoveryHealth(states), 0);
  assert.equal(closePoints(closeSignals(states, { peopleEngaged: 0, whoDetails: new Set(), stopUnresolved: false })), 0);
});

test('a fully confirmed deal scores 100% and 100 points', () => {
  const props: Record<string, string> = {};
  for (const q of QUESTIONS) if (q.statusProperty) props[q.statusProperty] = 'confirmed';
  const states = questionStates(props, 5, 'M');
  assert.equal(discoveryHealth(states), 1);
  const who = new Set(Object.values(WHO_DETAIL_VALUES));
  assert.equal(closePoints(closeSignals(states, { peopleEngaged: 8, whoDetails: who, stopUnresolved: false })), 100);
});

test('helpers', () => {
  assert.equal(stageOf('qualifiedtobuy'), 2);
  assert.equal(stageOf('5429849309'), 3);
  assert.equal(stageOf('80167154'), null); // Expansion pipeline
  assert.equal(levelOf('answered'), 2);
  assert.equal(levelOf(null), 0);
  assert.equal(industryCode('manufacturing'), 'M');
  assert.equal(industryCode(''), null);
  assert.equal(valueToCost({ da_worth_annual_value_their_numbers: '300000', da_worth_first_year_cost_of_change: '100000' }), 3);
  assert.equal(valueToCost({}), null);
});
