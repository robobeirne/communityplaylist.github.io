import React from 'react';
import {
  Accordion,
  Alert,
  Divider,
  ErrorState,
  Flex,
  Heading,
  Link,
  List,
  LoadingButton,
  LoadingSpinner,
  Select,
  StatusTag,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Text,
  TextArea,
  Tile,
  ToggleGroup,
  hubspot,
} from '@hubspot/ui-extensions';
import { PERSONAS } from './discovery/data.ts';
import { GUIDE } from './discovery/guide.ts';
import {
  DISCOVERY_PROPERTIES,
  INDUSTRY_NAMES,
  LEVEL_LABELS,
  checkedValues,
  closeBand,
  closePoints,
  closeSignals,
  discoveryHealth,
  industryCode,
  questionStates,
  stageName,
  stageOf,
  type Band,
  type CloseSignal,
  type Level,
  type QuestionState,
} from './discovery/score.ts';
import type { IndustryCode } from './discovery/types.ts';
import { useRecordProperties, type CrmActions } from './lib/hooks.ts';

/*
 * Discovery assessment: the record of what the buyer has said, kept by AI from Avoma calls.
 *
 * The assessor (ai/run.mjs) reads each sales call, judges every question against its level descriptions,
 * and writes the level, the buyer's quote, who said it and what's still missing. This card shows that record
 * and turns the gaps into a checklist for the next call. Reps don't type answers; they can correct a level,
 * which sticks until a later call gives stronger evidence.
 */

hubspot.extend<'crm.record.tab'>(({ actions, context }) => (
  <Discovery actions={actions} dealId={String(context.crm.objectId)} user={context.user?.email ?? 'rep'} />
));

const SAVE_FN = 'save_discovery';
const PROPS = [...DISCOVERY_PROPERTIES, 'da_ai_assessment', 'da_ai_last_run'];
const LEVEL_VALUE = ['not_discussed', 'touched_on', 'answered', 'confirmed'] as const;
const LEVEL_VARIANT: Record<Level, 'default' | 'warning' | 'info' | 'success'> = { 0: 'default', 1: 'warning', 2: 'info', 3: 'success' };
const BAND_VARIANT: Record<Band, 'success' | 'warning' | 'danger' | 'default'> = { High: 'success', Medium: 'warning', Low: 'default', 'At risk': 'danger' };
const INDUSTRY_VALUE: Record<IndustryCode, string> = { L: 'logistics', M: 'manufacturing', R: 'retail' };

type Props = Record<string, string | null | undefined>;
type Evidence = { quote: string; who: string; title?: string; date: string; meeting: string; prov: string };
type AiQ = {
  level: (typeof LEVEL_VALUE)[number]; by: 'ai' | 'rep'; at: string; why: string; summary: string; evidence: Evidence[];
  details: string[]; missing: string[]; ask: { who: string; question: string } | null; conf: 'high' | 'medium' | 'low'; contra?: string;
};
type AiState = {
  meetings: { uuid: string; date: string; subject: string; summary?: string }[];
  q: Record<string, AiQ>;
  overrides: Record<string, { level: string; by: string; at: string; note?: string }>;
};

const parseAi = (raw?: string | null): AiState => {
  try {
    const s = JSON.parse(raw || '');
    return { meetings: s.meetings ?? [], q: s.q ?? {}, overrides: s.overrides ?? {} };
  } catch {
    return { meetings: [], q: {}, overrides: {} };
  }
};
const keyOf = (q: QuestionState['q']) => (q.properties.find((p) => p.endsWith('_status')) ?? '').replace(/^da_|_status$/g, '');
const aiFor = (ai: AiState, q: QuestionState['q']) => {
  const k = keyOf(q);
  return ai.q[k] ?? ai.q[k.replace(/_/g, '-')];
};
const levelName = (q: QuestionState['q'], l: Level) => GUIDE[q.question]?.levelNames?.[l] ?? LEVEL_LABELS[l];
const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const avoma = (uuid: string) => `https://app.avoma.com/meetings/${uuid}`;
const detailsFor = (q: QuestionState['q'], industry: IndustryCode | null) =>
  q.details.filter((d) => {
    const m = d.label.match(/^\[(L|M|R)\]/);
    return !m || m[1] === industry;
  });

