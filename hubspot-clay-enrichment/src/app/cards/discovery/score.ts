// The sheet's "Deal scorer" and "Close model", as pure functions so they can
// be tested against the sheet's own worked example.

import { CLOSE_EVIDENCE, QUESTIONS, STAGES, STATUS_OPTIONS, WHO_DETAIL_VALUES } from './data.ts';
import type { IndustryCode, Question } from './types.ts';

export type Level = 0 | 1 | 2 | 3;
export type Band = 'High' | 'Medium' | 'Low' | 'At risk';

export const LEVEL_LABELS = STATUS_OPTIONS.map((s) => s.label);

/** New-business pipelines the assessment applies to: stage id -> stage 1-5. */
export const STAGE_BY_ID: Record<string, number> = {
  // New Business Pipeline
  '54122954': 1,
  qualifiedtobuy: 2,
  '5429849309': 3, // Stage 3 Approval: show what's needed to pass into Stage 3
  presentationscheduled: 3,
  '53854163': 4,
  '5480272085': 5, // Stage 5 Approval
  '559437043': 5,
  '93375': 5, // Closed Won
  '82401210': 5, // Closed Lost
  // Partner - Kroninn
  '2433175742': 1,
  '2433175743': 2,
  '2426213608': 3,
  '2433175745': 3,
  '2433175746': 4,
  '2433175747': 5,
  '2433175748': 5,
  '2433175755': 5,
  // Z - Testing Pipeline
  '3575507176': 1,
  '3575507177': 2,
  '3575507178': 3,
  '3575507179': 3,
  '3575507180': 4,
  '3575507181': 5,
  '3510524134': 5,
  '3575507182': 5,
  '3581441249': 5,
};

export function stageOf(dealstage: string | null | undefined): number | null {
  return dealstage ? STAGE_BY_ID[dealstage] ?? null : null;
}

export function stageName(stage: number): string {
  return STAGES[stage - 1] ?? '';
}

export function levelOf(statusValue: string | null | undefined): Level {
  const i = STATUS_OPTIONS.findIndex((s) => s.value === statusValue);
  return (i < 0 ? 0 : i) as Level;
}

export function industryCode(value: string | null | undefined): IndustryCode | null {
  const v = (value ?? '').trim().toLowerCase();
  if (v.startsWith('log')) return 'L';
  if (v.startsWith('man')) return 'M';
  if (v.startsWith('ret')) return 'R';
  return null;
}

export const INDUSTRY_NAMES: Record<IndustryCode, string> = { L: 'Logistics', M: 'Manufacturing', R: 'Retail' };

export function applies(q: Question, industry: IndustryCode | null): boolean {
  return q.industry === 'All' || q.industry === industry;
}

export function neededAt(q: Question, stage: number): Level {
  return (q.needed[stage - 1] ?? 0) as Level;
}

export function checkedValues(raw: string | null | undefined): Set<string> {
  return new Set((raw ?? '').split(';').map((v) => v.trim()).filter(Boolean));
}

export interface QuestionState {
  q: Question;
  level: Level;
  needed: Level;
  applies: boolean;
  /** Due at this stage and not yet at the level needed. */
  short: boolean;
  detailsDone: number;
  /** Values of the details checklist that are ticked. */
  checked: Set<string>;
}

export function questionStates(
  props: Record<string, string | null | undefined>,
  stage: number,
  industry: IndustryCode | null,
  questions: Question[] = QUESTIONS
): QuestionState[] {
  return questions.map((q) => {
    const level = levelOf(q.statusProperty ? props[q.statusProperty] : null);
    const needed = neededAt(q, stage);
    const ap = applies(q, industry);
    const done = q.detailsProperty ? checkedValues(props[q.detailsProperty]) : new Set<string>();
    return {
      q,
      level,
      needed,
      applies: ap,
      short: ap && needed > 0 && level < needed,
      detailsDone: q.details.filter((d) => done.has(d.value)).length,
      checked: done,
    };
  });
}

/** Weighted share of questions due by this stage that are answered well enough (0-1). */
export function discoveryHealth(states: QuestionState[]): number {
  let earned = 0;
  let possible = 0;
  for (const s of states) {
    if (!s.applies || s.needed === 0) continue;
    possible += s.q.weight;
    earned += (Math.min(s.level, s.needed) / s.needed) * s.q.weight;
  }
  return possible ? earned / possible : 0;
}

export interface CloseInputs {
  peopleEngaged: number;
  whoDetails: Set<string>;
  stopUnresolved: boolean;
}

export interface CloseSignal {
  signal: string;
  from: string;
  points: number;
  evidence: string;
  met: boolean;
}

export function closeSignals(states: QuestionState[], inputs: CloseInputs): CloseSignal[] {
  const lvl = (n: number) => states.find((s) => s.q.n === n)?.level ?? 0;
  // Same order as the sheet's Close model rows.
  const met = [
    inputs.peopleEngaged >= 3,
    inputs.peopleEngaged >= 5,
    inputs.whoDetails.has(WHO_DETAIL_VALUES.vp),
    lvl(25) >= 3, // Who signs: Confirmed
    lvl(26) >= 3, // Who is selling for us: Confirmed
    inputs.whoDetails.has(WHO_DETAIL_VALUES.it),
    inputs.whoDetails.has(WHO_DETAIL_VALUES.ops),
    lvl(19) >= 2, // Why now: Answered
    lvl(16) >= 2, // Which number does it hurt: Answered
    lvl(21) >= 2, // How will they know it worked: Answered
    lvl(35) >= 2, // What will they do next: Answered
  ];
  return CLOSE_EVIDENCE.map((e, i) => ({ ...e, met: !!met[i] }));
}

export function closePoints(signals: CloseSignal[]): number {
  return signals.reduce((sum, s) => sum + (s.met ? s.points : 0), 0);
}

export function closeBand(points: number, stopUnresolved: boolean): Band {
  if (stopUnresolved) return 'At risk';
  if (points >= 60) return 'High';
  if (points >= 30) return 'Medium';
  return 'Low';
}

/** Written by the AI call assessment, shown on the card when present. */
export const AI_PROPERTIES = [
  'da_ai_assessment',
  'da_ai_last_meeting',
  'da_ai_last_run',
  'da_discovery_health',
  'da_close_points',
  'da_close_band',
];

/** Every property the card reads. */
export const DISCOVERY_PROPERTIES: string[] = Array.from(
  new Set([
    'dealname',
    'pipeline',
    'dealstage',
    'da_industry',
    'num_associated_contacts',
    ...AI_PROPERTIES,
    ...QUESTIONS.flatMap((q) => q.properties),
  ])
);

export function valueToCost(props: Record<string, string | null | undefined>): number | null {
  const value = Number(props.da_worth_annual_value_their_numbers);
  const cost = Number(props.da_worth_first_year_cost_of_change);
  return value > 0 && cost > 0 ? value / cost : null;
}
