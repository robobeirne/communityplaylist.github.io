import React from 'react';
import {
  Accordion,
  Alert,
  Button,
  ErrorState,
  Flex,
  Heading,
  Icon,
  List,
  LoadingSpinner,
  ScoreCircle,
  Statistics,
  StatisticsItem,
  StatusTag,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Tag,
  Text,
  Tile,
  hubspot,
} from '@hubspot/ui-extensions';
import { CrmPropertyList } from '@hubspot/ui-extensions/crm';
import { PERSONAS } from './discovery/data.ts';
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
  valueToCost,
  type Band,
  type CloseSignal,
  type Level,
  type QuestionState,
} from './discovery/score.ts';
import type { IndustryCode } from './discovery/types.ts';
import { SectionTitle } from './lib/components.tsx';
import { useRecordProperties, type CrmActions } from './lib/hooks.ts';

/** Lets any question table open a question in the card. */
const OpenContext = React.createContext<(n: number) => void>(() => {});

hubspot.extend<'crm.record.tab'>(({ actions }) => <Discovery actions={actions} />);

const STYLE_TABS: { key: keyof QuestionState['q']['ways']; title: string }[] = [
  { key: 'open', title: 'Open question' },
  { key: 'label', title: 'Label' },
  { key: 'noOriented', title: 'No-oriented' },
  { key: 'mirror', title: 'Mirror' },
  { key: 'accusationAudit', title: 'Accusation audit' },
  { key: 'summary', title: "That's right" },
];

const LEVEL_VARIANT: Record<Level, 'default' | 'warning' | 'info' | 'success'> = {
  0: 'default',
  1: 'warning',
  2: 'info',
  3: 'success',
};

const BAND_VARIANT: Record<Band, 'success' | 'warning' | 'error' | 'default'> = {
  High: 'success',
  Medium: 'warning',
  Low: 'default',
  'At risk': 'error',
};

export function Discovery({ actions }: { actions: CrmActions }) {
  const { props, error, loading } = useRecordProperties(actions, DISCOVERY_PROPERTIES);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [tab, setTab] = React.useState<string>('next');

  if (loading) return <LoadingSpinner label="Loading discovery assessment" layout="centered" />;
  if (error || !props) {
    return (
      <ErrorState title="Couldn't load the discovery assessment">
        <Text>{error ?? 'Unknown error'}</Text>
      </ErrorState>
    );
  }

  const stage = stageOf(props.dealstage);
  if (stage === null) {
    return (
      <Text variant="microcopy" format={{ italic: true }}>
        The discovery assessment is for new-business deals.
      </Text>
    );
  }

  const industry = industryCode(props.da_industry);
  const states = questionStates(props, stage, industry);
  const health = discoveryHealth(states);
  const stopUnresolved = props.da_stop_unresolved === 'true';
  const signals = closeSignals(states, {
    peopleEngaged: Number(props.num_associated_contacts) || 0,
    whoDetails: checkedValues(props.da_who_details),
    stopUnresolved,
  });
  const points = closePoints(signals);
  const band = closeBand(points, stopUnresolved);
  const short = states
    .filter((s) => s.short)
    .sort((a, b) => b.q.weight - a.q.weight || b.needed - b.level - (a.needed - a.level) || a.q.n - b.q.n);
  const due = states.filter((s) => s.applies && s.needed > 0);
  const selectedState = selected === null ? null : states.find((s) => s.q.n === selected) ?? null;
  // Previous/Next walk the "Up next" list when the question is on it, otherwise all questions in order.
  const walk = (selectedState?.short ? short : states.filter((s) => s.applies)).map((s) => s.q.n);
  const at = selected === null ? -1 : walk.indexOf(selected);

  return (
    <OpenContext.Provider value={setSelected}>
    <Flex direction="column" gap="md">
      <Summary
        stage={stage}
        industry={industry}
        health={health}
        points={points}
        band={band}
        shortCount={short.length}
        dueCount={due.length}
      />

      {!industry && (
        <Alert title="Pick the industry" variant="warning">
          <Flex direction="column" gap="xs">
            <Text>It decides which money question applies and which job titles to look for.</Text>
            <CrmPropertyList properties={['da_industry']} direction="row" />
          </Flex>
        </Alert>
      )}
      {stopUnresolved && (
        <Alert title="At risk: something should stop us, with no known fix" variant="danger">
          <Text>Open "Is there anything that should stop us?" to see what was ticked.</Text>
        </Alert>
      )}

      {selectedState ? (
        <QuestionDetail
          state={selectedState}
          stage={stage}
          industry={industry}
          ratio={valueToCost(props)}
          onBack={() => setSelected(null)}
          onPrev={at > 0 ? () => setSelected(walk[at - 1]) : undefined}
          onNext={at >= 0 && at < walk.length - 1 ? () => setSelected(walk[at + 1]) : undefined}
          position={at >= 0 ? `${at + 1} of ${walk.length}${selectedState.short ? ' up next' : ''}` : ''}
        />
      ) : (
      <Tabs selected={tab} onSelectedChange={(id: string | number) => setTab(String(id))} variant="enclosed" fill>
        <Tab tabId="next" title={`Up next (${short.length})`} tooltip={`Questions due by ${stageName(stage)} that aren't answered well enough yet`}>
          <Flex direction="column" gap="sm">
            {short.length ? (
              <QuestionTable states={short} stage={stage} industry={industry} />
            ) : (
              <Alert title={`Everything due by ${stageName(stage)} is covered`} variant="success">
                <Text>{nextStageText(states, stage)}</Text>
              </Alert>
            )}
          </Flex>
        </Tab>

        <Tab tabId="all" title="All questions" tooltip="All questions, grouped by topic">
          <Flex direction="column" gap="xs">
            {topics(states).map(([topic, list]) => (
              <Accordion key={topic} title={topicTitle(topic, list)} size="sm">
                <QuestionTable states={list} stage={stage} industry={industry} />
              </Accordion>
            ))}
          </Flex>
        </Tab>

        <Tab tabId="who" title="By who to ask" tooltip="Questions grouped by the person who should answer them">
          <Flex direction="column" gap="xs">
            {PERSONAS.map((p) => (
              <PersonaSection key={p.who} persona={p} states={states} stage={stage} industry={industry} />
            ))}
          </Flex>
        </Tab>

        <Tab tabId="close" title="Close signals" tooltip="The Win-Loss signals behind the likelihood to close">
          <CloseSignals signals={signals} points={points} band={band} />
        </Tab>
      </Tabs>
      )}
    </Flex>
    </OpenContext.Provider>
  );
}

