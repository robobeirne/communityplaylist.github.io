/**
 * Turns one call's assessment into CRM writes, with the rules applied in code rather than left to the model.
 *
 * The model proposes; this file decides. Every rule here comes from the Opportunity Workbench:
 *   - only buyer words count, and every quote must actually appear in the transcript
 *   - "told and nodded" (agreed_with_us) never goes above Touched on
 *   - wrong person (not who it must come from) never goes above Touched on
 *   - Confirmed needs two different buyers across the deal's calls
 *   - low confidence never goes above Touched on
 *   - a contradiction freezes the level and is flagged, it doesn't overwrite
 *   - levels never go down automatically; a rep's change sticks until newer evidence beats it
 */

export const LV = ['not_discussed', 'touched_on', 'answered', 'confirmed'];
const rank = (l) => Math.max(0, LV.indexOf(l));
const PROV_RANK = { volunteered: 0, answered_when_asked: 1, agreed_with_us: 2 };
const MAX_EVIDENCE = 3;
const MAX_STATE_CHARS = 60000; // HubSpot multi-line text holds 65,536

const norm = (s) => String(s ?? '').toLowerCase().replace(/[“”"‘’'`.,!?;:()\-–—]/g, ' ').replace(/\s+/g, ' ').trim();

/** A quote is real if every "…"-separated piece appears in the cited segment (or, failing that, anywhere). */
export function quoteIsReal(quote, segments, idx) {
  const pieces = String(quote).split(/…|\.\.\./).map(norm).filter((p) => p.length >= 4);
  if (!pieces.length) return false;
  const inSeg = (t) => pieces.every((p) => norm(t).includes(p));
  return (segments[idx] && inSeg(segments[idx].text)) || segments.some((s) => inSeg(s.text));
}

export function emptyState() {
  return { v: 1, updated: null, meetings: [], q: {}, overrides: {} };
}

export function parseState(raw) {
  try {
    const s = JSON.parse(raw || '');
    return s && s.v === 1 ? { ...emptyState(), ...s } : emptyState();
  } catch {
    return emptyState();
  }
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * @param {object} a
 * @param {object} a.rubric        rubric.json
 * @param {string} a.industry      'L' | 'M' | 'R'
 * @param {object} a.state         parsed da_ai_assessment
 * @param {object} a.meeting       { uuid, date, subject, url }
 * @param {Array}  a.people        [{ email, name, title, role, is_rep }]
 * @param {Array}  a.segments      [{ speaker_email, text }]
 * @param {object} a.output        the model's JSON (schema.json)
 * @param {object} a.current       current deal property values (for details union)
 * @returns {{ state, properties, log }}
 */
export function merge({ rubric, industry, state, meeting, people, segments, output, current = {} }) {
  const log = [];
  const S = structuredClone(state);
  if (S.meetings.some((m) => m.uuid === meeting.uuid)) {
    return { state: S, properties: {}, log: [`skip: meeting ${meeting.uuid} already assessed`] };
  }
  const byEmail = Object.fromEntries(people.map((p) => [p.email.toLowerCase(), p]));
  const isBuyer = (email) => {
    const p = byEmail[String(email).toLowerCase()];
    return p ? !p.is_rep : !/@protex\.ai$/i.test(email);
  };
  const Q = Object.fromEntries(rubric.questions.map((q) => [q.id, q]));
  const props = {};

  for (const o of output.questions ?? []) {
    const q = Q[o.id];
    if (!q) { log.push(`drop ${o.id}: not in rubric`); continue; }
    if (q.industry !== 'All' && q.industry !== industry) { log.push(`drop ${o.id}: other industry`); continue; }

    // 1. Evidence must be the buyer's, and must really be in the transcript.
    const ev = (o.evidence ?? []).filter((e) => {
      if (!isBuyer(e.speaker_email)) { log.push(`${o.id}: dropped a quote from a Protex speaker`); return false; }
      if (!quoteIsReal(e.quote, segments, e.segment)) { log.push(`${o.id}: dropped a quote not found in the transcript`); return false; }
      return true;
    }).map((e) => {
      const p = byEmail[e.speaker_email.toLowerCase()] ?? {};
      return { quote: e.quote.slice(0, 300), who: p.name ?? e.speaker_email, title: p.title ?? '', role: p.role ?? '', email: e.speaker_email.toLowerCase(),
               prov: e.provenance, date: meeting.date, meeting: meeting.uuid };
    });
    if (!ev.length) { log.push(`${o.id}: nothing verifiable from the buyer, not recorded`); continue; }

    // 2. Caps.
    const prev = S.q[o.id];
    let cap = rank(o.level);
    const why = [];
    if (ev.every((e) => e.prov === 'agreed_with_us')) { cap = Math.min(cap, 1); why.push('buyer only agreed with our framing'); }
    if (q.must_come_from?.length && !ev.some((e) => q.must_come_from.includes(e.role))) {
      cap = Math.min(cap, 1); why.push(`not yet from ${q.must_come_from.join(' or ')}`);
    }
    if (q.verbatim_required && !ev.some((e) => e.prov !== 'agreed_with_us')) { cap = Math.min(cap, 1); why.push('needs their own words'); }
    const buyers = new Set([...ev, ...(prev?.evidence ?? [])].map((e) => e.email));
    if (cap >= 3 && buyers.size < 2) { cap = 2; why.push('Confirmed needs a second person'); }
    if (o.confidence === 'low') { cap = Math.min(cap, 1); why.push('low confidence'); }

    // 3. Never down automatically; contradictions freeze; a newer rep change is the floor.
    const ov = S.overrides[o.id];
    const priorRank = ov && (!prev || ov.at > prev.at) ? rank(ov.level) : rank(prev?.level);
    let level = Math.max(priorRank, cap);
    if (o.contradicts) { level = priorRank; why.push('contradicts an earlier call, held for review'); }

    // 4. Keep the three best pieces of evidence across calls.
    const evidence = [...ev, ...(prev?.evidence ?? [])]
      .sort((a, b) => (q.must_come_from?.includes(b.role) - q.must_come_from?.includes(a.role)) || (PROV_RANK[a.prov] - PROV_RANK[b.prov]) || (b.date > a.date ? 1 : -1))
      .slice(0, MAX_EVIDENCE);

    const allowed = new Set(q.details.filter((d) => !d.industry || d.industry === industry).map((d) => d.value));
    const details = [...new Set([...(prev?.details ?? []), ...(o.details ?? []).filter((v) => allowed.has(v))])];

    S.q[o.id] = {
      level: LV[level], by: 'ai', at: meeting.date, meeting: meeting.uuid,
      why: [o.why_level, ...why].filter(Boolean).join(' · ').slice(0, 400),
      summary: o.summary, evidence, details,
      numbers: [...(o.numbers ?? []), ...(prev?.numbers ?? [])].slice(0, 6),
      missing: o.missing ?? [], ask: o.next_ask ?? null, conf: o.confidence,
      ...(o.contradicts ? { contra: o.contradicts } : {}),
    };
    if (prev && rank(prev.level) !== level) log.push(`${o.id}: ${prev.level} → ${LV[level]}`);
    else if (!prev) log.push(`${o.id}: ${LV[level]}`);

    // 5. The deal properties reports and lists use.
    const top = evidence.slice(0, 2).map((e) => `“${e.quote}” — ${e.who}${e.title ? `, ${e.title}` : ''}, ${fmtDate(e.date)}`).join('\n');
    props[q.hubspot.status] = LV[level];
    props[q.hubspot.notes] = [o.summary, top].filter(Boolean).join('\n\n');
    const lead = evidence[0];
    props[q.hubspot.source] = `${lead.who}${lead.title ? ` (${lead.title})` : ''} · ${meeting.subject} · ${fmtDate(lead.date)} · ${meeting.url}`;
    if (details.length) props[q.hubspot.details] = details.join(';');
  }

  // Stop signals only ever add ticks; clearing them is a person's call.
  const stopQ = Q.stop;
  if (stopQ && output.stop_signals?.length) {
    const valid = new Set(stopQ.details.map((d) => d.value));
    const had = String(current[stopQ.hubspot.details] ?? '').split(';').filter(Boolean);
    const add = output.stop_signals.filter((v) => valid.has(v) && !had.includes(v));
    if (add.length) { props[stopQ.hubspot.details] = [...had, ...add].join(';'); log.push(`stop signals added: ${add.join(', ')}`); }
  }

  S.meetings = [{ uuid: meeting.uuid, date: meeting.date, subject: meeting.subject, summary: output.call_summary }, ...S.meetings].slice(0, 25);
  S.updated = new Date().toISOString();
  let json = JSON.stringify(S);
  // Trim oldest evidence until it fits HubSpot's limit.
  while (json.length > MAX_STATE_CHARS) {
    const longest = Object.values(S.q).sort((a, b) => b.evidence.length - a.evidence.length)[0];
    if (!longest || longest.evidence.length <= 1) break;
    longest.evidence.pop();
    json = JSON.stringify(S);
  }
  props.da_ai_assessment = json;
  props.da_ai_last_meeting = meeting.url;
  props.da_ai_last_run = S.updated;
  return { state: S, properties: props, log };
}

/** Role from a job title. Deliberately simple; the model can suggest a better one in `people`. */
export function roleFromTitle(title = '') {
  const t = title.toLowerCase();
  if (/\b(ceo|coo|cfo|chief|president|svp|evp|general manager)\b/.test(t)) return 'exec';
  if (/\b(it|ot|network|infrastructure|cio|cto|cyber|information security|systems)\b/.test(t)) return 'it';
  if (/(security|loss prevention|asset protection|facilities)/.test(t)) return 'security';
  if (/(finance|risk|insurance|procurement|controller)/.test(t)) return 'finance';
  if (/(hr|human resources|people|legal|counsel|works council|union|employee relations)/.test(t)) return 'people';
  if (/(ehs|hse|she\b|safety|health)/.test(t)) return /(vp|vice president|director|head|group|global|corporate|chief)/.test(t) ? 'sponsor' : 'operator';
  if (/(operations|plant|production|manufacturing|site manager|warehouse|distribution|logistics|supply chain|engineering)/.test(t)) return /(vp|vice president|svp)/.test(t) ? 'exec' : 'ops';
  return '';
}
