// Changes to the contract wording for one deal, and the client's redline rounds.
//
// Anyone can amend a clause (or remove it) for a deal; the amendment replaces the clause on that
// deal's order form. Amendments made by a legal editor count as approved; anyone else's need Legal
// approval through the Approval box. When a client sends the order form back marked up, the rep
// or legal logs a redline round (with a link to the client's file); amendments made while that
// round is open are logged against it. An open round blocks sending until it's resolved.
//
// Stored on the deal in of_amendments (JSON); a readable summary goes in of_amendment_summary.

import type { Values } from './calc.ts';

export interface Amendment {
  clauseId: string;
  /** How the clause is labelled on the order form when amended, e.g. "3D" or "S1 Pilot exit". */
  label?: string;
  /** The wording for this deal (markers like **bold** allowed). Ignored if removed. */
  text: string;
  removed?: boolean;
  reason: string;
  source: 'client' | 'protex';
  /** Made by a legal editor, so it counts as approved. */
  byLegal: boolean;
  by: string;
  at: string;
  round?: number;
}

export interface HistoryEntry {
  clauseId: string;
  clauseLabel: string;
  action: 'amended' | 'removed' | 'reverted' | 'rejected';
  text?: string;
  reason?: string;
  source?: 'client' | 'protex';
  by: string;
  at: string;
  round?: number;
}

export interface Round {
  n: number;
  receivedAt: string;
  loggedBy: string;
  link?: string;
  note?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface AmendmentRecord {
  amendments: Amendment[];
  history: HistoryEntry[];
  rounds: Round[];
}

const EMPTY: AmendmentRecord = { amendments: [], history: [], rounds: [] };

export function readAmendments(v: Values): AmendmentRecord {
  try {
    const r = JSON.parse(String(v.of_amendments || ''));
    if (!r || typeof r !== 'object') return { ...EMPTY };
    return {
      amendments: Array.isArray(r.amendments) ? r.amendments : [],
      history: Array.isArray(r.history) ? r.history : [],
      rounds: Array.isArray(r.rounds) ? r.rounds : [],
    };
  } catch {
    return { ...EMPTY, amendments: [], history: [], rounds: [] };
  }
}

export const amendmentFor = (v: Values, clauseId: string) => readAmendments(v).amendments.find((a) => a.clauseId === clauseId);
export const openRound = (rec: AmendmentRecord) => rec.rounds.find((r) => !r.resolvedAt);

/** Short stable hash, so an approval covers exactly the wording that was approved. */
export function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Record or replace this deal's amendment to a clause, and log it. */
export function amend(
  rec: AmendmentRecord,
  a: Omit<Amendment, 'round' | 'at'> & { clauseLabel: string },
  now = new Date().toISOString(),
): AmendmentRecord {
  const round = a.source === 'client' ? openRound(rec)?.n : undefined;
  const { clauseLabel, ...rest } = a;
  const amendment: Amendment = { ...rest, label: clauseLabel, at: now, ...(round ? { round } : {}) };
  return {
    ...rec,
    amendments: [...rec.amendments.filter((x) => x.clauseId !== a.clauseId), amendment],
    history: [
      ...rec.history,
      {
        clauseId: a.clauseId,
        clauseLabel,
        action: a.removed ? 'removed' : 'amended',
        ...(a.removed ? {} : { text: a.text }),
        reason: a.reason,
        source: a.source,
        by: a.by,
        at: now,
        ...(round ? { round } : {}),
      },
    ],
  };
}

/** Put a clause back to the standard wording for this deal, and log it. */
export function revert(rec: AmendmentRecord, clauseId: string, clauseLabel: string, by: string, reason = '', now = new Date().toISOString()): AmendmentRecord {
  const round = openRound(rec)?.n;
  return {
    ...rec,
    amendments: rec.amendments.filter((x) => x.clauseId !== clauseId),
    history: [...rec.history, { clauseId, clauseLabel, action: 'reverted', reason, by, at: now, ...(round ? { round } : {}) }],
  };
}

/** Log that a client's requested change was rejected (the clause stays as it is). */
export function rejectChange(rec: AmendmentRecord, clauseId: string, clauseLabel: string, clientAsked: string, reason: string, by: string, now = new Date().toISOString()): AmendmentRecord {
  const round = openRound(rec)?.n;
  return {
    ...rec,
    history: [...rec.history, { clauseId, clauseLabel, action: 'rejected', text: clientAsked, reason, source: 'client', by, at: now, ...(round ? { round } : {}) }],
  };
}

export function logRound(rec: AmendmentRecord, r: { link?: string; note?: string; loggedBy: string }, now = new Date().toISOString()): AmendmentRecord {
  const n = (rec.rounds.reduce((m, x) => Math.max(m, x.n), 0) || 0) + 1;
  return { ...rec, rounds: [...rec.rounds, { n, receivedAt: now, loggedBy: r.loggedBy, ...(r.link ? { link: r.link } : {}), ...(r.note ? { note: r.note } : {}) }] };
}

export function resolveRound(rec: AmendmentRecord, by: string, now = new Date().toISOString()): AmendmentRecord {
  return { ...rec, rounds: rec.rounds.map((r) => (r.resolvedAt ? r : { ...r, resolvedAt: now, resolvedBy: by })) };
}

/** Readable summary for reports: one line per current amendment. */
export function amendmentSummary(rec: AmendmentRecord): string {
  return rec.amendments
    .map((a) => `${a.label || a.clauseId}: ${a.removed ? 'removed' : 'amended'} (${a.source === 'client' ? 'client request' : 'Protex'}${a.round ? `, round ${a.round}` : ''}; ${a.byLegal ? `by legal, ${a.by}` : `proposed by ${a.by}, needs Legal approval`})${a.reason ? ` — ${a.reason}` : ''}`)
    .join('\n');
}