function Summary(p: {
  stage: number;
  industry: IndustryCode | null;
  health: number;
  points: number;
  band: Band;
  shortCount: number;
  dueCount: number;
}) {
  const pct = Math.round(p.health * 100);
  return (
    <Tile>
      <Flex direction="row" gap="lg" align="center" justify="between" wrap="wrap">
        <Flex direction="row" gap="md" align="center">
          <ScoreCircle score={pct} />
          <Flex direction="column" gap="xs">
            <Heading>Discovery health</Heading>
            <Text variant="microcopy">
              {`${p.dueCount - p.shortCount} of ${p.dueCount} questions due by ${stageName(p.stage)} are answered well enough, weighted by importance.`}
            </Text>
            <Flex direction="row" gap="xs" wrap="wrap">
              <Tag variant="info">{`Stage ${p.stage} · ${stageName(p.stage)}`}</Tag>
              {p.industry ? <Tag>{INDUSTRY_NAMES[p.industry]}</Tag> : <Tag variant="warning">Industry not set</Tag>}
            </Flex>
          </Flex>
        </Flex>
        <Statistics>
          <StatisticsItem label="Likelihood to close" number={`${p.points}/100`}>
            <Tag variant={BAND_VARIANT[p.band]}>{p.band}</Tag>
          </StatisticsItem>
          <StatisticsItem label="Short for this stage" number={p.shortCount} />
        </Statistics>
      </Flex>
    </Tile>
  );
}

