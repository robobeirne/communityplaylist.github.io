/**
 * Discovery assessor runner: Avoma → Claude → HubSpot. Run on a schedule (every 30–60 minutes).
 *
 *   AVOMA_API_KEY, ANTHROPIC_API_KEY, HUBSPOT_TOKEN   required
 *   ASSESSOR_MODEL                                    the Claude model id to use (pick the current Opus or Sonnet)
 *   LOOKBACK_HOURS (default 48)  DRY_RUN=1 prints the writes instead of making them
 *
 * HubSpot private app scopes: crm.objects.deals.read/write, crm.objects.contacts.read.
 * Re-running is safe: each deal's da_ai_assessment remembers which meetings it has already assessed.
 */
import fs from 'node:fs';
import { merge, parseState, roleFromTitle } from './merge.mjs';

const CFG = {
  // Avoma meeting purposes that are sales conversations. Check-ins and operations reviews are customer success.
  purposes: ['Discovery', 'Joint Technical Kickoff', 'Demo', 'Deep Dive', 'Business Case', 'Executive Alignment', 'Proposal', 'Negotiation'],
  // New-business pipelines and their stages → assessment stage 1–5 (Discovery … Legal & Procurement). Fill from HubSpot pipeline settings.
  // Same mapping as src/app/cards/discovery/score.ts (STAGE_BY_ID): the approval stages count as the stage being approved.
  stages: {
    // New Business Pipeline
    '54122954': 1, qualifiedtobuy: 2, '5429849309': 3, presentationscheduled: 3, '53854163': 4, '5480272085': 5, '559437043': 5,
    // Partner - Kroninn
    '2433175742': 1, '2433175743': 2, '2426213608': 3, '2433175745': 3, '2433175746': 4, '2433175747': 5,
    // Z - Testing Pipeline
    '3575507176': 1, '3575507177': 2, '3575507178': 3, '3575507179': 3, '3575507180': 4, '3575507181': 5, '3510524134': 5,
  },
  industry: { logistics: 'L', manufacturing: 'M', retail: 'R' },
  lookbackHours: Number(process.env.LOOKBACK_HOURS ?? 48),
  dryRun: process.env.DRY_RUN === '1',
};
const RUBRIC = JSON.parse(fs.readFileSync(new URL('./rubric.json', import.meta.url)));
const PROMPT = fs.readFileSync(new URL('./prompt.md', import.meta.url), 'utf8');
const SCHEMA = JSON.parse(fs.readFileSync(new URL('./schema.json', import.meta.url)));

async function http(url, opts = {}, tries = 3) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, opts);
    if (res.ok) return res.status === 204 ? null : res.json();
    if (i >= tries || ![429, 500, 502, 503, 529].includes(res.status)) throw new Error(`${res.status} ${url}: ${(await res.text()).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 1500 * i));
  }
}

/* ---------- Avoma ---------- */
const AV = { headers: { Authorization: `Bearer ${process.env.AVOMA_API_KEY}` } };
async function* completedMeetings(fromIso, toIso) {
  let url = `https://api.avoma.com/v1/meetings/?from_date=${encodeURIComponent(fromIso)}&to_date=${encodeURIComponent(toIso)}&meeting_state=completed&include_crm_associations=true&page_size=10`;
  while (url) {
    const page = await http(url, AV);
    for (const m of page.results ?? []) yield m;
    url = page.next;
  }
}
// Confirm the path against Avoma's API reference; the MCP returns { speakers:[{id,name,email,is_rep}], segments:[{speaker_id,text}] }.
async function transcript(m) {
  const t = await http(`https://api.avoma.com/v1/transcriptions/${m.transcription_uuid}/`, AV);
  const sp = Object.fromEntries((t.speakers ?? []).map((s) => [s.id, s]));
  return {
    speakers: t.speakers ?? [],
    segments: (t.segments ?? t.transcript ?? []).map((s) => ({ speaker_email: sp[s.speaker_id]?.email ?? '', speaker: sp[s.speaker_id]?.name ?? '', text: s.text })),
  };
}