export function Discovery({ actions, dealId, user }: { actions: CrmActions; dealId: string; user: string }) {
  const { props, error, loading } = useRecordProperties(actions, PROPS);
  const [local, setLocal] = React.useState<Props>({});
  const [open, setOpen] = React.useState<number | null>(null);
  const [who, setWho] = React.useState('');

  const call = React.useCallback(
    async (parameters: Record<string, unknown>) => {
      try {
        const res = await hubspot.serverless(SAVE_FN, { parameters: { dealId, user, ...parameters } });
        const body = res?.body ?? res;
        if (!body?.ok) throw new Error(body?.message ?? 'Save failed');
        if (body.properties) setLocal((cur) => ({ ...cur, ...body.properties }));
        actions.refreshObjectProperties();
        return true;
      } catch (e) {
        actions.addAlert({ type: 'danger', message: `Couldn't save: ${(e as Error).message}` });
        return false;
      }
    },
    [actions, dealId, user],
  );

  if (loading) return <LoadingSpinner label="Loading discovery" layout="centered" />;
  if (error || !props) {
    return (
      <ErrorState title="Couldn't load the discovery assessment">
        <Text>{error ?? 'Unknown error'}</Text>
      </ErrorState>
    );
  }

  const p: Props = { ...props, ...local };
  const stage = stageOf(p.dealstage);
  if (stage === null) return <Text variant="microcopy">The discovery assessment is for new-business deals.</Text>;

  const ai = parseAi(p.da_ai_assessment);
  const industry = industryCode(p.da_industry);
  const states = questionStates(p, stage, industry);
  const stopUnresolved = p.da_stop_unresolved === 'true';
  const signals = closeSignals(states, {
    peopleEngaged: Number(p.num_associated_contacts) || 0,
    whoDetails: checkedValues(p.da_who_details),
    stopUnresolved,
  });
  const points = closePoints(signals);
  const band = closeBand(points, stopUnresolved);

  const applies = states.filter((s) => s.applies);
  const forWho = (s: QuestionState) => !who || s.q.whoToAsk.includes(who);
  const gaps = applies
    .filter((s) => s.short && forWho(s))
    .sort((a, b) => b.q.weight - a.q.weight || b.needed - b.level - (a.needed - a.level) || a.q.n - b.q.n);
  const flagged = applies.filter((s) => {
    const a = aiFor(ai, s.q);
    return a && (a.contra || a.conf === 'low');
  });

  const current = open === null ? null : states.find((s) => s.q.n === open);
  if (current) {
    const walk = (current.short ? gaps : applies).map((s) => s.q.n);
    const at = walk.indexOf(current.q.n);
    return (
      <QuestionView
        key={current.q.n}
        state={current}
        ai={aiFor(ai, current.q)}
        industry={industry}
        stage={stage}
        position={at >= 0 ? `${at + 1} of ${walk.length}` : ''}
        onClose={() => setOpen(null)}
        onNext={at >= 0 && at < walk.length - 1 ? () => setOpen(walk[at + 1]) : undefined}
        override={(level, note) => call({ override: { key: keyOf(current.q), level, note } })}
      />
    );
  }

  const last = ai.meetings[0];
  return (
    <Flex direction="column" gap="md">
      <Flex direction="row" gap="sm" align="center" wrap="wrap">
        <Tag variant="info">{stageName(stage)}</Tag>
        {industry && <Tag>{INDUSTRY_NAMES[industry]}</Tag>}
        <Text>{`Discovery ${Math.round(discoveryHealth(states) * 100)}%`}</Text>
        <Text variant="microcopy">·</Text>
        <Text>{`Close ${points}/100`}</Text>
        <StatusTag variant={BAND_VARIANT[band]}>{band}</StatusTag>
      </Flex>

      {last ? (
        <Tile compact>
          <Flex direction="column" gap="flush">
            <Text variant="microcopy">
              {`Last call assessed: `}
              <Link href={avoma(last.uuid)}>{last.subject}</Link>
              {` · ${shortDate(last.date)}`}
            </Text>
            {last.summary && <Text>{last.summary}</Text>}
          </Flex>
        </Tile>
      ) : (
        <Text variant="microcopy">No calls assessed yet. This fills in after the first recorded sales call in Avoma.</Text>
      )}

      {!industry && (
        <ToggleGroup
          name="da_industry"
          label="Which industry? The assessor needs it to pick the right questions."
          toggleType="radioButtonList"
          inline
          options={(['L', 'M', 'R'] as IndustryCode[]).map((c) => ({ label: INDUSTRY_NAMES[c], value: INDUSTRY_VALUE[c] }))}
          onChange={(v) => v && call({ properties: { da_industry: String(v) } })}
        />
      )}
      {stopUnresolved && (
        <Alert title="At risk" variant="danger">
          <Text>Something should stop this deal and has no known fix.</Text>
        </Alert>
      )}
      {flagged.length > 0 && (
        <Alert title={`${flagged.length} answer${flagged.length > 1 ? 's' : ''} to check`} variant="warning">
          <Flex direction="column" gap="flush">
            {flagged.map((s) => (
              <Link key={s.q.n} href="#" preventDefault onClick={() => setOpen(s.q.n)}>
                {`${s.q.question}${aiFor(ai, s.q)?.contra ? ' · conflicts with an earlier call' : ' · low confidence'}`}
              </Link>
            ))}
          </Flex>
        </Alert>
      )}

      <Flex direction="row" gap="sm" align="end" wrap="wrap" justify="between">
        <Heading>{gaps.length ? `Still to find out for ${stageName(stage)} (${gaps.length})` : `${stageName(stage)} is covered`}</Heading>
        <Select
          name="who"
          label="Prepping for a call with"
          value={who}
          onChange={(v) => setWho(String(v ?? ''))}
          options={[{ label: 'Anyone', value: '' }, ...PERSONAS.map((x) => ({ label: x.who, value: x.who }))]}
        />
      </Flex>
      {gaps.length > 0 && <GapList states={gaps} ai={ai} onOpen={setOpen} />}

      <Accordion title={`Everything we know (${applies.filter((s) => s.level > 0).length} of ${applies.length} questions)`} size="sm">
        <Flex direction="column" gap="sm">
          {topics(applies).map(([topic, list]) => (
            <Flex key={topic} direction="column" gap="xs">
              <Text format={{ fontWeight: 'demibold' }}>{topic}</Text>
              <KnownList states={list} ai={ai} onOpen={setOpen} />
            </Flex>
          ))}
        </Flex>
      </Accordion>

      <Accordion title="How these numbers work" size="sm">
        <Scores signals={signals} points={points} band={band} stage={stage} />
      </Accordion>
    </Flex>
  );
}