function QuestionTable({
  states,
  stage,
}: {
  states: QuestionState[];
  stage: number;
  industry: IndustryCode | null;
}) {
  const open = React.useContext(OpenContext);
  return (
    <Table bordered={false} flush>
      <TableHead>
        <TableRow>
          <TableHeader>Question</TableHeader>
          <TableHeader width={120}>Status</TableHeader>
          <TableHeader width={120}>{`Needed by ${stageName(stage)}`}</TableHeader>
          <TableHeader width={80}> </TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {states.map((s) => (
          <TableRow key={s.q.n}>
            <TableCell>
              <Flex direction="column" gap="flush">
                <Text format={{ fontWeight: 'demibold' }}>{`${s.q.n}. ${s.q.question}`}</Text>
                <Text variant="microcopy">{`Ask: ${s.q.whoToAsk.join(', ')}`}</Text>
              </Flex>
            </TableCell>
            <TableCell>
              <StatusTag variant={LEVEL_VARIANT[s.level]}>{LEVEL_LABELS[s.level]}</StatusTag>
            </TableCell>
            <TableCell>
              <Text variant="microcopy">{s.needed ? LEVEL_LABELS[s.needed] : 'Later'}</Text>
            </TableCell>
            <TableCell>
              <Button
                size="xs"
                variant={s.short ? 'primary' : 'secondary'}
                onClick={() => open(s.q.n)}
              >
                Open
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function QuestionDetail({
  state,
  stage,
  industry,
  ratio,
  onBack,
  onPrev,
  onNext,
  position,
}: {
  state: QuestionState;
  stage: number;
  industry: IndustryCode | null;
  ratio: number | null;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  position: string;
}) {
  const { q, level, needed } = state;
  const ways = STYLE_TABS.filter((t) => q.ways[t.key].length);
  return (
    <Flex direction="column" gap="sm">
      <Flex direction="row" gap="sm" align="center" justify="between" wrap="wrap">
        <Button size="sm" variant="transparent" onClick={onBack}>
          ← All questions
        </Button>
        <Flex direction="row" gap="xs" align="center">
          {position && <Text variant="microcopy">{position}</Text>}
          <Button size="sm" variant="secondary" disabled={!onPrev} onClick={onPrev}>
            Previous
          </Button>
          <Button size="sm" variant="primary" disabled={!onNext} onClick={onNext}>
            Next
          </Button>
        </Flex>
      </Flex>
        <Tile>
          <Flex direction="column" gap="sm">
            <Heading>{`${q.n}. ${q.question}`}</Heading>
            <Flex direction="row" gap="xs" wrap="wrap" align="center">
              <StatusTag variant={LEVEL_VARIANT[level]}>{LEVEL_LABELS[level]}</StatusTag>
              <Tag variant={state.short ? 'warning' : 'default'}>
                {needed ? `Needs ${LEVEL_LABELS[needed]} by ${stageName(stage)}` : `Not due at ${stageName(stage)}`}
              </Tag>
              <Tag>{q.topic}</Tag>
              {q.key && <Tag variant="info">Key question</Tag>}
              {q.theirWords && <Tag variant="info">Their words needed</Tag>}
            </Flex>
            <Text>{q.why}</Text>
            <SectionTitle icon="contact">Who to ask</SectionTitle>
            <WhoToAsk names={q.whoToAsk} industry={industry} />
          </Flex>
        </Tile>

        <Tile>
          <Flex direction="column" gap="sm">
            <SectionTitle icon="edit">Record it</SectionTitle>
            <Text variant="microcopy">
              Not discussed · Touched on (mentioned, no number, or not from the right person) · Answered (their
              words, a number where needed, from the right person, with a source) · Confirmed (backed by a document
              or a second person).
            </Text>
            <CrmPropertyList properties={q.properties.slice(0, 24)} direction="column" />
            {q.n === 23 && <ValueToCost ratio={ratio} />}
          </Flex>
        </Tile>

        <Tile>
          <Flex direction="column" gap="sm">
            <SectionTitle icon="tasks">{`Details to capture · ${state.detailsDone} of ${q.details.length}`}</SectionTitle>
            <DetailsChecklist state={state} />
          </Flex>
        </Tile>

        {ways.length > 0 && (
          <Tile>
            <Flex direction="column" gap="sm">
              <SectionTitle icon="questionAnswer">Ways to ask</SectionTitle>
              <Text variant="microcopy">Start with the open question. Use the others when the answer is thin or guarded.</Text>
              <Tabs defaultSelected={ways[0].key} variant="default">
                {ways.map((t) => (
                  <Tab key={t.key} tabId={t.key} title={t.title}>
                    <List variant="unordered-styled">
                      {q.ways[t.key].map((w, i) => (
                        <Text key={i}>{w}</Text>
                      ))}
                    </List>
                  </Tab>
                ))}
              </Tabs>
            </Flex>
          </Tile>
        )}

        <Tile>
          <Flex direction="column" gap="sm">
            {q.listenFor && (
              <Alert title="Listen for" variant="tip">
                <Text>{q.listenFor}</Text>
              </Alert>
            )}
            {q.redFlag && (
              <Alert title="Red flag" variant="danger">
                <Text>{q.redFlag}</Text>
              </Alert>
            )}
            {q.whyClose && <Text variant="microcopy">{`Why it matters to the close: ${q.whyClose}`}</Text>}
          </Flex>
        </Tile>
    </Flex>
  );
}

function DetailsChecklist({ state }: { state: QuestionState }) {
  return (
    <Flex direction="column" gap="xs">
      {state.q.details.map((d) => {
        const done = state.checked.has(d.value);
        return (
          <Flex key={d.value} direction="row" gap="xs" align="start">
            <Icon name={done ? 'success' : 'circleHollow'} size="sm" color={done ? 'success' : 'inherit'} />
            <Text>{d.label}</Text>
          </Flex>
        );
      })}
      <Text variant="microcopy">Tick details in the "details captured" field above.</Text>
    </Flex>
  );
}

function ValueToCost({ ratio }: { ratio: number | null }) {
  return ratio === null ? (
    <Text variant="microcopy">Fill in annual value and first-year cost to see the value-to-cost ratio.</Text>
  ) : (
    <Tag variant={ratio >= 3 ? 'success' : ratio >= 1 ? 'warning' : 'error'}>{`Value-to-cost ${ratio.toFixed(1)}×`}</Tag>
  );
}

function WhoToAsk({ names, industry }: { names: string[]; industry: IndustryCode | null }) {
  return (
    <Flex direction="column" gap="xs">
      {names.map((name) => {
        const persona = PERSONAS.find((p) => p.who === name);
        const titles = persona && (industry ? persona.titles[industry] : '');
        return (
          <Flex key={name} direction="row" gap="xs" align="center" wrap="wrap">
            <Tag>{name}</Tag>
            {titles && <Text variant="microcopy">{titles}</Text>}
          </Flex>
        );
      })}
    </Flex>
  );
}

function PersonaSection({
  persona,
  states,
  stage,
  industry,
}: {
  persona: (typeof PERSONAS)[number];
  states: QuestionState[];
  stage: number;
  industry: IndustryCode | null;
}) {
  const byText = (t: string) => states.find((s) => s.q.question === t && s.applies);
  const leads = persona.leads.map(byText).filter(Boolean) as QuestionState[];
  const also = persona.also.map(byText).filter(Boolean) as QuestionState[];
  const shortCount = leads.filter((s) => s.short).length;
  const titles = industry ? persona.titles[industry] : [persona.titles.L, persona.titles.M, persona.titles.R].filter(Boolean).join(' · ');
  return (
    <Accordion title={`${persona.who}${shortCount ? ` · ${shortCount} short` : ''}`} size="sm">
      <Flex direction="column" gap="sm">
        {titles && <Text variant="microcopy">{`Titles: ${titles}`}</Text>}
        {leads.length > 0 && <QuestionTable states={leads} stage={stage} industry={industry} />}
        {also.length > 0 && (
          <Flex direction="column" gap="xs">
            <Text format={{ fontWeight: 'demibold' }}>Also ask them</Text>
            <QuestionTable states={also} stage={stage} industry={industry} />
          </Flex>
        )}
        {persona.dontAsk && (
          <Alert title="Don't ask them about" variant="warning">
            <Text>{persona.dontAsk}</Text>
          </Alert>
        )}
      </Flex>
    </Accordion>
  );
}

function CloseSignals({ signals, points, band }: { signals: CloseSignal[]; points: number; band: Band }) {
  return (
    <Flex direction="column" gap="sm">
      <Table bordered={false} flush>
        <TableHead>
          <TableRow>
            <TableHeader>Signal</TableHeader>
            <TableHeader width={80}>Points</TableHeader>
            <TableHeader width={100}>Met</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {signals.map((s) => (
            <TableRow key={s.signal}>
              <TableCell>
                <Flex direction="column" gap="flush">
                  <Text format={{ fontWeight: 'demibold' }}>{s.signal}</Text>
                  <Text variant="microcopy">{`${s.from}. ${s.evidence}`}</Text>
                </Flex>
              </TableCell>
              <TableCell>
                <Text>{String(s.points)}</Text>
              </TableCell>
              <TableCell>
                {s.met ? <StatusTag variant="success">Yes</StatusTag> : <StatusTag variant="default">Not yet</StatusTag>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Flex direction="row" gap="xs" align="center" wrap="wrap">
        <Text format={{ fontWeight: 'demibold' }}>{`${points} of 100 points`}</Text>
        <Tag variant={BAND_VARIANT[band]}>{band}</Tag>
      </Flex>
      <Text variant="microcopy">
        High 60+ · Medium 30–59 · Low 0–29 · At risk when something should stop us with no fix, whatever the points.
        Weights are directional, set from Win-Loss lift.
      </Text>
    </Flex>
  );
}

function topics(states: QuestionState[]): [string, QuestionState[]][] {
  const map = new Map<string, QuestionState[]>();
  for (const s of states) {
    if (!s.applies) continue;
    map.set(s.q.topic, [...(map.get(s.q.topic) ?? []), s]);
  }
  return Array.from(map.entries());
}

function topicTitle(topic: string, list: QuestionState[]): string {
  const due = list.filter((s) => s.needed > 0);
  const short = due.filter((s) => s.short).length;
  return short ? `${topic} · ${short} short` : `${topic} · on track`;
}

function nextStageText(states: QuestionState[], stage: number): string {
  if (stage >= 5) return 'This is the last stage. Keep sources up to date.';
  const next = states.filter((s) => s.applies && (s.q.needed[stage] ?? 0) > s.level).length;
  return next
    ? `${stageName(stage + 1)} needs ${next} more question${next === 1 ? '' : 's'} at a higher level.`
    : `${stageName(stage + 1)} is covered too.`;
}