/* ---------- HubSpot ---------- */
const HS = { headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' } };
const DEAL_PROPS = ['dealname', 'dealstage', 'pipeline', 'da_industry', 'da_ai_assessment', 'da_stop_details'];
const getDeal = (id) => http(`https://api.hubapi.com/crm/v3/objects/deals/${id}?properties=${DEAL_PROPS.join(',')}`, HS);
async function contactsByEmail(emails) {
  if (!emails.length) return [];
  const body = { filterGroups: [{ filters: [{ propertyName: 'email', operator: 'IN', values: emails }] }], properties: ['email', 'firstname', 'lastname', 'jobtitle'], limit: 100 };
  return (await http('https://api.hubapi.com/crm/v3/objects/contacts/search', { ...HS, method: 'POST', body: JSON.stringify(body) })).results ?? [];
}
const patchDeal = (id, properties) => http(`https://api.hubapi.com/crm/v3/objects/deals/${id}`, { ...HS, method: 'PATCH', body: JSON.stringify({ properties }) });

/* ---------- Claude ---------- */
async function assess({ industry, stage, state, people, segments }) {
  const rubric = RUBRIC.questions
    .filter((q) => q.industry === 'All' || q.industry === industry)
    .map(({ due_by_stage, hubspot, ...q }) => ({ ...q, details: q.details.filter((d) => !d.industry || d.industry === industry) }));
  const current = Object.fromEntries(Object.entries(state.q).map(([id, s]) => [id, { level: s.level, summary: s.summary, missing: s.missing }]));
  const input = {
    rubric, roles: RUBRIC.roles,
    deal: { industry, stage, current },
    people,
    transcript: segments.map((s, i) => ({ n: i, speaker_email: s.speaker_email, speaker: s.speaker, text: s.text })),
  };
  const res = await http('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ASSESSOR_MODEL,
      max_tokens: 16000,
      system: PROMPT,
      tools: [{ name: 'record_assessment', description: 'Record the discovery assessment for this call.', input_schema: SCHEMA }],
      tool_choice: { type: 'tool', name: 'record_assessment' },
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    }),
  });
  const call = res.content.find((c) => c.type === 'tool_use');
  if (!call) throw new Error('No assessment returned');
  return call.input;
}

/* ---------- main ---------- */
async function main() {
  const to = new Date(), from = new Date(to - CFG.lookbackHours * 3600e3);
  for await (const m of completedMeetings(from.toISOString(), to.toISOString())) {
    if (m.is_internal || !m.transcript_ready || !CFG.purposes.includes(m.purpose?.label)) continue;
    const dealIds = (m.crm_association ?? []).filter((a) => a.crm_obj_type === 'oppo').map((a) => a.crm_obj_id);
    if (!dealIds.length) continue;
    const t = await transcript(m);
    const emails = [...new Set(t.speakers.filter((s) => !s.is_rep && s.email).map((s) => s.email.toLowerCase()))];
    const contacts = await contactsByEmail(emails);
    const people = t.speakers.map((s) => {
      const c = contacts.find((x) => x.properties.email?.toLowerCase() === s.email?.toLowerCase());
      const title = c?.properties.jobtitle ?? '';
      return { email: (s.email ?? '').toLowerCase(), name: s.name, title, is_rep: !!s.is_rep, role: s.is_rep ? 'protex' : roleFromTitle(title) };
    });

    for (const id of dealIds) {
      const deal = await getDeal(id);
      const p = deal.properties;
      const stage = CFG.stages[p.dealstage];
      if (!stage) continue; // not a new-business deal
      const industry = CFG.industry[p.da_industry] ?? null;
      if (!industry) { console.log(`deal ${id}: industry not set, skipped`); continue; }
      const state = parseState(p.da_ai_assessment);
      if (state.meetings.some((x) => x.uuid === m.uuid)) continue;

      const output = await assess({ industry, stage, state, people, segments: t.segments });
      const { properties, log } = merge({
        rubric: RUBRIC, industry, state, people, segments: t.segments, output, current: p,
        meeting: { uuid: m.uuid, date: m.start_at.endsWith('Z') ? m.start_at : `${m.start_at}Z`, subject: m.subject, url: m.url },
      });
      console.log(`deal ${id} (${p.dealname}) ← ${m.subject}\n  ${log.join('\n  ')}`);
      if (CFG.dryRun) console.log(JSON.stringify(properties, null, 1).slice(0, 4000));
      else if (Object.keys(properties).length) await patchDeal(id, properties);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