/* ---------------- lists ---------------- */

/** The pre-call checklist: each gap with the one question that would close it. */
function GapList({ states, ai, onOpen }: { states: QuestionState[]; ai: AiState; onOpen: (n: number) => void }) {
  return (
    <Table bordered={false} flush>
      <TableHead>
        <TableRow>
          <TableHeader>What we still need</TableHeader>
          <TableHeader width={140}>Now</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {states.map((s) => {
          const a = aiFor(ai, s.q);
          const ask = a?.ask?.question || s.q.ways.open[0];
          const askWho = a?.ask?.who || s.q.whoToAsk.join(' or ');
          return (
            <TableRow key={s.q.n}>
              <TableCell>
                <Flex direction="column" gap="flush">
                  <Link href="#" preventDefault onClick={() => onOpen(s.q.n)}>{s.q.question}</Link>
                  {a?.missing?.length ? <Text variant="microcopy">{`Missing: ${a.missing.slice(0, 2).join('; ')}`}</Text> : null}
                  {ask && <Text variant="microcopy">{`Ask ${askWho}: “${ask}”`}</Text>}
                </Flex>
              </TableCell>
              <TableCell>
                <Flex direction="column" gap="flush">
                  <StatusTag variant={LEVEL_VARIANT[s.level]}>{levelName(s.q, s.level)}</StatusTag>
                  <Text variant="microcopy">{`needs ${levelName(s.q, s.needed as Level)}`}</Text>
                </Flex>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** What we know: the summary in their words and who said it. */
function KnownList({ states, ai, onOpen }: { states: QuestionState[]; ai: AiState; onOpen: (n: number) => void }) {
  return (
    <Table bordered={false} flush>
      <TableBody>
        {states.map((s) => {
          const a = aiFor(ai, s.q);
          const lead = a?.evidence?.[0];
          return (
            <TableRow key={s.q.n}>
              <TableCell>
                <Flex direction="column" gap="flush">
                  <Link href="#" preventDefault onClick={() => onOpen(s.q.n)}>{s.q.question}</Link>
                  {a?.summary ? <Text variant="microcopy">{a.summary}</Text> : <Text variant="microcopy">Nothing yet.</Text>}
                  {lead && <Text variant="microcopy">{`${lead.who}, ${shortDate(lead.date)}`}</Text>}
                </Flex>
              </TableCell>
              <TableCell width={140}>
                <StatusTag variant={LEVEL_VARIANT[s.level]}>{levelName(s.q, s.level)}</StatusTag>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/* ---------------- one question ---------------- */

function QuestionView(p: {
  state: QuestionState;
  ai?: AiQ;
  industry: IndustryCode | null;
  stage: number;
  position: string;
  onClose: () => void;
  onNext?: () => void;
  override: (level: string, note: string) => Promise<boolean>;
}) {
  const { q, level, needed } = p.state;
  const a = p.ai;
  const g = GUIDE[q.question];
  const details = detailsFor(q, p.industry);
  const got = new Set(p.state.checked);
  const aim = (level >= Math.max(needed, 2) ? Math.min(level + 1, 3) : Math.max(needed, 2)) as Level;

  return (
    <Flex direction="column" gap="md">
      <Flex direction="row" justify="between" align="center" wrap="wrap" gap="sm">
        <Link href="#" preventDefault onClick={p.onClose}>← Back</Link>
        <Flex direction="row" gap="sm" align="center">
          {p.position && <Text variant="microcopy">{p.position}</Text>}
          {p.onNext && <Link href="#" preventDefault onClick={p.onNext}>Next →</Link>}
        </Flex>
      </Flex>

      <Flex direction="column" gap="xs">
        <Heading>{q.question}</Heading>
        <Flex direction="row" gap="xs" align="center" wrap="wrap">
          <StatusTag variant={LEVEL_VARIANT[level]}>{levelName(q, level)}</StatusTag>
          {needed > 0 && <Text variant="microcopy">{`needs ${levelName(q, needed as Level)} by ${stageName(p.stage)}`}</Text>}
          {a && <Text variant="microcopy">{a.by === 'rep' ? `· set by a rep ${shortDate(a.at)}` : `· from the call on ${shortDate(a.at)}`}</Text>}
        </Flex>
        {a?.why && <Text variant="microcopy">{a.why}</Text>}
      </Flex>

      {a?.contra && (
        <Alert title="Conflicts with an earlier call" variant="warning">
          <Text>{a.contra}</Text>
        </Alert>
      )}

      {/* What they said */}
      {a?.evidence?.length ? (
        <Flex direction="column" gap="sm">
          {a.summary && <Text>{a.summary}</Text>}
          {a.evidence.map((e, i) => (
            <Tile key={i} compact>
              <Text format={{ italic: true }}>{`“${e.quote}”`}</Text>
              <Text variant="microcopy">
                {`${e.who}${e.title ? `, ${e.title}` : ''} · ${shortDate(e.date)}${e.prov === 'agreed_with_us' ? ' · agreed with our framing' : ''} · `}
                <Link href={avoma(e.meeting)}>Listen</Link>
              </Text>
            </Tile>
          ))}
        </Flex>
      ) : (
        <Text variant="microcopy">Nobody on the buyer side has said anything about this yet.</Text>
      )}

      {/* What's still missing: the checklist for the next call */}
      <Flex direction="column" gap="xs">
        <Text format={{ fontWeight: 'demibold' }}>{`To reach ${levelName(q, aim)}`}</Text>
        {g?.levels[aim] && !g.shared && <Text variant="microcopy">{g.levels[aim]}</Text>}
        <List variant="unordered-styled">
          {stillNeeded(a?.missing ?? [], details.filter((d) => !got.has(d.value)).map((d) => d.label.replace(/^\[(L|M|R)\]\s*/, '')))
            .slice(0, 8)
            .map((m, i) => (
              <Text key={i}>{m}</Text>
            ))}
        </List>
        {details.some((d) => got.has(d.value)) && (
          <Text variant="microcopy">{`Already have: ${details.filter((d) => got.has(d.value)).map((d) => d.label.replace(/^\[(L|M|R)\]\s*/, '')).join('; ')}`}</Text>
        )}
      </Flex>

      <Tile compact>
        <Text format={{ fontWeight: 'demibold' }}>{`Ask ${a?.ask?.who || q.whoToAsk.join(' or ')}`}</Text>
        <Text>{`“${a?.ask?.question || q.ways.open[0]}”`}</Text>
      </Tile>

      <HowToAsk q={q} />
      <WhatCounts q={q} />
      <Divider />
      <Override q={q} level={level} override={p.override} />
    </Flex>
  );
}

/** A rep's correction. It sticks until a later call gives stronger evidence. */
function Override({ q, level, override }: { q: QuestionState['q']; level: Level; override: (l: string, n: string) => Promise<boolean> }) {
  const [l, setL] = React.useState<Level>(level);
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  return (
    <Accordion title="Correct the level" size="sm">
      <Flex direction="column" gap="sm">
        <Text variant="microcopy">Use this when the AI got it wrong, or the answer came from somewhere it can't see (an email, a site visit). Say why.</Text>
        <ToggleGroup
          name="level"
          label="How well is it answered?"
          toggleType="radioButtonList"
          inline
          value={LEVEL_VALUE[l]}
          onChange={(v) => setL(Math.max(0, LEVEL_VALUE.indexOf(v as (typeof LEVEL_VALUE)[number])) as Level)}
          options={LEVEL_VALUE.map((v, i) => ({ label: levelName(q, i as Level), value: v }))}
        />
        <TextArea name="note" label="Why" placeholder="e.g. Confirmed in an email from the plant manager, 8 Oct" value={note} onChange={setNote} rows={2} />
        <LoadingButton
          variant="secondary"
          loading={saving}
          disabled={l === level || !note.trim()}
          onClick={async () => {
            setSaving(true);
            await override(LEVEL_VALUE[l], note.trim());
            setSaving(false);
          }}
        >
          Save correction
        </LoadingButton>
      </Flex>
    </Accordion>
  );
}

/** Six question styles, grouped by when you'd reach for them. */
function HowToAsk({ q }: { q: QuestionState['q'] }) {
  const w = q.ways;
  const groups = ([
    ['Start with', w.open],
    ['If the answer is thin', [...w.label, ...w.noOriented, ...w.mirror]],
    ["If they're guarded", w.accusationAudit],
    ['To lock it in', w.summary],
  ] as [string, string[]][]).filter(([, l]) => l.length);
  if (!groups.length) return null;
  return (
    <Accordion title="Other ways to ask" size="sm">
      <Flex direction="column" gap="sm">
        {groups.map(([when, lines]) => (
          <Flex key={when} direction="column" gap="flush">
            <Text format={{ fontWeight: 'demibold' }}>{when}</Text>
            <List variant="unordered-styled">
              {lines.map((l, i) => (
                <Text key={i}>{l}</Text>
              ))}
            </List>
          </Flex>
        ))}
      </Flex>
    </Accordion>
  );
}

function WhatCounts({ q }: { q: QuestionState['q'] }) {
  const g = GUIDE[q.question];
  return (
    <Accordion title="What counts, and red flags" size="sm">
      <Flex direction="column" gap="sm">
        {g?.test && <Text>{`The test: ${g.test}`}</Text>}
        {q.listenFor && <Text>{`Listen for: ${q.listenFor}`}</Text>}
        {g?.doesntCount.length ? (
          <Flex direction="column" gap="flush">
            <Text format={{ fontWeight: 'demibold' }}>Doesn't count</Text>
            <List variant="unordered-styled">
              {g.doesntCount.map((t, i) => (
                <Text key={i}>{t}</Text>
              ))}
            </List>
          </Flex>
        ) : null}
        {q.redFlag && <Text>{`Red flag: ${q.redFlag}`}</Text>}
        {g?.levels.length ? (
          <Flex direction="column" gap="flush">
            <Text format={{ fontWeight: 'demibold' }}>Each level, for this question</Text>
            {g.levels.map((t, i) => (
              <Text key={i} variant="microcopy">{`${levelName(q, i as Level)}: ${t}`}</Text>
            ))}
          </Flex>
        ) : null}
      </Flex>
    </Accordion>
  );
}

/** The AI's missing items first, then checklist details it hasn't already said in other words. */
function stillNeeded(missing: string[], unticked: string[]): string[] {
  const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  const same = (a: string, b: string) => {
    const A = words(a), B = words(b);
    const both = [...A].filter((w) => B.has(w)).length;
    return both / Math.max(1, Math.min(A.size, B.size)) >= 0.6;
  };
  const out = [...missing];
  for (const u of unticked) if (!out.some((m) => same(m, u))) out.push(u);
  return out;
}

/* ---------------- scores ---------------- */

function Scores({ signals, points, band, stage }: { signals: CloseSignal[]; points: number; band: Band; stage: number }) {
  return (
    <Flex direction="column" gap="sm">
      <Text variant="microcopy">
        {`Discovery is the weighted share of questions due by ${stageName(stage)} that are answered well enough. Close is points from the signals that separated wins from losses (Win-Loss, Jul 2026). High 60+, Medium 30–59, Low under 30, At risk if something should stop us.`}
      </Text>
      <Table bordered={false} flush>
        <TableBody>
          {signals.map((s) => (
            <TableRow key={s.signal}>
              <TableCell>
                <Text>{s.signal}</Text>
              </TableCell>
              <TableCell width={80}>
                <Text>{s.met ? `+${s.points}` : '–'}</Text>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Flex direction="row" gap="xs" align="center">
        <Text format={{ fontWeight: 'demibold' }}>{`${points} of 100`}</Text>
        <StatusTag variant={BAND_VARIANT[band]}>{band}</StatusTag>
      </Flex>
    </Flex>
  );
}

function topics(states: QuestionState[]): [string, QuestionState[]][] {
  const map = new Map<string, QuestionState[]>();
  for (const s of states) map.set(s.q.topic, [...(map.get(s.q.topic) ?? []), s]);
  return Array.from(map.entries());
}
